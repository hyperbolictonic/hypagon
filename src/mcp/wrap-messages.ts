/**
 * The short message shapes shared by the bridge client and the renderers.
 *
 * Why a module: the failure line has to read the same whether the bridge produced it or a tool
 * named a missing wrapper, and putting it in either of those two modules made them import each
 * other.
 */

/** The standard failure line: `**CODE:** message`. */
export function errorText(code: string | undefined, message: string | undefined): string {
  return `**${code || 'ERROR'}:** ${message || 'The wrapper request failed.'}`;
}
