/**
 * Marks discovery surface.
 *
 * `MarksOverlay` owns injection and target lookup; this controller adds the
 * Shadow Walk policy, the page revision, the directive log and the read routes
 * for the active marks, sealed-node search and rendered snapshots.
 */
import type { WebContents } from 'electron';
import type { MarksOverlay, MarkItem } from './marks-overlay.js';
import { ElectronTarget } from '../../../packages/electron/src/target.ts';
import { resolveFrameMark } from '../browser/frame-marks.js';
import { DEEP_DOM_HELPERS } from '../primitives/dom-targeting.js';
import type { HumanizedInputSimulator } from '../telemetry/input-simulator.js';
import { findSealedControls, type SealedFindOptions, type SealedFindResult } from '../shadow-walk/ax-controls.js';
import { loadShadowWalkSettings, type ShadowWalkSurface } from '../shadow-walk/settings.js';
import {
  RenderedSnapshotEngine,
  type RenderedSnapshotOptions,
  type RenderedSnapshotResult,
} from '../snapshots/rendered-snapshot.js';

/** Dependencies the marks surface needs from the active tab and policy. */
export interface MarksSurfaceDeps {
  activeWebContents(): WebContents;
  revision(): number;
  marksOverlay: MarksOverlay;
  simulator: {
    pointer: Pick<HumanizedInputSimulator['pointer'], 'clickAt'>;
    keyboard: Pick<HumanizedInputSimulator['keyboard'], 'clearFocusedField' | 'typeText'>;
  };
  refuseShadow(surface: ShadowWalkSurface): void;
  log(level: 'info' | 'warn' | 'action', message: string): void;
  reportActing(): void;
  reportIdle(): void;
  emitClick(point: { x: number; y: number }, details: string): void;
  bumpRevision(): void;
}

/** The agent-facing marks discovery surface over MarksOverlay. */
export class MarksSurface {
  constructor(private readonly deps: MarksSurfaceDeps) {}

  /** Mark scan with the active Shadow Walk deep-open-roots policy applied. */
  async scan(
    wc: WebContents,
    opts: { includeOffscreen?: boolean; deepOpenRoots?: boolean } = {},
  ): Promise<MarkItem[]> {
    const settings = loadShadowWalkSettings();
    return this.deps.marksOverlay.injectMarks(new ElectronTarget(wc), {
      ...opts,
      deepOpenRoots: opts.deepOpenRoots ?? settings.shadow.deepOpenRoots,
    });
  }

  getActive(): MarkItem[] {
    return this.deps.marksOverlay.getActiveMarks();
  }

  /** Closed-shadow-root discovery (opt-in, cached, rate-limited). */
  async findSealed(options: SealedFindOptions = {}): Promise<SealedFindResult> {
    this.deps.refuseShadow('sealed');
    const wc = this.deps.activeWebContents();
    this.deps.log('action', `MCP Directive: find(sealed=true${options.name ? `, name="${options.name}"` : ''})`);
    return findSealedControls(wc, { ...options, revision: this.deps.revision() });
  }

  async snapshotRenderedPage(options: RenderedSnapshotOptions = {}): Promise<RenderedSnapshotResult> {
    const wc = this.deps.activeWebContents();
    this.deps.log('action', `MCP Directive: snapshot_rendered_page(format=${options.format || 'ax_tree'})`);
    return await RenderedSnapshotEngine.capture(wc, options);
  }

  async clickMark(markId: number): Promise<string> {
    const wc = this.deps.activeWebContents();
    this.deps.log('action', `MCP Directive: click_mark(#${markId})`);
    const target = await this.focusMark(wc, markId);

    this.deps.reportIdle();
    this.deps.emitClick(target.currentCenter, `Set-of-Marks: Clicked mark #${markId} [${target.mark.tag}: "${target.mark.text}"]`);
    this.deps.bumpRevision();
    return `Clicked mark #${markId} (${target.mark.tag}: "${target.mark.text}")`;
  }

  async typeMark(markId: number, text: string, opts: { secret?: boolean; clearFirst?: boolean } = {}): Promise<string> {
    const wc = this.deps.activeWebContents();
    const shown = opts.secret ? `[REDACTED ${String(text).length} chars]` : `"${text}"`;
    this.deps.log('action', `MCP Directive: type_mark(#${markId}, ${shown}${opts.clearFirst ? ', clear_first' : ''})`);
    const target = await this.focusMark(wc, markId, 100);

    // A stray or occluded click silently sends keystrokes nowhere (sticky headers,
    // lazy re-renders, a hidden window). Verify the target actually took focus and,
    // if not, re-resolve its live centre and click once more before typing.
    const focusedOk = markId >= 100
      ? true
      : await wc
          .executeJavaScript(
            `(() => {${DEEP_DOM_HELPERS}
              const el = kqDeep('[data-mark-id="${markId}"]');
              if (!el) return true;
              const a = kqActive();
              if (!a) return false;
              return a === el || kqContainsComposed(el, a) || kqContainsComposed(a, el);
            })()`
          )
          .catch(() => true);
    if (focusedOk === false) {
      this.deps.log('warn', `type_mark(#${markId}): target did not take focus after click; retrying once.`);
      const retry = await this.resolveMarkTarget(wc, markId).catch(() => null);
      if (retry) {
        await this.deps.simulator.pointer.clickAt(wc, retry.currentCenter);
        await new Promise((r) => setTimeout(r, 100));
      }
    }

    if (opts.clearFirst) {
      // Replace rather than append: the target may already hold a value (e.g. a pre-filled
      // origin/airport field), and appending silently corrupts it.
      await this.deps.simulator.keyboard.clearFocusedField(wc);
    }

    await this.deps.simulator.keyboard.typeText(wc, text);

    this.deps.reportIdle();
    this.deps.bumpRevision();

    return opts.secret
      ? `Focused mark #${markId} and typed ${String(text).length} chars (redacted)`
      : `Focused mark #${markId} and typed "${text}"`;
  }

  /**
   * Resolve a Set-of-Marks target: ids >= 100 live in iframes, the rest in the
   * overlay. Throws the refresh hint agents already retry on when the mark is
   * gone — the same failure for click, type and the focus retry.
   */
  private async resolveMarkTarget(wc: WebContents, markId: number) {
    const target = markId >= 100
      ? await resolveFrameMark(new ElectronTarget(wc), markId)
      : await this.deps.marksOverlay.getMarkTarget(new ElectronTarget(wc), markId);
    if (!target) {
      throw new Error(`Mark #${markId} not found. Call find(include_frames:true) or take_annotated_screenshot() to refresh marks.`);
    }
    return target;
  }

  /**
   * Focus a mark: resolve it, report the agent as acting, click its centre and
   * (optionally) settle — the shared prologue of click and type.
   */
  private async focusMark(wc: WebContents, markId: number, settleMs = 0) {
    const target = await this.resolveMarkTarget(wc, markId);
    this.deps.reportActing();
    await this.deps.simulator.pointer.clickAt(wc, target.currentCenter);
    if (settleMs) await new Promise((r) => setTimeout(r, settleMs));
    return target;
  }
}
