/**
 * Small CDP/AX helpers shared by the Shadow Walk readings.
 *
 * The sealed-control scan, the trusted Tab walk and token resolution all read
 * the same two things from CDP: an accessibility node's property value and the
 * content quad of a box model. They also open the same root/flattened session
 * send. Keeping those here stops each reader from carrying its own copy.
 */

/** The axis-aligned viewport rect a CDP box model describes. */
export interface ContentRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** When to use: reading one accessibility property off a CDP AX node. */
export function axProperty(node: any, name: string): any {
  const found = (node?.properties || []).find((p: any) => p?.name === name);
  return found?.value?.value;
}

/** When to use: reading an AX node's role as a lower-cased label. */
export function axRole(node: any): string {
  return String(node?.role?.value || '').toLowerCase();
}

/** When to use: turning a `DOM.getBoxModel` response into a drawable rect; null without a box. */
export function contentRect(raw: any): ContentRect | null {
  const quad = (raw?.model || raw)?.content;
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

/** When to use: a CDP send that targets the root session when no session id is given. */
export function cdpSend(dbg: { sendCommand(...args: any[]): Promise<any> }) {
  return async (
    sessionId: string | undefined,
    method: string,
    params: Record<string, unknown> = {},
  ): Promise<any> => {
    return sessionId
      ? ((await dbg.sendCommand(method, params, sessionId)) as any)
      : ((await dbg.sendCommand(method, params)) as any);
  };
}
