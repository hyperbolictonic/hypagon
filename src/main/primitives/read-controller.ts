/**
 * The structured reads: extract() (list / table / tables / app_data / schema_org)
 * and collect() (scroll-and-dedupe a virtualized list), plus the component
 * signature lookup the marks layer uses.
 *
 * Why a module: these run a page program and return its data — no JEV funnel, no
 * mark table, no act flow. `observe` reuses them for its list/table/app_data
 * views, which is why they are reachable through the controller rather than
 * private helpers.
 */
import { buildCollectScript, buildExtractScript } from './page-scripts.js';
import type { CollectOptions, ExtractOptions } from './options.js';
import { textTargetExpression, parseTextTargets } from './text-target.js';
import type { PrimitivesHost } from './contracts.js';

/** When to use: `Primitives` — the read tools that are not page dumps. */
export class ReadController {
  private readonly host: PrimitivesHost;

  constructor(host: PrimitivesHost) {
    this.host = host;
  }

  /** Structured extraction; with include_frames it also evaluates every child frame. */
  public async extract(opts: ExtractOptions): Promise<any> {
    const script = buildExtractScript({
      kind: opts.kind,
      ref: opts.ref,
      selector: opts.selector,
      type: opts.type,
      limit: opts.limit,
    });
    const res = await this.host.evaluate(script).catch((e) => ({ error: String(e?.message || e), kind: opts.kind }));
    this.host.log(
      'action',
      `MCP Directive: extract(${opts.kind})${opts.type ? ` type=${opts.type}` : ''}${opts.ref !== undefined ? ` ref=#${opts.ref}` : ''}`,
    );

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

  /** Scroll a virtualized list and dedupe the rows it renders. */
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
    this.host.log(
      'action',
      `MCP Directive: collect_all(${opts.ref !== undefined ? `ref=#${opts.ref}` : opts.selector || 'page'})`,
    );
    return res;
  }

  /** The component signature of the control a visible text addresses. */
  public async componentSignatureForTarget(
    targetText: string,
  ): Promise<{ signature?: string; tag?: string; error?: string }> {
    if (this.host.componentSurfaceEnabled?.() === false) return { error: 'disabled' };
    const raw = await this.host
      .evaluate(textTargetExpression(targetText, { max: 1, componentSurface: true }))
      .catch(() => null);
    const match = parseTextTargets(raw).matches[0];
    if (!match?.component) return { error: 'not-found' };
    return { signature: match.component.signature, tag: match.component.tag };
  }

  /** Replay-runner name; see {@link RecipeRunner.componentSignature}. */
  public async componentSignature(
    targetText: string,
  ): Promise<{ signature?: string; tag?: string; error?: string }> {
    return this.componentSignatureForTarget(targetText);
  }
}
