/**
 * The identity scan: one AX tree plus one DOM pierce per frame, filtered to nodes that live
 * under a closed shadow root.
 *
 * Closed roots are invisible to page JavaScript but present in the accessibility tree, so the
 * scan pairs `Accessibility.getFullAXTree` with a pierced `DOM.getDocument` and keeps only the
 * backend nodes the pierce marks as closed. OOPIF frames are attached once and reused.
 *
 * When to use: `findSealedControls` on a cache miss — this is the expensive half; geometry is
 * measured separately in `sealed-measure.ts`.
 */
import type { WebContents } from 'electron';
import { INTERACTIVE_ROLES, axProp } from './ax-tree.js';
import { bump } from '../metrics.js';
import type { FrameInfo } from '../browser/frames.js';
import { normalizeSurface, type ComponentSurface } from './component-signature.js';
import { clearSealedTokens } from './sealed-targets.js';
import { createSealedSessions } from './sealed-sessions.js';
import { actionsFor, attributesOf, collectClosed, lower } from './sealed-util.js';
import type { SealedIdentity } from './sealed-types.js';

const MAX_TARGETS = 8;

/** When to use: `findSealedControls` on a cache miss, with the settings already resolved. */
export async function scanSealedIdentities(input: {
  wc: WebContents;
  frames: FrameInfo[];
  componentsEnabled: boolean;
  styleMatch: boolean;
  notes: string[];
}): Promise<SealedIdentity[]> {
  const { wc, frames, notes } = input;
  const styleMatch = input.styleMatch;
  const cdp = createSealedSessions(wc);
  const { send } = cdp;
  const dbg = wc.debugger;
  const axEnabled = new Set<string | undefined>();
  const cssEnabled = new Set<string | undefined>();
  const surfaceCache = new Map<number, ComponentSurface>();
  const styleHeaders = new Map<string, { sourceURL?: string; isConstructed?: boolean }>();
  const onDebugMessage = (...args: any[]) => {
    const method = args[1] || args[0]?.method;
    const params = args[2] || args[0]?.params;
    const header = params?.header;
    if (method === 'CSS.styleSheetAdded' && header?.styleSheetId) {
      styleHeaders.set(String(header.styleSheetId), {
        sourceURL: header.sourceURL ? String(header.sourceURL) : undefined,
        isConstructed: header.isConstructed === true,
      });
    }
  };
  if (styleMatch) (dbg as any).on('message', onDebugMessage);
  clearSealedTokens(wc);
  const docCache = new Map<string, any>();

  const sessionFor = (frame: FrameInfo | undefined): string | undefined => {
    if (!frame?.oopif || !frame.targetId) return undefined;
    return sessions.get(frame.targetId);
  };

  const surfaceFor = async (host: any, session: string | undefined): Promise<ComponentSurface | undefined> => {
    const backend = Number(host?.backendNodeId);
    if (!backend) return undefined;
    const cached = surfaceCache.get(backend);
    if (cached) return cached;

    const attrs = attributesOf(host);
    let cssVars: string[] = [];
    try {
      if (!cssEnabled.has(session)) {
        await send(session, 'CSS.enable');
        cssEnabled.add(session);
      }
      if (host.nodeId) {
        const computed = await send(session, 'CSS.getComputedStyleForNode', { nodeId: host.nodeId });
        cssVars = (computed?.computedStyle || [])
          .map((item: any) => String(item?.name || ''))
          .filter((name: string) => name.startsWith('--'))
          .sort();
      }
    } catch {
      // part/exportparts are still useful without computed custom properties.
    }

    const surface = normalizeSurface({
      tag: host.nodeName,
      defined: true,
      part: String(attrs.part || '').split(/\s+/).filter(Boolean),
      exportparts: String(attrs.exportparts || '').split(','),
      cssVars,
    });
    surfaceCache.set(backend, surface);
    return surface;
  };

  const identities: SealedIdentity[] = [];
  let sessions = new Map<string, string>();
  let opened: string[] = [];
  try {
    // Attach each OOPIF target once. The same session is reused for every frame it hosts.
    const attached = await cdp.attach(frames, { maxTargets: MAX_TARGETS, onAttach: () => bump('cdp.frame') });
    sessions = attached.sessions;
    opened = attached.opened;

    const docs = new Map<number, any>();
    for (let i = 0; i < frames.length; i++) {
      const frame = frames[i];
      try {
        if (frame.depth === 0) {
          if (!docCache.has('main')) {
            bump('cdp.pierce');
            docCache.set('main', (await send(undefined, 'DOM.getDocument', { depth: -1, pierce: true })).root);
          }
          docs.set(i, docCache.get('main'));
          continue;
        }

        const parent = frames.find((f) => f.frameId === frame.parentFrameId);
        const parentSession = sessionFor(parent);
        const owner = await send(parentSession, 'DOM.getFrameOwner', { frameId: frame.frameId });
        if (!owner?.backendNodeId) {
          notes.push(`Frame ${frame.url || frame.frameId} has no owner element.`);
          continue;
        }

        // A same-process child document is reachable through the frame owner's contentDocument;
        // that includes its closed shadow roots. A cross-process child returns no contentDocument,
        // so its own target's document is the root.
        const described = await send(parentSession, 'DOM.describeNode', {
          backendNodeId: owner.backendNodeId,
          depth: -1,
          pierce: true,
        });
        const contentDocument = described?.node?.contentDocument;
        if (contentDocument) {
          docs.set(i, contentDocument);
          continue;
        }

        const ownSession = sessionFor(frame);
        const docKey = ownSession || `frame:${frame.frameId}`;
        if (!docCache.has(docKey)) {
          bump('cdp.pierce');
          docCache.set(docKey, (await send(ownSession, 'DOM.getDocument', { depth: -1, pierce: true })).root);
        }
        docs.set(i, docCache.get(docKey));
      } catch (err: any) {
        notes.push(`Frame ${frame.url || frame.frameId}: ${String(err?.message || err)}`);
      }
    }

    let order = 0;
    for (let i = 0; i < frames.length; i++) {
      const frame = frames[i];
      const root = docs.get(i);
      if (!root) continue;
      const session = sessionFor(frame);

      try {
        if (!axEnabled.has(session)) {
          await send(session, 'Accessibility.enable');
          axEnabled.add(session);
        }
        if (styleMatch && !cssEnabled.has(session)) {
          await send(session, 'CSS.enable').catch(() => undefined);
          cssEnabled.add(session);
          // The styleSheetAdded events for existing sheets are emitted after enable; give them
          // one turn before matched-style lookups.
          await new Promise((resolve) => setTimeout(resolve, 40));
        }
        bump('cdp.ax');
        const ax = await send(session, 'Accessibility.getFullAXTree', { frameId: frame.frameId });
        const closed = collectClosed(root);
        for (const node of ax?.nodes || []) {
          const backend = Number(node?.backendDOMNodeId);
          if (!backend || !closed.ids.has(backend)) continue;
          if (node.ignored) continue;
          const role = lower(node.role?.value);
          if (!INTERACTIVE_ROLES.has(role)) continue;

          const dom = closed.info.get(backend);
          const focusable = axProp(node, 'focusable') === true;
          const component = input.componentsEnabled && dom?.host ? await surfaceFor(dom.host, session) : undefined;
          identities.push({
            backendNodeId: backend,
            frameIndex: i,
            role,
            name: String(node.name?.value || ''),
            nodeName: dom?.nodeName || '',
            actions: actionsFor(role, focusable),
            disabled: axProp(node, 'disabled') === true,
            focusable,
            focused: axProp(node, 'focused') === true,
            order: order++,
            component,
          });
        }
      } catch (err: any) {
        notes.push(`Frame ${frame.url || frame.frameId}: ${String(err?.message || err)}`);
      }
    }

    bump('sealed.scan');
    bump('sealed.nodes', identities.length);

    if (styleMatch && identities.length) {
      const groups = new Map<string | undefined, SealedIdentity[]>();
      for (const identity of identities) {
        const frame = frames[identity.frameIndex];
        const session = sessionFor(frame);
        const bucket = groups.get(session);
        if (bucket) bucket.push(identity);
        else groups.set(session, [identity]);
      }
      for (const [session, list] of groups) {
        try {
          const pushed = await send(session, 'DOM.pushNodesByBackendIdsToFrontend', {
            backendNodeIds: list.map((identity) => identity.backendNodeId),
          });
          const nodeIds: number[] = pushed?.nodeIds || [];
          for (let i = 0; i < list.length; i++) {
            const nodeId = nodeIds[i];
            if (!nodeId) continue;
            const matched = await send(session, 'CSS.getMatchedStylesForNode', { nodeId }).catch(() => null);
            for (const entry of matched?.matchedCSSRules || []) {
              const sheetId = entry?.rule?.styleSheetId;
              const header = sheetId ? styleHeaders.get(String(sheetId)) : undefined;
              if (!header) continue;
              list[i].style = {
                sourceUrl: header.sourceURL || undefined,
                constructed: header.isConstructed === true ? true : undefined,
              };
              break;
            }
          }
        } catch {
          // Provenance is best-effort; the control result is still valid.
        }
      }
      bump('sealed.styleLookups', identities.length);
    }

    if (!identities.length) notes.push('No controls were found inside closed shadow roots.');
  } finally {
    // Release the AX domain promptly; the page cannot see it, but leaving it on is still state.
    for (const session of axEnabled) {
      await send(session, 'Accessibility.disable').catch(() => undefined);
    }
    for (const session of cssEnabled) {
      await send(session, 'CSS.disable').catch(() => undefined);
    }
    if (styleMatch) (dbg as any).removeListener('message', onDebugMessage);
    await cdp.detach(opened);
  }

  return identities;
}
