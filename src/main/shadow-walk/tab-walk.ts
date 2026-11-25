/**
 * Tab walk: enter a closed shadow root the way a keyboard user does.
 *
 * A closed root cannot be focused from page JS, but it is still in the sequential focus order.
 * This module starts on a host element, presses trusted `Tab` (or `Shift+Tab`) a bounded number
 * of times, and reads the accessibility tree after each step to see which node actually received
 * focus. It stops when focus leaves the host's subtree, the step budget is spent, or the page
 * gives up focus.
 *
 * Human-like by construction: one real key event per step, a 90-140 ms dwell, no bursts. It does
 * not click, does not inject scripts, and restores focus to the host if the walk fails.
 *
 * The AX tree is the only reliable focus oracle here: `document.activeElement` retargets to the
 * host of a closed root, while AX reports the inner button/textbox as `focused:true`.
 */
import type { WebContents } from 'electron';
import { bump } from '../metrics.js';
import { axProperty, axRole, contentRect } from './cdp.js';

/** When to use: `tab_walk` — the host selector, direction, cap and restore behaviour. */
export interface TabWalkOptions {
  /** Light-DOM host to start from. */
  selector?: string;
  /** Or a viewport point that hits the host (useful when there is no stable selector). */
  x?: number;
  y?: number;
  direction?: 'forward' | 'backward';
  maxSteps?: number;
  /** Return focus to the host when the walk fails (default true). */
  restore?: boolean;
}

/** When to use: one focus stop in a tab-walk transcript — index, element and whether it is a trap. */
export interface TabWalkStep {
  index: number;
  role: string;
  name: string;
  rect: { x: number; y: number; width: number; height: number };
  /** Time from the key dispatch to the AX read for this step. */
  gapMs: number;
}

/** When to use: the `tab_walk` reply — whether it started, the steps, where it landed and whether focus was restored. */
export interface TabWalkResult {
  started: boolean;
  steps: TabWalkStep[];
  landed: boolean;
  restored: boolean;
  reason: 'left-host' | 'max-steps' | 'no-focus' | 'not-focusable' | 'no-debugger' | 'no-target';
  hostTag?: string;
  medianStepGapMs?: number;
}

const INTERACTIVE = new Set([
  'button',
  'link',
  'textbox',
  'searchbox',
  'combobox',
  'checkbox',
  'radio',
  'switch',
  'tab',
  'menuitem',
  'slider',
  'spinbutton',
]);

const MAX_STEPS = 12;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Focus a CDP node; some hosts (notably with delegatesFocus) reject DOM.focus, so fall back to Runtime.callFunctionOn. */
async function focusHostNode(dbg: any, backendNodeId: number): Promise<boolean> {
  try {
    await dbg.sendCommand('DOM.focus', { backendNodeId });
    return true;
  } catch {
    try {
      const resolved = (await dbg.sendCommand('DOM.resolveNode', { backendNodeId })) as any;
      const objectId = resolved?.object?.objectId;
      if (!objectId) throw new Error('host could not be resolved');
      await dbg.sendCommand('Runtime.callFunctionOn', {
        objectId,
        functionDeclaration: 'function () { this.focus(); }',
        returnByValue: true,
      });
      return true;
    } catch {
      return false;
    }
  }
}

/** The content quad of a CDP node, as an axis-aligned rect; zero rect when the node has no box. */
async function nodeRect(
  send: (method: string, params?: Record<string, unknown>) => Promise<any>,
  backendNodeId: number,
): Promise<{ x: number; y: number; width: number; height: number }> {
  const rect = { x: 0, y: 0, width: 0, height: 0 };
  try {
    const raw = await send('DOM.getBoxModel', { backendNodeId });
    const model = contentRect(raw);
    if (model) return model;
  } catch {
    // A focused node without a box is still a valid focus step; keep the step with a zero rect.
  }
  return rect;
}

/** RootWebArea also claims `focused:true`; it is never the control the user is on. */
function focusedNode(ax: any): any | null {
  const candidates = (ax?.nodes || []).filter(
    (n: any) => !n.ignored && axProperty(n, 'focused') === true && axRole(n) !== 'rootwebarea'
  );
  if (!candidates.length) return null;
  return candidates.find((n: any) => INTERACTIVE.has(axRole(n))) || candidates[0];
}

function collectBackendIds(node: any, out = new Set<number>()): Set<number> {
  if (!node) return out;
  if (node.backendNodeId) out.add(Number(node.backendNodeId));
  for (const child of node.children || []) collectBackendIds(child, out);
  for (const shadow of node.shadowRoots || []) collectBackendIds(shadow, out);
  return out;
}

function median(values: number[]): number | undefined {
  if (!values.length) return undefined;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

/** The host the walk starts from: a selector's node, or whatever sits at x+y. */
async function resolveHost(
  dbg: any,
  options: TabWalkOptions,
): Promise<{ backend: number; tag?: string } | null> {
  try {
    if (options.selector) {
      const doc = (await dbg.sendCommand('DOM.getDocument', { depth: 0 })) as any;
      const queried = (await dbg.sendCommand('DOM.querySelector', {
        nodeId: doc.root.nodeId,
        selector: options.selector,
      })) as any;
      if (!queried?.nodeId) return null;
      const described = (await dbg.sendCommand('DOM.describeNode', { nodeId: queried.nodeId })) as any;
      const backend = Number(described?.node?.backendNodeId) || 0;
      if (!backend) return null;
      return { backend, tag: String(described?.node?.nodeName || '').toLowerCase() };
    }

    const hit = (await dbg.sendCommand('DOM.getNodeForLocation', {
      x: Number(options.x),
      y: Number(options.y),
      includeUserAgentShadowDOM: false,
    })) as any;
    const backend = Number(hit?.backendNodeId) || 0;
    if (!backend) return null;
    const described = (await dbg.sendCommand('DOM.describeNode', { backendNodeId: backend })) as any;
    return { backend, tag: String(described?.node?.nodeName || '').toLowerCase() };
  } catch (err: any) {
    throw Object.assign(new Error(`Could not resolve the focus host: ${err?.message || err}`), { code: 'NO_TARGET' });
  }
}

/** The host's subtree, closed roots included; null when CDP cannot describe it. */
async function hostSubtree(dbg: any, hostBackend: number): Promise<Set<number> | null> {
  // `describeNode(pierce)` sees what page JavaScript cannot.
  try {
    const described = (await dbg.sendCommand('DOM.describeNode', {
      backendNodeId: hostBackend,
      depth: -1,
      pierce: true,
    })) as any;
    return collectBackendIds(described?.node);
  } catch {
    return null;
  }
}

/**
 * A delegatesFocus host is already on its inner control the moment it is focused. That
 * is a real landing, not a Tab step, so it is recorded before the first key press.
 */
async function initialLanding(
  send: (method: string, params?: Record<string, unknown>) => Promise<any>,
  hostBackend: number,
  inside: Set<number>,
): Promise<TabWalkStep | null> {
  bump('cdp.ax');
  const ax = await send('Accessibility.getFullAXTree');
  const initial = focusedNode(ax);
  const backend = Number(initial?.backendDOMNodeId);
  if (!initial || !backend || backend === hostBackend || !inside.has(backend) || !INTERACTIVE.has(axRole(initial))) {
    return null;
  }
  return {
    index: 0,
    role: axRole(initial),
    name: String(initial.name?.value || ''),
    rect: await nodeRect(send, backend),
    gapMs: 0,
  };
}

/** Press Tab (or Shift+Tab) until the budget is spent or focus leaves the host. */
async function walkSteps(args: {
  send: (method: string, params?: Record<string, unknown>) => Promise<any>;
  pressKey: (key: string) => Promise<void>;
  key: string;
  maxSteps: number;
  inside: Set<number>;
}): Promise<{ steps: TabWalkStep[]; reason: TabWalkResult['reason'] }> {
  const { send, pressKey, key, maxSteps, inside } = args;
  const steps: TabWalkStep[] = [];
  let reason: TabWalkResult['reason'] = 'max-steps';

  for (let i = 0; i < maxSteps; i++) {
    const startedAt = Date.now();
    await pressKey(key);
    // A keyboard user pauses between keys; this also gives AX a chance to update.
    await sleep(90 + Math.floor(Math.random() * 50));

    bump('cdp.ax');
    const ax = await send('Accessibility.getFullAXTree');
    const focused = focusedNode(ax);
    if (!focused) {
      reason = 'no-focus';
      break;
    }

    const backend = Number(focused.backendDOMNodeId);
    if (!backend || !inside.has(backend)) {
      reason = 'left-host';
      break;
    }

    steps.push({
      index: i + 1,
      role: axRole(focused),
      name: String(focused.name?.value || ''),
      rect: await nodeRect(send, backend),
      gapMs: Date.now() - startedAt,
    });
    bump('tabwalk.steps');
  }

  return { steps, reason };
}

/**
 * Walk sequential focus from a host.
 * `pressKey` is supplied by the chassis so the same humanized transport is used as `act`.
 *
 * Why it reads as steps: resolving the host, collecting its closed subtree, focusing it,
 * the delegatesFocus landing, the Tab loop and the restore-on-failure are each their own
 * rule, so a change to one cannot perturb the others.
 */
export async function runTabWalk(
  wc: WebContents,
  options: TabWalkOptions,
  pressKey: (key: string) => Promise<void>
): Promise<TabWalkResult> {
  const fail = (reason: TabWalkResult['reason']): TabWalkResult => ({
    started: false,
    steps: [],
    landed: false,
    restored: false,
    reason,
  });

  if (!wc || wc.isDestroyed()) throw Object.assign(new Error('No active tab.'), { code: 'NO_TARGET' });
  const dbg = wc.debugger;
  if (!dbg?.isAttached()) return fail('no-debugger');

  const maxSteps = Math.max(1, Math.min(options.maxSteps ?? 8, MAX_STEPS));
  const direction = options.direction === 'backward' ? 'backward' : 'forward';
  const key = direction === 'backward' ? 'Shift+Tab' : 'Tab';

  if (!options.selector && (options.x === undefined || options.y === undefined)) {
    throw Object.assign(new Error('focus_walk needs a selector or x+y for the host element.'), { code: 'BAD_REQUEST' });
  }

  bump('tabwalk.walks');
  await dbg.sendCommand('DOM.enable');
  await dbg.sendCommand('Page.enable').catch(() => undefined);

  const host = await resolveHost(dbg, options);
  if (!host) return fail('no-target');
  const hostBackend = host.backend;
  const hostTag = host.tag;

  const inside = await hostSubtree(dbg, hostBackend);
  if (!inside) return fail('no-target');

  try {
    if (!(await focusHostNode(dbg, hostBackend))) {
      return { ...fail('not-focusable'), hostTag };
    }
  } catch {
    return { ...fail('not-focusable'), hostTag };
  }

  const send = async (method: string, params: Record<string, unknown> = {}) => dbg.sendCommand(method as any, params as any);
  let axEnabled = false;
  const steps: TabWalkStep[] = [];
  let reason: TabWalkResult['reason'] = 'max-steps';

  try {
    await send('Accessibility.enable');
    axEnabled = true;

    const initial = await initialLanding(send, hostBackend, inside);
    if (initial) steps.push(initial);

    const walked = await walkSteps({ send, pressKey, key, maxSteps, inside });
    steps.push(...walked.steps);
    reason = walked.reason;
  } finally {
    if (axEnabled) await send('Accessibility.disable').catch(() => undefined);
  }

  const landed = steps.length > 0;
  let restored = false;
  if (!landed && options.restore !== false) {
    restored = await focusHostNode(dbg, hostBackend);
  }

  return {
    started: true,
    steps,
    landed,
    restored,
    reason,
    hostTag,
    medianStepGapMs: median(steps.map((s) => s.gapMs)),
  };
}
