/**
 * observe(): the one snapshot model, projected as markdown | text | ax | som |
 * components | list | table | app_data.
 *
 * Why a module: the view dispatch, the two frame-aware views and the JEV read
 * funnel were one 123-line method. Each view is now its own method, so the
 * dispatch reads as a table of what exists.
 */
import type { PageConstruct } from './contracts.ts';
import { addressedFrameControls } from './frame-controls.ts';
import { DEFAULT_MARKDOWN_BUDGET, type ObserveOptions, type PrimitivesHost } from './contracts.ts';
import type { PageReadFunnel } from './read-funnel.ts';
import type { ReadController } from './read-controller.ts';
import { componentsText, markLine, pageText, renderExtract } from './projection.ts';

/** When to use: `Primitives` — the host, the read tools and the read funnel. */
export interface ObserveControllerDeps {
  host: PrimitivesHost;
  read: () => ReadController;
  funnel: PageReadFunnel;
}

/** When to use: `Primitives` — own the observe projections. */
export class ObserveController {
  private readonly deps: ObserveControllerDeps;

  constructor(deps: ObserveControllerDeps) {
    this.deps = deps;
  }

  /** Project the active page in the requested view. */
  public async observe(opts: ObserveOptions = {}): Promise<any> {
    const as = opts.as || 'markdown';
    const info = this.deps.host.getPageInfo();
    const revision = this.deps.host.revision();

    if (as === 'list' || as === 'table' || as === 'app_data') return this.extractView(as, opts, info, revision);
    if (as === 'som') return this.somView(opts, info, revision);
    if (as === 'components') return this.componentsView(opts, info, revision);
    if (as === 'ax') return this.axView(opts, info, revision);
    if (as === 'text') return this.textView(opts, info, revision);
    return this.markdownView(opts, info);
  }

  /** list / table / app_data are the structured extractor, previewed as text. */
  private async extractView(
    as: 'list' | 'table' | 'app_data',
    opts: ObserveOptions,
    info: { url: string; title: string },
    revision: number,
  ): Promise<any> {
    const extracted = await this.deps.read().extract({
      kind: as,
      ref: typeof opts.region === 'number' ? opts.region : undefined,
      selector: typeof opts.region === 'string' ? opts.region : undefined,
      limit: opts.limit,
    });
    return { as, revision, url: info.url, title: info.title, ...extracted, text: renderExtract(extracted) };
  }

  /** som: the mark table, optionally merged with child-frame controls (100+ ids). */
  private async somView(opts: ObserveOptions, info: { url: string; title: string }, revision: number): Promise<any> {
    const marks = await this.deps.host.injectMarks({ includeOffscreen: opts.includeOffscreen === true });
    let frameNote: string | undefined;
    if (opts.includeFrames) {
      const merged = await this.frameMarks(opts);
      marks.push(...merged.marks);
      frameNote = merged.note;
    }
    const rows = marks.map((m) => markLine(m));
    const result: any = { as: 'som', revision, url: info.url, title: info.title, marks, count: marks.length, text: rows.join('\n') };
    if (frameNote) result.frameNote = frameNote;
    return result;
  }

  /**
   * components: role, name, value, affordances and region per component, with only
   * the actions the element actually accepts. Built on the same shadow-aware mark
   * collection as `som`, so web components are included. Mark ids stay valid, so a
   * decision ("click #8") executes through `act(mark_id)`.
   */
  private async componentsView(
    opts: ObserveOptions,
    info: { url: string; title: string },
    revision: number,
  ): Promise<any> {
    const marks = await this.deps.host.injectMarks({ includeOffscreen: opts.includeOffscreen === true });
    const componentOn = this.deps.host.componentSurfaceEnabled?.() !== false;
    const components = marks.map((m) => ({
      id: m.id,
      role: (m.role || m.tag).toLowerCase(),
      tag: m.tag.toLowerCase(),
      name: m.text || '',
      value: m.value,
      state: m.state ? m.state.split(',').filter(Boolean) : [],
      actions: m.actions || [],
      region: m.region || 'page',
      regionName: m.regionName,
      rect: m.rect,
      ...(componentOn && m.component ? { signature: m.component.signature, component: m.component } : {}),
    }));
    let frameNote: string | undefined;
    if (opts.includeFrames) {
      const merged = await this.frameMarks(opts);
      for (const mark of merged.marks) {
        components.push({
          id: mark.id,
          role: (mark.role || mark.tag).toLowerCase(),
          tag: mark.tag.toLowerCase(),
          name: mark.text || '',
          value: mark.value,
          state: [],
          actions: mark.actions || [],
          region: 'frame',
          regionName: mark.frameUrl,
          rect: mark.rect,
          ...(componentOn && mark.component ? { signature: mark.component.signature, component: mark.component } : {}),
          frameId: mark.frameId,
          frameUrl: mark.frameUrl,
        } as any);
      }
      frameNote = merged.note;
    }
    const text = componentsText(components);
    const result: any = pageText('components', revision, info, text, opts, { components, count: components.length });
    if (frameNote) result.frameNote = frameNote;
    return result;
  }

  /** ax: the accessibility tree as text. */
  private async axView(opts: ObserveOptions, info: { url: string; title: string }, revision: number): Promise<any> {
    const snap = await this.deps.host.snapshotRenderedPage({ format: 'ax_tree' });
    return pageText('ax', revision, info, snap?.content || '', opts, { nodeCount: snap?.stats?.nodeCount });
  }

  /** text: the innerText of the page (or the region), behind the JEV funnel. */
  private async textView(opts: ObserveOptions, info: { url: string; title: string }, revision: number): Promise<any> {
    const pre = await this.deps.funnel.precheck('text', opts);
    const rootExpr =
      typeof opts.region === 'number'
        ? `document.querySelector('[data-mark-id="${opts.region}"]')`
        : typeof opts.region === 'string'
          ? `document.querySelector(${JSON.stringify(opts.region)})`
          : 'document.body';
    const text =
      (await this.deps.host
        .evaluate(`(() => { const r = ${rootExpr}; if (!r) return ''; return (r.innerText || r.textContent || ''); })()`)
        .catch(() => '')) || '';
    const guard = pre?.note ? pre.note : this.deps.funnel.check('text', info, text, opts);
    const result = pageText('text', revision, info, text, opts);
    return guard ? { ...result, text: `${result.text}\n\n[JEV] ${guard}` } : result;
  }

  /** markdown (default): the harvested construct, behind the JEV funnel. */
  private async markdownView(opts: ObserveOptions, info: { url: string; title: string }): Promise<any> {
    const pre = await this.deps.funnel.precheck('markdown', opts);
    const construct = await this.deps.host.harvest({
      includeMarks: true,
      includeOffscreen: opts.includeOffscreen === true,
    });
    const funnel = pre?.note
      ? pre.note
      : this.deps.funnel.check(
          'markdown',
          { url: construct.url || info.url, title: construct.title || info.title },
          construct.content || '',
          opts,
          construct.content || '',
        );
    const result = pageText(
      'markdown',
      this.deps.host.revision(),
      { url: construct.url, title: construct.title },
      construct.content,
      opts,
      {
        tokens: construct.estimatedTokens,
        markdownLength: construct.markdownLength,
        extractedChars: construct.extractedChars,
        pageChars: construct.pageChars,
        reader: construct.reader,
        shadowRoots: construct.shadowRoots,
      },
      DEFAULT_MARKDOWN_BUDGET,
    );
    return funnel ? { ...result, text: `${result.text}\n\n[JEV] ${funnel}` } : result;
  }

  /** Child-frame controls as mark-like rows for observe(som/components). */
  private async frameMarks(opts: ObserveOptions): Promise<{ marks: any[]; note?: string }> {
    if (!this.deps.host.getFrames) return { marks: [], note: 'Frame scanning is not available in this build.' };
    try {
      const data = await this.deps.host.getFrames({
        includeControls: true,
        screenshots: false,
        maxFrames: 6,
        maxControls: Math.max(1, opts.limit ?? 40),
        includeOffscreen: opts.includeOffscreen === true,
      });
      const marks: any[] = [];
      for (const { frame, control } of addressedFrameControls(data)) {
        marks.push({
          id: control.id,
          tag: String(control.tag || '').toUpperCase(),
          text: control.name || '',
          role: control.role,
          value: control.value,
          actions: control.actions || [],
          rect: control.rect,
          center: {
            x: Math.round(control.rect.x + control.rect.width / 2),
            y: Math.round(control.rect.y + control.rect.height / 2),
          },
          frameId: frame.frameId,
          frameUrl: frame.url,
          component: control.component,
        });
      }
      return {
        marks,
        note: marks.length ? undefined : (data.notes || []).join('; ') || 'No visible controls inside child frames.',
      };
    } catch (err: any) {
      return { marks: [], note: `Frame scan unavailable: ${String(err?.message || err)}` };
    }
  }
}
