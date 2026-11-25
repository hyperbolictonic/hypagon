/**
 * The identity scan: which interactive controls live under a closed shadow root,
 * per frame, plus their roles and states.
 *
 * Why a module: this is the expensive half of sealed discovery — one AX tree and
 * one DOM pierce per frame set, the OOPIF sessions that make cross-process frames
 * readable, and the best-effort fallbacks (component surface, stylesheet
 * provenance). `findSealedControls` only decides whether to run it.
 *
 * The scanner owns one call: it opens what it needs, records a note instead of
 * throwing when a frame cannot be read, and releases every domain and session in
 * `release()`.
 */
import type { WebContents } from 'electron';
import type { FrameInfo } from '../browser/frames.js';
import { bump } from '../metrics.js';
import { normalizeSurface, type ComponentSurface } from './component-signature.js';
import { axProperty, cdpSend } from './cdp.js';
import { attachOopifSessions, detachOopifSessions, sessionOf, type SealedSend } from './sealed-cdp.js';
import { clearSealedTokens } from './sealed-targets.js';
import type { SealedIdentity } from './sealed-types.js';

const INTERACTIVE_ROLES = new Set([
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

const TYPE_ROLES = new Set(['textbox', 'searchbox', 'combobox', 'spinbutton', 'slider']);

/** The actions a control of this role supports, in the tool's vocabulary. */
function actionsFor(role: string, focusable: boolean): string[] {
  if (TYPE_ROLES.has(role)) return ['click', 'type'];
  if (INTERACTIVE_ROLES.has(role)) return ['click'];
  return focusable ? ['focus'] : [];
}

function lower(value: any): string {
  return String(value ?? '').toLowerCase();
}

/** Walk a DOM tree (already pierced) and index everything under a closed shadow root. */
function collectClosed(root: any): {
  ids: Set<number>;
  info: Map<number, { nodeName: string; order: number; host?: any }>;
} {
  const ids = new Set<number>();
  const info = new Map<number, { nodeName: string; order: number; host?: any }>();
  let order = 0;
  const walk = (node: any, insideClosed: boolean, host: any) => {
    if (!node) return;
    if (insideClosed && node.backendNodeId) {
      ids.add(Number(node.backendNodeId));
      info.set(Number(node.backendNodeId), {
        nodeName: String(node.nodeName || '').toUpperCase(),
        order: order++,
        host,
      });
    }
    for (const child of node.children || []) walk(child, insideClosed, host);
    for (const shadow of node.shadowRoots || []) {
      const closed = shadow.shadowRootType === 'closed';
      // The host of a closed root is the node that owns it; nested hosts replace it for their
      // own descendants.
      walk(shadow, insideClosed || closed, closed ? node : host);
    }
  };
  walk(root, false, undefined);
  return { ids, info };
}

function attributesOf(node: any): Record<string, string> {
  const out: Record<string, string> = {};
  const attrs = node?.attributes || [];
  for (let i = 0; i + 1 < attrs.length; i += 2) out[String(attrs[i])] = String(attrs[i + 1]);
  return out;
}

/** When to use: `findSealedControls` — one scan of one frame set. */
export class SealedScanner {
  private readonly wc: WebContents;
  private readonly frames: FrameInfo[];
  private readonly componentsEnabled: boolean;
  private readonly styleMatch: boolean;
  private readonly dbg: any;
  private readonly send: SealedSend;

  private sessions = new Map<string, string>();
  private opened: string[] = [];
  private readonly axEnabled = new Set<string | undefined>();
  private readonly cssEnabled = new Set<string | undefined>();
  private readonly surfaceCache = new Map<number, ComponentSurface>();
  private readonly styleHeaders = new Map<string, { sourceURL?: string; isConstructed?: boolean }>();
  private readonly docCache = new Map<string, any>();
  private readonly docs = new Map<number, any>();
  private readonly identities: SealedIdentity[] = [];
  private readonly notes: string[] = [];

  constructor(wc: WebContents, frames: FrameInfo[], options: { componentsEnabled: boolean; styleMatch: boolean }) {
    this.wc = wc;
    this.frames = frames;
    this.componentsEnabled = options.componentsEnabled;
    this.styleMatch = options.styleMatch;
    this.dbg = wc.debugger;
    this.send = cdpSend(this.dbg);
  }

  /** Run the whole scan; notes carry every frame that could not be read. */
  async scan(): Promise<{ identities: SealedIdentity[]; notes: string[] }> {
    clearSealedTokens(this.wc);
    if (this.styleMatch) this.dbg.on('message', this.onDebugMessage);
    try {
      const attached = await attachOopifSessions(this.send, this.frames);
      this.sessions = attached.sessions;
      this.opened = attached.opened;

      await this.collectDocuments();
      await this.collectIdentities();

      bump('sealed.scan');
      bump('sealed.nodes', this.identities.length);

      if (this.styleMatch && this.identities.length) await this.applyStyles();
      if (!this.identities.length) this.notes.push('No controls were found inside closed shadow roots.');
      return { identities: this.identities, notes: this.notes };
    } finally {
      await this.release();
    }
  }

  /** The stylesheet headers CDP announces, so a matched rule can name its file. */
  private readonly onDebugMessage = (...args: any[]): void => {
    const method = args[1] || args[0]?.method;
    const params = args[2] || args[0]?.params;
    const header = params?.header;
    if (method === 'CSS.styleSheetAdded' && header?.styleSheetId) {
      this.styleHeaders.set(String(header.styleSheetId), {
        sourceURL: header.sourceURL ? String(header.sourceURL) : undefined,
        isConstructed: header.isConstructed === true,
      });
    }
  };

  /**
   * One pierced document per frame. A same-process child is reachable through the
   * frame owner's `contentDocument`; a cross-process child returns none, so its
   * own target's document is the root.
   */
  private async collectDocuments(): Promise<void> {
    for (let i = 0; i < this.frames.length; i++) {
      const frame = this.frames[i];
      try {
        if (frame.depth === 0) {
          if (!this.docCache.has('main')) {
            bump('cdp.pierce');
            const root = (await this.send(undefined, 'DOM.getDocument', { depth: -1, pierce: true })).root;
            this.docCache.set('main', root);
          }
          this.docs.set(i, this.docCache.get('main'));
          continue;
        }

        const parent = this.frames.find((f) => f.frameId === frame.parentFrameId);
        const parentSession = sessionOf(this.sessions, parent);
        const owner = await this.send(parentSession, 'DOM.getFrameOwner', { frameId: frame.frameId });
        if (!owner?.backendNodeId) {
          this.notes.push(`Frame ${frame.url || frame.frameId} has no owner element.`);
          continue;
        }

        const described = await this.send(parentSession, 'DOM.describeNode', {
          backendNodeId: owner.backendNodeId,
          depth: -1,
          pierce: true,
        });
        const contentDocument = described?.node?.contentDocument;
        if (contentDocument) {
          this.docs.set(i, contentDocument);
          continue;
        }

        const ownSession = sessionOf(this.sessions, frame);
        const docKey = ownSession || `frame:${frame.frameId}`;
        if (!this.docCache.has(docKey)) {
          bump('cdp.pierce');
          const root = (await this.send(ownSession, 'DOM.getDocument', { depth: -1, pierce: true })).root;
          this.docCache.set(docKey, root);
        }
        this.docs.set(i, this.docCache.get(docKey));
      } catch (err: any) {
        this.notes.push(`Frame ${frame.url || frame.frameId}: ${String(err?.message || err)}`);
      }
    }
  }

  /** Join the AX tree to the pierced DOM: only nodes inside a closed root survive. */
  private async collectIdentities(): Promise<void> {
    let order = 0;
    for (let i = 0; i < this.frames.length; i++) {
      const frame = this.frames[i];
      const root = this.docs.get(i);
      if (!root) continue;
      const session = sessionOf(this.sessions, frame);

      try {
        if (!this.axEnabled.has(session)) {
          await this.send(session, 'Accessibility.enable');
          this.axEnabled.add(session);
        }
        if (this.styleMatch && !this.cssEnabled.has(session)) {
          await this.send(session, 'CSS.enable').catch(() => undefined);
          this.cssEnabled.add(session);
          // The styleSheetAdded events for existing sheets are emitted after enable; give them
          // one turn before matched-style lookups.
          await new Promise((resolve) => setTimeout(resolve, 40));
        }
        bump('cdp.ax');
        const ax = await this.send(session, 'Accessibility.getFullAXTree', { frameId: frame.frameId });
        const closed = collectClosed(root);
        for (const node of ax?.nodes || []) {
          const backend = Number(node?.backendDOMNodeId);
          if (!backend || !closed.ids.has(backend)) continue;
          if (node.ignored) continue;
          const role = lower(node.role?.value);
          if (!INTERACTIVE_ROLES.has(role)) continue;

          const dom = closed.info.get(backend);
          const focusable = axProperty(node, 'focusable') === true;
          const component =
            this.componentsEnabled && dom?.host ? await this.surfaceFor(dom.host, session) : undefined;
          this.identities.push({
            backendNodeId: backend,
            frameIndex: i,
            role,
            name: String(node.name?.value || ''),
            nodeName: dom?.nodeName || '',
            actions: actionsFor(role, focusable),
            disabled: axProperty(node, 'disabled') === true,
            focusable,
            focused: axProperty(node, 'focused') === true,
            order: order++,
            component,
          });
        }
      } catch (err: any) {
        this.notes.push(`Frame ${frame.url || frame.frameId}: ${String(err?.message || err)}`);
      }
    }
  }

  /** Matched-rule provenance, one batch push per session; best-effort only. */
  private async applyStyles(): Promise<void> {
    const groups = new Map<string | undefined, SealedIdentity[]>();
    for (const identity of this.identities) {
      const session = sessionOf(this.sessions, this.frames[identity.frameIndex]);
      const bucket = groups.get(session);
      if (bucket) bucket.push(identity);
      else groups.set(session, [identity]);
    }

    for (const [session, list] of groups) {
      try {
        const pushed = await this.send(session, 'DOM.pushNodesByBackendIdsToFrontend', {
          backendNodeIds: list.map((identity) => identity.backendNodeId),
        });
        const nodeIds: number[] = pushed?.nodeIds || [];
        for (let i = 0; i < list.length; i++) {
          const nodeId = nodeIds[i];
          if (!nodeId) continue;
          const matched = await this.send(session, 'CSS.getMatchedStylesForNode', { nodeId }).catch(() => null);
          for (const entry of matched?.matchedCSSRules || []) {
            const sheetId = entry?.rule?.styleSheetId;
            const header = sheetId ? this.styleHeaders.get(String(sheetId)) : undefined;
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
    bump('sealed.styleLookups', this.identities.length);
  }

  /** The custom-element surface behind a closed root's host, cached per backend id. */
  private async surfaceFor(host: any, session: string | undefined): Promise<ComponentSurface | undefined> {
    const backend = Number(host?.backendNodeId);
    if (!backend) return undefined;
    const cached = this.surfaceCache.get(backend);
    if (cached) return cached;

    const attrs = attributesOf(host);
    let cssVars: string[] = [];
    try {
      if (!this.cssEnabled.has(session)) {
        await this.send(session, 'CSS.enable');
        this.cssEnabled.add(session);
      }
      if (host.nodeId) {
        const computed = await this.send(session, 'CSS.getComputedStyleForNode', { nodeId: host.nodeId });
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
    this.surfaceCache.set(backend, surface);
    return surface;
  }

  /** Release the AX domain promptly; the page cannot see it, but leaving it on is state. */
  private async release(): Promise<void> {
    for (const session of this.axEnabled) {
      await this.send(session, 'Accessibility.disable').catch(() => undefined);
    }
    for (const session of this.cssEnabled) {
      await this.send(session, 'CSS.disable').catch(() => undefined);
    }
    if (this.styleMatch) this.dbg.removeListener('message', this.onDebugMessage);
    await detachOopifSessions(this.dbg, this.opened);
  }
}
