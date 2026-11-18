/**
 * Accessibility-tree outlining.
 *
 * A full CDP AX tree is mostly structural noise; this turns it into an indented,
 * token-efficient semantic outline that an agent can read in one go.
 *
 * When to use: rendering a page outline from `Accessibility.getFullAXTree` nodes, or
 * previewing what an AX-based read would contain.
 */

/**
 * When to use: converting raw CDP AXNode list into a clean, indented semantic
 * hierarchy (significant roles only, capped at 250 lines).
 */
export function distillAxNodes(nodes: any[]): string {
  const lines: string[] = [];
  const significantRoles = new Set([
    'button', 'link', 'combobox', 'searchbox', 'textbox', 'checkbox', 'radio',
    'menuitem', 'option', 'tab', 'heading', 'navigation', 'main', 'article',
    'dialog', 'alertdialog', 'alert', 'row', 'gridcell', 'cell', 'table', 'treeitem'
  ]);

  for (const node of nodes) {
    if (node.ignored) continue;
    const role = node.role?.value || '';
    const name = node.name?.value || '';
    const value = node.value?.value || '';
    const description = node.description?.value || '';

    // Skip non-significant structural containers with no text
    if (!significantRoles.has(role) && !name && !value) {
      continue;
    }

    const flags: string[] = [];
    if (node.properties) {
      for (const prop of node.properties) {
        const pName = prop.name;
        const pVal = prop.value?.value;
        if (pVal === true) flags.push(pName);
        else if (pVal && pVal !== false && typeof pVal !== 'object') flags.push(`${pName}="${pVal}"`);
      }
    }

    const parts: string[] = [];
    parts.push(`[${role.toUpperCase()}]`);
    if (name) parts.push(`"${name.replace(/\n+/g, ' ').trim()}"`);
    if (value) parts.push(`{value="${String(value).trim()}"}`);
    if (flags.length > 0) parts.push(`(${flags.join(', ')})`);
    if (description && description !== name) parts.push(`— ${description.slice(0, 80)}`);

    lines.push(parts.join(' '));
  }

  return lines.slice(0, 250).join('\n');
}
