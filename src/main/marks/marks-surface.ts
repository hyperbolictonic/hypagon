/**
 * Marks discovery surface.
 *
 * `MarksOverlay` owns injection and target lookup; this controller adds the
 * Shadow Walk policy, the page revision, the directive log and the read routes
 * for the active marks, sealed-node search and rendered snapshots.
 */
import type { WebContents } from 'electron';
import type { MarksOverlay, MarkItem } from './marks-overlay.js';
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
  refuseShadow(surface: ShadowWalkSurface): void;
  log(level: 'info' | 'warn' | 'action', message: string): void;
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
    return this.deps.marksOverlay.injectMarks(wc, {
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
}
