/**
 * Primitives part: components.
 */
import type { MarkItem } from '../marks/marks-overlay.js';
import { formatMark } from '../marks/format-mark.js';
import { textTargetExpression, parseTextTargets } from './text-target.js';
import { PrimitivesPageState } from './part-page-state.js';

/** When to use: the components part of the primitives chain, composed into the public class. */
export class PrimitivesComponents extends PrimitivesPageState {

  /**
   * Compact, region-grouped rendering of the component table. One line per component:
   *   [8] button   "Create account" {click}
   *   [7] textbox  "Email" · empty {type}
   * Read top-down, it is the page's affordances — no markup, no screenshot.
   */
  protected componentsText(components: Array<{ id: number; role: string; name: string; value?: string; state: string[]; actions: string[]; region: string; regionName?: string }>): string {
    const groups = new Map<string, string[]>();
    for (const c of components) {
      const key = c.regionName ? `${c.region} · ${c.regionName}` : c.region;
      const bits = [`[${c.id}] ${c.role}`.padEnd(20), `"${c.name}"`];
      if (c.value) bits.push(`· ${c.value}`);
      if (c.state.length) bits.push(`[${c.state.join(', ')}]`);
      if (c.actions.length) bits.push(`{${c.actions.join(', ')}}`);
      const line = bits.join(' ');
      const bucket = groups.get(key);
      if (bucket) bucket.push(line);
      else groups.set(key, [line]);
    }
    const lines: string[] = [];
    for (const [region, rows] of groups) {
      if (lines.length) lines.push('');
      lines.push(`## ${region}`);
      lines.push(...rows);
    }
    return lines.join('\n');
  }


  protected markLine(m: MarkItem): string {
    return formatMark(m);
  }


  // ---- find / act ----------------------------------------------------------

  public async componentSignatureForTarget(targetText: string): Promise<{ signature?: string; tag?: string; error?: string }> {
    if (this.host.componentSurfaceEnabled?.() === false) return { error: 'disabled' };
    const raw = await this.host
      .evaluate(textTargetExpression(targetText, { max: 1, componentSurface: true }))
      .catch(() => null);
    const match = parseTextTargets(raw).matches[0];
    if (!match?.component) return { error: 'not-found' };
    return { signature: match.component.signature, tag: match.component.tag };
  }


  /** Replay-runner name; see {@link RecipeRunner.componentSignature}. */
  public async componentSignature(targetText: string): Promise<{ signature?: string; tag?: string; error?: string }> {
    return this.componentSignatureForTarget(targetText);
  }
}
