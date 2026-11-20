/**
 * Primitives part: extract.
 */
import type { ExtractOptions, CollectOptions } from './types.js';
import { buildExtractScript, buildCollectScript } from './scripts-extract.js';
import { PrimitivesComponents } from './part-components.js';

/** When to use: the extract part of the primitives chain, composed into the public class. */
export class PrimitivesExtract extends PrimitivesComponents {

  public async extract(opts: ExtractOptions): Promise<any> {
    const script = buildExtractScript({
      kind: opts.kind,
      ref: opts.ref,
      selector: opts.selector,
      type: opts.type,
      limit: opts.limit,
    });
    const res = await this.host.evaluate(script).catch((e) => ({ error: String(e?.message || e), kind: opts.kind }));
    this.host.log('action', `MCP Directive: extract(${opts.kind})${opts.type ? ` type=${opts.type}` : ''}${opts.ref !== undefined ? ` ref=#${opts.ref}` : ''}${opts.selector ? ` selector=${opts.selector}` : ''}`);

    if (opts.includeFrames && this.host.evaluateInFrames) {
      // A main-frame mark ref cannot address a child document; the frame scan uses the selector
      // (or the frame's best container when there is none).
      const frameScript = buildExtractScript({
        kind: opts.kind,
        selector: opts.selector,
        type: opts.type,
        limit: opts.limit,
      });
      const evaluated = await this.host
        .evaluateInFrames(frameScript, { maxFrames: opts.maxFrames ?? 6, timeoutMs: opts.timeoutMs ?? 2000 })
        .catch(() => []);
      const frames: any[] = (evaluated || [])
        .filter((frame) => (frame.depth ?? 1) > 0)
        .map((frame) => ({
          frameId: frame.frameId,
          url: frame.url,
          name: frame.name,
          oopif: frame.oopif === true,
          ok: frame.ok === true,
          ...(frame.ok ? { value: frame.value } : { error: frame.error }),
        }));
      res.frames = frames;
      res.frameCount = frames.length;

      if (opts.kind === 'table' || opts.kind === 'tables') {
        const frameRecords: any[] = [];
        for (const frame of frames) {
          if (!frame.ok || !frame.value) continue;
          const tables = opts.kind === 'tables' ? frame.value.tables || [] : [frame.value];
          for (const table of tables) {
            for (const record of table.records || []) {
              frameRecords.push({ frameId: frame.frameId, frameUrl: frame.url, ...record });
            }
          }
        }
        if (frameRecords.length) res.frameRecords = frameRecords;
      }
    }
    return res;
  }


  protected renderExtract(data: any): string {
    if (!data || data.error) return `(no data: ${data?.error || 'empty'})`;
    if (data.kind === 'table') {
      const lines: string[] = [data.headers ? '| ' + data.headers.join(' | ') + ' |' : ''];
      for (const row of data.rows || []) lines.push('| ' + row.join(' | ') + ' |');
      return lines.filter(Boolean).join('\n');
    }
    if (data.kind === 'app_data') {
      return (data.sources || []).map((s: any) => `${s.source} (${s.bytes}B, parsed=${s.parsed})`).join('\n');
    }
    return (data.rows || []).map((r: any, i: number) => `${i + 1}. ${r.text}${r.href ? ` -> ${r.href}` : ''}`).join('\n');
  }


  public async collectAll(opts: CollectOptions = {}): Promise<any> {
    const script = buildCollectScript({
      ref: opts.ref,
      selector: opts.selector,
      scroll: opts.scroll || 'container',
      step: opts.step,
      delayMs: opts.delayMs,
      maxScrolls: opts.maxScrolls,
      max: opts.max,
    });
    const res = await this.host.evaluate(script).catch((e) => ({ error: String(e?.message || e) }));
    this.host.log('action', `MCP Directive: collect_all(${opts.ref !== undefined ? `ref=#${opts.ref}` : opts.selector || 'auto'}) -> ${res?.count ?? 0} rows`);
    return res;
  }
}
