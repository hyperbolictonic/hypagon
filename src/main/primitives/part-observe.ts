/**
 * Primitives part: observe.
 */
import type { ObserveOptions } from './types.js';
import { DEFAULT_MARKDOWN_BUDGET } from './types.js';
import { PrimitiveError } from './error.js';
import { PrimitivesObserveText } from './part-observe-text.js';
import { frameControls } from './frame-controls.js';

/** When to use: the observe part of the primitives chain, composed into the public class. */
export class PrimitivesObserve extends PrimitivesObserveText {

  /** When to use: the JEV pre-harvest gate, shared by the text and markdown projections. */
  protected async precheckRead(as: string, opts: ObserveOptions) {
    const pre = await this.host.precheckPageRead?.({
      as,
      region: opts.region,
      budget: opts.budget,
      cursor: opts.cursor,
      full: opts.full,
    });
    if (pre?.blocked) {
      throw new PrimitiveError(
        'JEV_REQUIRED',
        'Unscoped page reads are disabled while JEV enforce is on. Call jev_index, then read_section for the sections you need.',
        pre.refusal,
      );
    }
    return pre;
  }

  // ---- observe -------------------------------------------------------------

  public async observe(opts: ObserveOptions = {}): Promise<any> {
    const as = opts.as || 'markdown';
    const info = this.host.getPageInfo();
    const revision = this.host.revision();

    if (as === 'list' || as === 'table' || as === 'app_data') {
      const extracted = await this.extract({ kind: as, ref: typeof opts.region === 'number' ? opts.region : undefined, selector: typeof opts.region === 'string' ? opts.region : undefined, limit: opts.limit });
      return { as, revision, url: info.url, title: info.title, ...extracted, text: this.renderExtract(extracted) };
    }

    if (as === 'som') {
      const marks = await this.host.injectMarks({ includeOffscreen: opts.includeOffscreen === true });
      let frameNote: string | undefined;
      if (opts.includeFrames) {
        const merged = await this.frameMarks(opts);
        marks.push(...merged.marks);
        frameNote = merged.note;
      }
      const rows = marks.map((m) => this.markLine(m));
      const result: any = { as, revision, url: info.url, title: info.title, marks, count: marks.length, text: rows.join('\n') };
      if (frameNote) result.frameNote = frameNote;
      return result;
    }

    if (as === 'components') {
      // The decision-ready view: role, name, value, affordances and region per component,
      // with only the actions the element actually accepts. Built on the same shadow-aware
      // mark collection as `som`, so web components are included. Mark ids stay valid, so a
      // decision ("click #8") executes through `act(mark_id)`.
      const marks = await this.host.injectMarks({ includeOffscreen: opts.includeOffscreen === true });
      const componentOn = this.host.componentSurfaceEnabled?.() !== false;
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
      const text = this.componentsText(components);
      const result: any = this.pageText(as, revision, info, text, opts, { components, count: components.length });
      if (frameNote) result.frameNote = frameNote;
      return result;
    }

    if (as === 'ax') {
      const snap = await this.host.snapshotRenderedPage({ format: 'ax_tree' });
      return this.pageText(as, revision, info, snap?.content || '', opts, { nodeCount: snap?.stats?.nodeCount });
    }

    if (as === 'text') {
      const pre = await this.precheckRead(as, opts);
      const rootExpr =
        typeof opts.region === 'number'
          ? `document.querySelector('[data-mark-id="${opts.region}"]')`
          : typeof opts.region === 'string'
            ? `document.querySelector(${JSON.stringify(opts.region)})`
            : 'document.body';
      const text =
        (await this.host
          .evaluate(`(() => { const r = ${rootExpr}; if (!r) return ''; return (r.innerText || r.textContent || ''); })()`)
          .catch(() => '')) || '';
      const guard = pre?.note ? pre.note : this.checkPageReadFunnel(as, info, text, opts);
      const result = this.pageText(as, revision, info, text, opts);
      return guard ? { ...result, text: `${result.text}\n\n[JEV] ${guard}` } : result;
    }

    // markdown (default)
    const pre = await this.precheckRead('markdown', opts);
    const construct = await this.host.harvest({ includeMarks: true, includeOffscreen: opts.includeOffscreen === true });
    const funnel = pre?.note
      ? pre.note
      : this.checkPageReadFunnel(
          'markdown',
          { url: construct.url || info.url, title: construct.title || info.title },
          construct.content || '',
          opts,
          construct.content || '',
        );
    const result = this.pageText(
      'markdown',
      this.host.revision(),
      { url: construct.url, title: construct.title },
      construct.content,
      opts,
      {
        tokens: construct.estimatedTokens,
        markdownLength: construct.markdownLength,
        extractedChars: construct.extractedChars,
        pageChars: construct.pageChars,        reader: construct.reader,
        shadowRoots: construct.shadowRoots,
      },
      DEFAULT_MARKDOWN_BUDGET
    );
    return funnel ? { ...result, text: `${result.text}\n\n[JEV] ${funnel}` } : result;
  }


  /**
   * JEV hard funnel: refuse unscoped page reads while enforce is on. Returns a
   * note when the loop breaker released the read, so the caller can surface it.
   */
  protected checkPageReadFunnel(
    as: string,
    info: { url: string; title: string },
    text: string,
    opts: ObserveOptions,
    content?: string,
  ): string | undefined {
    if (!this.host.guardPageRead) return undefined;
    const guard = this.host.guardPageRead({
      as,
      region: opts.region,
      budget: opts.budget,
      cursor: opts.cursor,
      full: opts.full,
      pageTokens: Math.ceil((text || '').length / 4),
      url: info.url,
      title: info.title,
      content: content ?? text,
    });
    if (!guard.allowed) {
      throw new PrimitiveError(
        'JEV_REQUIRED',
        'Unscoped page reads are disabled while JEV enforce is on. Call jev_index, then read_section for the sections you need.',
        guard.refusal,
      );
    }
    return guard.note;
  }


  /** Child-frame controls as mark-like rows for observe(som/components). */
  protected async frameMarks(opts: ObserveOptions): Promise<{ marks: any[]; note?: string }> {
    if (!this.host.getFrames) return { marks: [], note: 'Frame scanning is not available in this build.' };
    try {
      const data = await this.host.getFrames({
        includeControls: true,
        screenshots: false,
        maxFrames: 6,
        maxControls: Math.max(1, opts.limit ?? 40),
        includeOffscreen: opts.includeOffscreen === true,
      });
      const marks: any[] = [];
      for (const frame of data.frames || []) {
        for (const control of frameControls(frame)) {
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
