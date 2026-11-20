/**
 * Primitives part: find.
 */
import { controlFactsExpression, parseControlFacts } from './control-facts.js';
import type { SealedControl, SealedFindResult } from '../shadow-walk/ax-controls.js';
import type { FindOptions } from './types.js';
import { PrimitiveError } from './error.js';
import { PrimitivesObserve } from './part-observe.js';
import { frameControls } from './frame-controls.js';

/** When to use: the find part of the primitives chain, composed into the public class. */
export class PrimitivesFind extends PrimitivesObserve {

  public async find(opts: FindOptions = {}): Promise<any> {
    // Sealed discovery is guarded before marks are injected: a refused call must not mutate the
    // page first. It is also independent of the mark table, so doing it first is cheaper on refusal.
    let sealedInfo: SealedFindResult | undefined;
    if (opts.sealed) {
      if (!this.host.findSealed) {
        throw new PrimitiveError('NOT_SUPPORTED', 'Sealed shadow-root discovery is not available in this build.');
      }
      sealedInfo = await this.host.findSealed({
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

    const marks = await this.host.injectMarks({ includeOffscreen: opts.includeOffscreen !== false });
    const componentOn = this.host.componentSurfaceEnabled?.() !== false;
    let selectorIds: Set<number> | null = null;
    if (opts.selector) {
      const ids: number[] = await this.host
        .evaluate(
          `(() => { const out = []; document.querySelectorAll('[data-mark-id]').forEach((el) => { try { if (el.matches(${JSON.stringify(opts.selector)})) out.push(Number(el.getAttribute('data-mark-id'))); } catch (e) {} }); return out; })()`
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
    let factsById = new Map<number, { visible: boolean; occluded: boolean; disabled: boolean; region: string }>();
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

    const lines = limited.map((m) => {
      const facts = factsById.get(m.id);
      // `disabled` is already printed from the mark's own state; only add what the marks table
      // cannot know (live occlusion / hidden state).
      const flags = facts ? [facts.occluded ? 'occluded' : '', facts.visible ? '' : 'hidden'].filter(Boolean) : [];
      return this.markLine(m) + (flags.length ? ` {${flags.join(', ')}}` : '');
    });

    // Opt-in frame marks: `getFrames` stamps child controls with 100+ IDs and registers them for
    // live resolution. The main-frame marks stay 1..99, so the two sets never collide.
    const frameMarks: any[] = [];
    let frameTotal = 0;
    let frameNote: string | undefined;
    if (opts.includeFrames) {
      if (!this.host.getFrames) {
        frameNote = 'Frame scanning is not available in this build.';
      } else {
        try {
          const data = await this.host.getFrames({
            includeControls: true,
            screenshots: false,
            maxFrames: 6,
            maxControls: Math.max(limit, 40),
            includeOffscreen: opts.includeOffscreen !== false,
          });
          const wantRole = opts.role ? String(opts.role).toLowerCase() : '';
          for (const frame of data.frames || []) {
            for (const control of frameControls(frame)) {
              const tag = String(control.tag || '').toUpperCase();
              const role = String(control.role || '').toLowerCase();
              const implied = tag === 'A' ? 'link' : tag === 'BUTTON' ? 'button' : '';
              if (opts.tag && tag.toLowerCase() !== opts.tag.toLowerCase()) continue;
              if (wantRole && role !== wantRole && implied !== wantRole) continue;
              const hay = `${control.name || ''} ${control.value || ''}`.toLowerCase();
              if (want && hay.indexOf(want) === -1) continue;
              if (re && !re.test(`${control.name || ''} ${control.value || ''}`)) continue;
              frameTotal += 1;
              if (limited.length + frameMarks.length >= limit) continue;
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
          }
          if (!frameMarks.length) frameNote = 'No matching controls inside child frames.';
        } catch (err: any) {
          frameNote = `Frame scan unavailable: ${String(err?.message || err)}`;
        }
      }
    }

    const frameLines = frameMarks.map((m) => {
      const flags = [m.facts?.occluded ? 'occluded' : '', m.facts?.visible === false ? 'hidden' : ''].filter(Boolean);
      return `[frame] ${this.markLine(m)}${flags.length ? ` {${flags.join(', ')}}` : ''}`;
    });

    let sealed: SealedControl[] | undefined;
    if (sealedInfo) {
      sealed = sealedInfo.controls;
    }

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
      count: limited.length + frameMarks.length,
      total: filtered.length + frameTotal,
      marks: markRows.concat(frameMarks),
      text,
    };
    if (frameNote) result.frameNote = frameNote;
    if (sealedInfo) {
      result.sealed = sealedInfo.controls;
      result.sealedTotal = sealedInfo.total;
      result.sealedCached = sealedInfo.cached;
      result.sealedNotes = sealedInfo.notes;
    }
    return result;
  }
}
