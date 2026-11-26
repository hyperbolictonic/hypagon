/**
 * A ready-made host over a `BrowserTarget`.
 *
 * The page primitives need more than `evaluate`: marks, frames, harvesting and
 * network capture. This factory wires those package modules to one target, so a
 * host only supplies the input driver (and any optional policy) instead of
 * implementing the whole `PrimitivesHost` surface.
 *
 * The stealth package builds on this with `createHumanizedBrowserHost`, which
 * supplies the humanised pointer/keyboard driver and sealed discovery.
 */
import type { BrowserTarget } from './target.ts';
import type {
  AppIdentity,
  GuardPageReadInput,
  GuardPageReadResult,
  HostMark,
  PageReadRequest,
  PrecheckPageReadResult,
  PrimitivesHost,
  SensitiveGateDetection,
  SealedFindOptions,
  SealedFindResult,
  TransitionRecord,
} from './primitives/contracts.ts';
import { PrimitiveError } from './primitives/contracts.ts';
import { MarksOverlay } from './marks/marks-overlay.ts';
import { ConstructHarvester } from './harvester/markdown.ts';
import { captureComposedDom } from './harvester/dom-serializer.ts';
import { listFrames } from './frames/frames.ts';
import { attachFrameControls } from './frames/inventory.ts';
import { resolveFrameMark } from './frames/frame-marks.ts';
import { evaluateInFrames } from './frames/frame-eval.ts';
import { NetworkInterceptor } from './network/network-interceptor.ts';
import { targetBoxScript, focusControlScript, type TargetBox } from './primitives/dom-targeting.ts';
import { Primitives } from './primitives/primitives.ts';

/** When to use: a host that already has a humanised driver — the act primitives. */
export interface BrowserInputPort {
  click(target: BrowserTarget, point: { x: number; y: number }, options?: { button?: 'left' | 'right' | 'middle'; clickCount?: number }): Promise<void>;
  typeText(target: BrowserTarget, text: string): Promise<void>;
  pressKey(target: BrowserTarget, key: string): Promise<void>;
  moveMouse(target: BrowserTarget, point: { x: number; y: number }): Promise<void>;
  insertText(target: BrowserTarget, text: string): Promise<boolean>;
  pasteText(target: BrowserTarget, text: string): Promise<boolean>;
  clearFocusedField?(target: BrowserTarget): Promise<void>;
}

/** When to use: `createBrowserHost` — the target and the optional host policies. */
export interface BrowserHostOptions {
  target: BrowserTarget;
  /** Optional diagnostics; defaults to dropping messages. */
  log?: (level: 'info' | 'warn' | 'action', message: string) => void;
  /** Required for act's click/type/press; observe/find/read/wait work without it. */
  input?: BrowserInputPort;
  /** The network buffer; `false` disables capture, omitted creates and attaches one. */
  network?: NetworkInterceptor | false;
  appIdentity?: AppIdentity;
  windowFocused?: () => boolean;
  detectSensitiveGate?: (text: string, opts: { url?: string }) => SensitiveGateDetection | null;
  guardPageRead?: (input: GuardPageReadInput) => GuardPageReadResult;
  precheckPageRead?: (input: PageReadRequest) => Promise<PrecheckPageReadResult>;
  findSealed?: (opts: SealedFindOptions) => Promise<SealedFindResult>;
  resolveSealedToken?: (token: string) => Promise<{
    center: { x: number; y: number };
    rect: { x: number; y: number; width: number; height: number };
    frameId: string;
  } | null>;
  recordTransition?: (record: TransitionRecord) => void;
}

function noLog(): void {
  // A library host is silent unless the caller asks for diagnostics.
}

function centreOf(mark: HostMark): { x: number; y: number } {
  return mark.center ?? {
    x: Math.round(mark.rect.x + mark.rect.width / 2),
    y: Math.round(mark.rect.y + mark.rect.height / 2),
  };
}

/** When to use: the app/consumer constructing a host for one target. */
export function createBrowserHost(options: BrowserHostOptions): PrimitivesHost {
  const target = options.target;
  const log = options.log ?? noLog;
  const marks = new MarksOverlay();
  const harvester = new ConstructHarvester();
  let title = '';
  let revision = 0;

  const network = options.network === false ? undefined : options.network ?? new NetworkInterceptor();
  network?.attach(target);

  const bump = (): number => {
    revision += 1;
    return revision;
  };

  async function refreshTitle(): Promise<string> {
    const next = await target.evaluate<string>('document.title').catch(() => '');
    if (typeof next === 'string' && next.trim()) title = next.trim();
    return title;
  }

  function requireInput(): BrowserInputPort {
    if (!options.input) {
      throw new PrimitiveError(
        'NOT_SUPPORTED',
        'This host has no input driver. Pass `input` (for example the stealth HumanizedInput adapter) to click, type or press.',
      );
    }
    return options.input;
  }

  async function markTarget(id: number): Promise<{ mark: HostMark; currentCenter: { x: number; y: number } }> {
    const hit = id >= 100 ? await resolveFrameMark(target, id) : await marks.getMarkTarget(target, id);
    if (!hit) {
      throw new PrimitiveError('STALE_REF', `Mark #${id} could not be resolved. Re-run observe/find to refresh refs.`, {
        markId: id,
      });
    }
    return hit;
  }

  async function clickAt(point: { x: number; y: number }): Promise<void> {
    await requireInput().click(target, point);
    bump();
  }

  async function clickElement(selector?: string, coordinates?: { x: number; y: number }): Promise<string> {
    const input = requireInput();
    let point = coordinates;
    let tag = '';
    if (!point && selector) {
      const box = await target.evaluate<TargetBox | null>(targetBoxScript({ selector })).catch(() => null);
      if (!box) throw new PrimitiveError('NO_TARGET', `Selector "${selector}" matched no visible element`, { selector });
      if (box.vw === 0 || box.vh === 0) {
        throw new PrimitiveError(
          'NO_TARGET',
          'The page viewport is 0x0, so no target can be resolved — the tab has not been laid out yet.',
          { selector },
        );
      }
      point = { x: box.x, y: box.y };
      tag = box.tag;
      await input.click(target, point);
      await target.evaluate(focusControlScript({ selector })).catch(() => undefined);
    } else if (point) {
      await input.click(target, point);
    } else {
      throw new PrimitiveError('BAD_REQUEST', 'clickElement needs a selector or coordinates.');
    }
    bump();
    return `Clicked ${tag ? `<${tag}>` : 'element'} at (${point.x}, ${point.y})`;
  }

  async function typeText(
    text: string,
    selector?: string,
    opts: { clearFirst?: boolean } = {},
  ): Promise<string> {
    if (selector) await clickElement(selector);
    const input = requireInput();
    if (opts.clearFirst) await input.clearFocusedField?.(target);
    await input.typeText(target, text);
    bump();
    return `Typed ${text.length} character(s)`;
  }

  return {
    log,
    evaluate: (script) => target.evaluate(script),
    revision: () => revision,

    harvest: async (opts) => {
      const composed = await captureComposedDom(target);
      const url = target.url();
      await refreshTitle();
      const construct = harvester.harvest(composed.html, url, title, { shadowRoots: composed.shadowRoots });
      bump();
      return construct;
    },

    injectMarks: async (opts) => {
      const rows = await marks.injectMarks(target, { includeOffscreen: opts?.includeOffscreen === true });
      bump();
      return rows;
    },
    removeMarks: () => marks.removeMarks(target),
    getMarks: () => marks.getActiveMarks(),
    getMarkTarget: (id) => markTarget(id),

    clickMark: async (id) => {
      const hit = await markTarget(id);
      const point = hit.currentCenter;
      await clickAt(point);
      return `Clicked #${id} <${hit.mark.tag}> at (${point.x}, ${point.y})`;
    },
    typeMark: async (id, text, opts) => {
      const hit = await markTarget(id);
      const input = requireInput();
      await input.click(target, hit.currentCenter);
      if (opts?.clearFirst) await input.clearFocusedField?.(target);
      await input.typeText(target, text);
      bump();
      return `Typed ${text.length} character(s) into #${id} <${hit.mark.tag}>`;
    },

    clickElement,
    typeText,

    insertText: (text) => options.input?.insertText(target, text) ?? Promise.resolve(false),
    pasteText: (text) => options.input?.pasteText(target, text) ?? Promise.resolve(false),
    moveMouseTo: async (point) => {
      await requireInput().moveMouse(target, point);
    },
    pressKey: async (key) => {
      await requireInput().pressKey(target, key);
      bump();
      return `Pressed key: ${key}`;
    },

    getFrames: async (opts) => {
      const frames = await listFrames(target, { maxFrames: opts?.maxFrames ?? 8 });
      if (opts?.includeControls === false) return { frames, notes: [] };
      const withControls = await attachFrameControls(target, frames, {
        maxFrames: opts?.maxFrames,
        includeOffscreen: opts?.includeOffscreen !== false,
      });
      return { frames: withControls, notes: [] };
    },
    evaluateInFrames: (script, opts) =>
      evaluateInFrames(target, script, { maxFrames: opts?.maxFrames, timeoutMs: opts?.timeoutMs }),

    snapshotRenderedPage: async (opts) => {
      if (opts?.format !== 'ax_tree') return { content: '', stats: {} };
      await target.sendCommand('Accessibility.enable').catch(() => undefined);
      const result = await target.sendCommand<{ nodes?: any[] }>('Accessibility.getFullAXTree').catch(() => ({ nodes: [] }));
      const lines = (result.nodes || [])
        .filter((node) => !node.ignored && node.role?.value)
        .slice(0, 2000)
        .map((node) => `${node.role.value}${node.name?.value ? ` "${node.name.value}"` : ''}`);
      return { content: lines.join('\n'), stats: { nodeCount: lines.length } };
    },

    getNetworkTraffic: (filter) => network?.traffic.list(filter) ?? [],
    getPageInfo: () => ({ url: target.url(), title, isLoading: false }),
    windowFocused: options.windowFocused,
    appIdentity: options.appIdentity ? () => options.appIdentity! : undefined,
    detectSensitiveGate: options.detectSensitiveGate,
    guardPageRead: options.guardPageRead,
    precheckPageRead: options.precheckPageRead,
    findSealed: options.findSealed,
    resolveSealedToken: options.resolveSealedToken,
    recordTransition: options.recordTransition,
    componentSurfaceEnabled: () => true,
  };
}

/** When to use: a host plus the `Primitives` facade over one target. */
export function createBrowserTools(options: BrowserHostOptions): { host: PrimitivesHost; primitives: Primitives } {
  const host = createBrowserHost(options);
  return { host, primitives: new Primitives(host) };
}
