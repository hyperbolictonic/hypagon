/**
 * Shadow Walk surface.
 *
 * Owns the policy that Settings → Shadow Walk controls: arming the force-open
 * patch per tab, the read-only probes, frame listing/inventory and the trusted
 * Tab walk. The chassis supplies the active tab, the tab list, the log, key
 * transport, page capture and the revision counter.
 */
import type { NativeImage, WebContents } from 'electron';
import { listFrames, type FrameInfo } from '../browser/frames.js';
import { inventoryFrames, type FrameInventoryResult } from '../browser/frames-inventory.js';
import type { TabInstance } from '../tabs/tab-manager.js';
import { detectForceOpen, isForceOpenArmed, syncForceOpen, type ForceOpenDetection } from './force-open.js';
import { assertShadowSurface } from './guard.js';
import { loadShadowWalkSettings } from './settings.js';
import { runTabWalk, type TabWalkOptions, type TabWalkResult } from './tab-walk.js';

interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Dependencies the Shadow Walk surface needs from the tabs and page capture. */
export interface ShadowWalkSurfaceDeps {
  activeWebContents(): WebContents;
  allTabs(): TabInstance[];
  log(level: 'info' | 'warn' | 'action', message: string): void;
  pressKey(wc: WebContents, key: string): Promise<void>;
  bumpRevision(): void;
  capturePage(wc: WebContents, bounds: Bounds): Promise<NativeImage>;
}

/** The Settings → Shadow Walk policy, frame reads and the trusted Tab walk. */
export class ShadowWalkSurface {
  constructor(private readonly deps: ShadowWalkSurfaceDeps) {}

  /** Arm/disarm the force-open patch for the next document in this tab. */
  async syncForceOpen(wc: WebContents): Promise<{ armed: boolean; changed: boolean; error?: string }> {
    const settings = loadShadowWalkSettings();
    return syncForceOpen(wc, settings.enabled && settings.shadow.forceOpen);
  }

  /**
   * Apply the current Shadow Walk policy to every open tab. Existing documents are not patched;
   * the patch applies on their next navigation (the UI says so).
   */
  async applySettings(): Promise<{ tabs: number; errors: string[] }> {
    const settings = loadShadowWalkSettings();
    const shouldArm = settings.enabled && settings.shadow.forceOpen;
    const tabs = this.deps.allTabs();
    const errors: string[] = [];
    for (const tab of tabs) {
      const result = await syncForceOpen(tab.view.webContents, shouldArm);
      if (result.error) errors.push(result.error);
    }
    return { tabs: tabs.length, errors };
  }

  forceOpenArmed(): boolean {
    try {
      return isForceOpenArmed(this.deps.activeWebContents());
    } catch {
      return false;
    }
  }

  /** A fingerprinting-style probe of the active document (read-only). */
  async detectPatch(): Promise<ForceOpenDetection> {
    return detectForceOpen(this.deps.activeWebContents());
  }

  /** Frame tree + top-level geometry (no content scan). */
  async listFrames(options: { maxFrames?: number } = {}): Promise<FrameInfo[]> {
    assertShadowSurface('frames');
    return listFrames(this.deps.activeWebContents(), options);
  }

  /** Trusted Tab/Shift+Tab walk into a (possibly closed) shadow subtree. */
  async focusWalk(options: TabWalkOptions): Promise<TabWalkResult> {
    assertShadowSurface('tabWalk');
    const settings = loadShadowWalkSettings();
    const wc = this.deps.activeWebContents();
    const maxSteps = Math.min(
      options.maxSteps ?? settings.shadow.tabWalkMaxSteps,
      settings.shadow.tabWalkMaxSteps,
    );
    const restore = options.restore ?? settings.shadow.tabWalkRestoreFocus;
    this.deps.log(
      'action',
      `MCP Directive: focus_walk(${options.selector || `${options.x},${options.y}`}, ${options.direction || 'forward'})`,
    );
    const result = await runTabWalk(wc, { ...options, maxSteps, restore }, (key) => this.deps.pressKey(wc, key));
    this.deps.bumpRevision();
    return result;
  }

  /**
   * A frame as first-class content: where it is, what is inside it, and (optionally) what it looks
   * like. Frame-local control rects are offset into the top-level viewport, so the result can be
   * clicked with act(x, y) or read coordinate-free.
   *
   * Opt-in and bounded: the frame walk costs CDP commands per frame, and screenshots cost one
   * capture plus one crop per visible frame. `find(include_frames)` uses the same scan.
   */
  async getFrames(options: {
    includeControls?: boolean;
    screenshots?: boolean;
    maxFrames?: number;
    maxControls?: number;
    selector?: string;
    includeOffscreen?: boolean;
    skipHitTest?: boolean;
    maxSide?: number;
  } = {}): Promise<FrameInventoryResult> {
    assertShadowSurface('frames');
    return inventoryFrames(this.deps.activeWebContents(), options, {
      log: (level, message) => this.deps.log(level, message),
      capturePage: (wc, bounds) => this.deps.capturePage(wc, bounds),
    });
  }
}
