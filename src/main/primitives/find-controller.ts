/**
 * find(): semantic lookup over marks, closed shadow roots and child frames,
 * returning mark refs the agent can act on.
 *
 * Why a module: the 178-line method was four lookups plus the rendering of their
 * union. Each source is a method here, and `find` is the merge, so a new source
 * (another shadow registry, another frame kind) is one method rather than forty
 * more lines in the middle.
 */
import type { MarkItem } from '../marks/marks-overlay.js';
import type { SealedControl, SealedFindResult } from '../shadow-walk/ax-controls.js';
import { addressedFrameControls } from './frame-controls.js';
import { controlFactsExpression, parseControlFacts } from './control-facts.js';
import { PrimitiveError, type FindOptions, type PrimitivesHost } from './contracts.js';
import { markLine } from './projection.js';

/** When to use: `Primitives` — own the find merge. */
export class FindController {
  private readonly host: PrimitivesHost;

  constructor(host: PrimitivesHost) {
    this.host = host;
  }

  /** Look up visible controls by role/name/text/selector, in marks, sealed roots and frames. */
  public async find(opts: FindOptions = {}): Promise<any> {
    // Sealed discovery is guarded before marks are injected: a refused call must not mutate the
    // page first. It is also independent of the mark table, so doing it first is cheaper on refusal.
    const sealedInfo = opts.sealed ? await this.sealed(opts) : undefined;

    const matched = await this.matches(opts);
    const framed = opts.includeFrames
      ? await this.frames(opts, matched.limit, matched.limited.length, matched.want, matched.re)
      : { frameMarks: [] as any[], frameTotal: 0, frameNote: undefined as string | undefined };

    return this.render(matched, framed, sealedInfo);
  }

  /** The sealed (closed shadow root) lookup, or a refusal when the build cannot scan. */
  private async sealed(opts: FindOptions): Promise<SealedFindResult> {
    if (!this.host.findSealed) {
      throw new PrimitiveError('NOT_SUPPORTED', 'Sealed shadow-root discovery is not available in this build.');
    }
    return this.host.findSealed({
      role: opts.role,
      name: opts.name,
      contains: opts.contains,
      regex: opts.regex,
      flags: opts.flags,
      tag: opts.tag,
      selector: opts.selector,
      limit: opts.limit,
      includeOffscreen: opts.includeOffscreen,
      refresh: opts.refresh,
    });
  }

  /** The main-frame mark table, filtered and enriched with live control facts. */
  private async matches(opts: FindOptions): Promise<{
    limited: MarkItem[];
    filtered: MarkItem[];
    factsById: Map<number, { visible: boolean; occluded: boolean; disabled: boolean; region: string }>;
    componentOn: boolean;
    limit: number;
    want: string;
    re: RegExp | null;
  }> {
    const marks = await this.host.injectMarks({ includeOffscreen: opts.includeOffscreen !== false });
    const componentOn = this.host.componentSurfaceEnabled?.() !== false;

    let selectorIds: Set<number> | null = null;
    if (opts.selector) {
      const ids: number[] = await this.host
        .evaluate(
          `(() => { const out = []; document.querySelectorAll('[data-mark-id]').forEach((el) => { try { if (el.matches(${JSON.stringify(opts.selector)})) out.push(Number(el.getAttribute('data-mark-id'))); } catch (e) {} }); return out; })()`,
        )
        .catch(() => []);
      selectorIds = new Set(ids || []);
    }

    const re = opts.regex ? new RegExp(opts.regex, opts.flags || 'i') : null;
    const want = (opts.contains || opts.name || '').toLowerCase();
    const limit = opts.limit && opts.limit > 0 ? opts.limit : 25;

    const filtered = marks.filter((m) => {
      if (selectorIds && !selectorIds.has(m.id)) return false;
      if (opts.tag && m.tag.toLowerCase() !== opts.tag.toLowerCase()) return false;
      if (opts.role) {
        const role = (m.role || '').toLowerCase();
        const implied = m.tag.toLowerCase() === 'a' ? 'link' : m.tag.toLowerCase() === 'button' ? 'button' : '';
        if (role !== opts.role.toLowerCase() && implied !== opts.role.toLowerCase()) return false;
      }
      const hay = `${m.text || ''} ${m.value || ''}`.toLowerCase();
      if (want && hay.indexOf(want) === -1) return false;
      if (re && !re.test(`${m.text || ''} ${m.value || ''}`)) return false;
      return true;
    });

    const limited = filtered.slice(0, limit);

    // Enrich with live control facts (one injected expression for the whole match set): the agent
    // needs to know whether a match is actually hittable — an occluded card looks identical in the
    // marks table to a clickable one, and clicking it silently does nothing.
    const factsById = new Map<number, { visible: boolean; occluded: boolean; disabled: boolean; region: string }>();
    if (limited.length) {
      const raw = await this.host
        .evaluate(controlFactsExpression({ ids: limited.map((m) => m.id), skipHitTest: false }))
        .catch(() => null);
      for (const fact of parseControlFacts(raw).controls) {
        if (fact.id === undefined) continue;
        factsById.set(fact.id, {
          visible: fact.visible,
          occluded: fact.occluded,
          disabled: fact.disabled,
          region: fact.region,
        });
      }
    }

    return { limited, filtered, factsById, componentOn, limit, want, re };
  }

  /**
   * Child-frame controls (opt-in): `getFrames` stamps them with 100+ IDs and registers
   * them for live resolution. The main-frame marks stay 1..99, so the sets never collide.
   */
  private async frames(
    opts: FindOptions,
    limit: number,
    mainCount: number,
    want: string,
    re: RegExp | null,
  ): Promise<{ frameMarks: any[]; frameTotal: number; frameNote?: string }> {
    if (!this.host.getFrames) return { frameMarks: [], frameTotal: 0, frameNote: 'Frame scanning is not available in this build.' };
    try {
      const data = await this.host.getFrames({
        includeControls: true,
        screenshots: false,
        maxFrames: 6,
        maxControls: Math.max(limit, 40),
        includeOffscreen: opts.includeOffscreen !== false,
      });
      const frameMarks: any[] = [];
      let frameTotal = 0;
      const wantRole = opts.role ? String(opts.role).toLowerCase() : '';
      for (const { frame, control } of addressedFrameControls(data)) {
        const tag = String(control.tag || '').toUpperCase();
        const role = String(control.role || '').toLowerCase();
        const implied = tag === 'A' ? 'link' : tag === 'BUTTON' ? 'button' : '';
        if (opts.tag && tag.toLowerCase() !== opts.tag.toLowerCase()) continue;
        if (wantRole && role !== wantRole && implied !== wantRole) continue;
        const hay = `${control.name || ''} ${control.value || ''}`.toLowerCase();
        if (want && hay.indexOf(want) === -1) continue;
        if (re && !re.test(`${control.name || ''} ${control.value || ''}`)) continue;
        frameTotal += 1;
        if (mainCount + frameMarks.length >= limit) continue;
        const rect = control.rect;
        frameMarks.push({
          id: control.id,
          tag,
          text: control.name || '',
          role: control.role,
          actions: control.actions || [],
          rect,
          center: {
            x: Math.round(rect.x + rect.width / 2),
            y: Math.round(rect.y + rect.height / 2),
          },
          frameId: frame.frameId,
          frameUrl: frame.url,
          component: control.component,
          facts: {
            visible: control.visible,
            occluded: control.occluded,
            disabled: control.disabled,
            region: 'frame',
          },
        });
      }
      const frameNote = frameMarks.length ? undefined : 'No matching controls inside child frames.';
      return { frameMarks, frameTotal, frameNote };
    } catch (err: any) {
      return { frameMarks: [], frameTotal: 0, frameNote: `Frame scan unavailable: ${String(err?.message || err)}` };
    }
  }

  /** Render the union of the three sources as text plus structured rows. */
  private render(
    matched: {
      limited: MarkItem[];
      filtered: MarkItem[];
      factsById: Map<number, { visible: boolean; occluded: boolean; disabled: boolean; region: string }>;
      componentOn: boolean;
    },
    framed: { frameMarks: any[]; frameTotal: number; frameNote?: string },
    sealedInfo: SealedFindResult | undefined,
  ): any {
    const { limited, filtered, factsById, componentOn } = matched;

    const lines = limited.map((m) => {
      const facts = factsById.get(m.id);
      // `disabled` is already printed from the mark's own state; only add what the marks table
      // cannot know (live occlusion / hidden state).
      const flags = facts ? [facts.occluded ? 'occluded' : '', facts.visible ? '' : 'hidden'].filter(Boolean) : [];
      return markLine(m) + (flags.length ? ` {${flags.join(', ')}}` : '');
    });

    const frameLines = framed.frameMarks.map((m) => {
      const flags = [m.facts?.occluded ? 'occluded' : '', m.facts?.visible === false ? 'hidden' : ''].filter(Boolean);
      return `[frame] ${markLine(m)}${flags.length ? ` {${flags.join(', ')}}` : ''}`;
    });

    const sealed: SealedControl[] | undefined = sealedInfo?.controls;
    const sealedLines = (sealed || []).map((control) => {
      const cx = Math.round(control.rect.x + control.rect.width / 2);
      const cy = Math.round(control.rect.y + control.rect.height / 2);
      const flags = [control.inViewport ? '' : 'offscreen', control.disabled ? 'disabled' : ''].filter(Boolean);
      const token = control.token ? ` token=${control.token}` : '';
      return `[sealed] <${control.role}> "${control.name}" @ (${cx}, ${cy})${flags.length ? ` {${flags.join(', ')}}` : ''}${token}`;
    });

    const text = [lines.join('\n'), frameLines.join('\n'), sealedLines.join('\n')].filter(Boolean).join('\n');
    const markRows = limited.map((m) => {
      const row: any = { ...m, facts: factsById.get(m.id) };
      if (!componentOn) delete row.component;
      return row;
    });
    const result: any = {
      count: limited.length + framed.frameMarks.length,
      total: filtered.length + framed.frameTotal,
      marks: markRows.concat(framed.frameMarks),
      text,
    };
    if (framed.frameNote) result.frameNote = framed.frameNote;
    if (sealedInfo) {
      result.sealed = sealedInfo.controls;
      result.sealedTotal = sealedInfo.total;
      result.sealedCached = sealedInfo.cached;
      result.sealedNotes = sealedInfo.notes;
    }
    return result;
  }
}
