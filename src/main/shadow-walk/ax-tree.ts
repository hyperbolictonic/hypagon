/**
 * Shared Accessibility-tree helpers for the Shadow Walk surfaces.
 *
 * The Tab walk and sealed discovery both read Chromium's AX tree; these are the
 * primitives they share: interactive-role vocabulary, property/role readers, the
 * focused-node rule and backend-id collection.
 *
 * When to use: reading AX nodes (role, name, focused, properties) or deciding which
 * roles count as interactive. Keep the vocabulary in one place.
 */

/** When to use: deciding whether an AX role is something a person can operate. */
export const INTERACTIVE_ROLES = new Set([
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

/** When to use: reading one AX property value (focused, disabled, ...) off a node. */
export function axProp(node: any, name: string): any {
  const found = (node?.properties || []).find((p: any) => p?.name === name);
  return found?.value?.value;
}

/** When to use: reading a node's lower-cased AX role. */
export function roleOf(node: any): string {
  return String(node?.role?.value || '').toLowerCase();
}

/**
 * When to use: finding the node the user's focus is on. RootWebArea also claims
 * `focused:true`; it is never the control the user is on.
 */
export function focusedNode(ax: any): any | null {
  const candidates = (ax?.nodes || []).filter(
    (n: any) => !n.ignored && axProp(n, 'focused') === true && roleOf(n) !== 'rootwebarea',
  );
  if (!candidates.length) return null;
  return candidates.find((n: any) => INTERACTIVE_ROLES.has(roleOf(n))) || candidates[0];
}

/** When to use: collecting every backendNodeId in a subtree, closed shadow roots included. */
export function collectBackendIds(node: any, out = new Set<number>()): Set<number> {
  if (!node) return out;
  if (node.backendNodeId) out.add(Number(node.backendNodeId));
  for (const child of node.children || []) collectBackendIds(child, out);
  for (const shadow of node.shadowRoots || []) collectBackendIds(shadow, out);
  return out;
}

/** When to use: reporting a robust central gap (even/odd sample counts) for timing steps. */
export function median(values: number[]): number | undefined {
  if (!values.length) return undefined;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}
