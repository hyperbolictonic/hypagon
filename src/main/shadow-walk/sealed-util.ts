/**
 * Small helpers the sealed scan shares: role→actions, lowercase names, viewport bounds,
 * attribute maps, and the closed-root index.
 *
 * `collectClosed` is the heart of it: it walks an already-pierced DOM tree and records
 * which backend nodes live under a closed shadow root, and which host owns them.
 */
import { INTERACTIVE_ROLES } from './ax-tree.js';
import type { SealedRect } from './sealed-types.js';

const TYPE_ROLES = new Set(['textbox', 'searchbox', 'combobox', 'spinbutton', 'slider']);

/** When to use: deciding what a role can accept (click, type, or only focus). */
export function actionsFor(role: string, focusable: boolean): string[] {
  if (TYPE_ROLES.has(role)) return ['click', 'type'];
  if (INTERACTIVE_ROLES.has(role)) return ['click'];
  return focusable ? ['focus'] : [];
}

/** When to use: comparing names/roles case-insensitively. */
export function lower(value: any): string {
  return String(value ?? '').toLowerCase();
}

/** When to use: the visible viewport from `Page.getLayoutMetrics`. */
export function viewportOf(metrics: any): SealedRect {
  const layout = metrics?.cssLayoutViewport || metrics?.layoutViewport || {};
  return {
    x: 0,
    y: 0,
    width: Number(layout.clientWidth) || 0,
    height: Number(layout.clientHeight) || 0,
  };
}

/** When to use: turning a CDP box-model quad into a rect (null when the quad is unusable). */
export function rectFromQuad(quad: any): SealedRect | null {
  if (!Array.isArray(quad) || quad.length < 8) return null;
  const xs = [quad[0], quad[2], quad[4], quad[6]].map(Number);
  const ys = [quad[1], quad[3], quad[5], quad[7]].map(Number);
  return {
    x: Math.min(...xs),
    y: Math.min(...ys),
    width: Math.max(...xs) - Math.min(...xs),
    height: Math.max(...ys) - Math.min(...ys),
  };
}

/** When to use: turning a CDP attribute array into a map. */
export function attributesOf(node: any): Record<string, string> {
  const out: Record<string, string> = {};
  const attrs = node?.attributes || [];
  for (let i = 0; i + 1 < attrs.length; i += 2) out[String(attrs[i])] = String(attrs[i + 1]);
  return out;
}

/** When to use: walking a pierced DOM tree and indexing everything under a closed root. */
export function collectClosed(root: any): {
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
