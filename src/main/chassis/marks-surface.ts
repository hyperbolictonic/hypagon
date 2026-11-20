/**
 * The Set-of-Marks surface: annotated screenshots, mark clicks, mark typing and the active list.
 */
import type { WebContents } from 'electron';
import type { ZoomState } from '../../shared/zoom.js';
import type { MarkItem } from '../marks/marks-overlay.js';
import { saveCapture } from '../snapshots/screenshot-store.js';
import { resolveFrameMark } from '../browser/frame-marks.js';
import { DEEP_DOM_HELPERS } from '../primitives/dom-targeting.js';

/** When to use: constructing the marks surface from the chassis' own services. */
export interface MarksSurfaceDeps {
  marksOverlay: any;
  simulator: any;
  state: any;
  log: (level: 'info' | 'warn' | 'action', message: string) => void;
  webContents: () => WebContents;
  broadcastState: () => void;
  bumpRevision: () => void;
  telemetry: (event: any) => void;
  viewportBounds: () => { x: number; y: number; width: number; height: number };
  scanMarks: (wc: WebContents, opts: any) => Promise<any>;
  zoomState: () => any;
  capturePageWithRetry: (wc: WebContents, bounds: any) => Promise<any>;
}

/** When to use: `chassis.marks` — Set-of-Marks capture and actuation. */
export class MarksSurface {
  constructor(private readonly deps: MarksSurfaceDeps) {}

  public async takeAnnotatedScreenshot(opts: { economy?: boolean; textOnly?: boolean; includeOffscreen?: boolean } = {}): Promise<{
    screenshot: {
      base64Image: string;
      filePath: string;
      width: number;
      height: number;
      mimeType: string;
      zoom: ZoomState;
      nativeWidth: number;
      nativeHeight: number;
      coordinateScale: number;
    };
    marks: MarkItem[];
  }> {
    const wc = this.deps.webContents();
    const economy = Boolean(opts.economy);
    const textOnly = Boolean(opts.textOnly);
    const includeOffscreen = Boolean(opts.includeOffscreen);
    this.deps.log('action', `MCP Directive: take_annotated_screenshot(${textOnly ? 'text_only' : economy ? 'economy' : 'full'}${includeOffscreen ? ', include_offscreen' : ''})`);

    // Text-only: badges are only needed to populate the mark registry; no pixels are captured.
    if (textOnly) {
      const textMarks = await this.deps.scanMarks(wc, { includeOffscreen });
      await this.deps.marksOverlay.removeMarks(wc);
      const viewport = this.deps.viewportBounds();
      const zoom = this.deps.zoomState();
      return {
        screenshot: {
          base64Image: '',
          filePath: '',
          width: viewport.width,
          height: viewport.height,
          mimeType: 'image/png',
          zoom,
          nativeWidth: viewport.width,
          nativeHeight: viewport.height,
          coordinateScale: zoom.viewport.css.width > 0 ? viewport.width / zoom.viewport.css.width : 1,
        },
        marks: textMarks,
      };
    }

    // 1. Inject visual badges into DOM
    const marks = await this.deps.scanMarks(wc, { includeOffscreen });

    // Wait a brief tick for render paint
    await new Promise((r) => setTimeout(r, 80));

    // 2. Capture annotated screenshot
    const bounds = this.deps.viewportBounds();
    const image = await this.deps.capturePageWithRetry(wc, bounds);

    // 3. Immediately clean up marks from DOM
    await this.deps.marksOverlay.removeMarks(wc);
    const zoom = this.deps.zoomState();
    const nativeSize = image.getSize();

    // Economy mode: downscale to max 640px wide and encode as JPEG (~10-20x smaller payload)
    const ECONOMY_MAX_WIDTH = 640;
    let outImage = image;
    if (economy && image.getSize().width > ECONOMY_MAX_WIDTH) {
      outImage = image.resize({ width: ECONOMY_MAX_WIDTH, quality: 'good' });
    }
    const size = outImage.getSize();
    const mimeType = economy ? 'image/jpeg' : 'image/png';
    const buffer = economy ? outImage.toJPEG(45) : outImage.toPNG();
    const base64Image = `data:${mimeType};base64,${buffer.toString('base64')}`;

    // 4. Save to disk & run retention cleanup
    const filePath = saveCapture(buffer, `annotated_${economy ? 'eco_' : ''}${Date.now()}.${economy ? 'jpg' : 'png'}`);

    this.deps.telemetry({
      type: 'harvest',
      timestamp: Date.now(),
      details: `Set-of-Marks: Tagged ${marks.length} interactive targets, saved to ${filePath}`,
    });

    return {
      screenshot: {
        base64Image,
        filePath,
        width: size.width,
        height: size.height,
        mimeType,
        zoom,
        nativeWidth: nativeSize.width,
        nativeHeight: nativeSize.height,
        coordinateScale: zoom.viewport.css.width > 0 ? size.width / zoom.viewport.css.width : 1,
      },
      marks,
    };
  }

  public async clickMark(markId: number): Promise<string> {
    const wc = this.deps.webContents();
    this.deps.log('action', `MCP Directive: click_mark(#${markId})`);
    const target = markId >= 100
      ? await resolveFrameMark(wc, markId)
      : await this.deps.marksOverlay.getMarkTarget(wc, markId);
    if (!target) {
      throw new Error(`Mark #${markId} not found. Call find(include_frames:true) or take_annotated_screenshot() to refresh marks.`);
    }

    this.deps.state.agentStatus = 'SIMULATING_INPUT';
    this.deps.broadcastState();

    await this.deps.simulator.clickAt(wc, target.currentCenter);

    this.deps.state.agentStatus = 'IDLE';
    this.deps.broadcastState();

    this.deps.telemetry({
      type: 'click',
      x: target.currentCenter.x,
      y: target.currentCenter.y,
      timestamp: Date.now(),
      details: `Set-of-Marks: Clicked mark #${markId} [${target.mark.tag}: "${target.mark.text}"]`,
    });

    this.deps.bumpRevision();
    return `Clicked mark #${markId} (${target.mark.tag}: "${target.mark.text}")`;
  }

  public async typeMark(markId: number, text: string, opts: { secret?: boolean; clearFirst?: boolean } = {}): Promise<string> {
    const wc = this.deps.webContents();
    const shown = opts.secret ? `[REDACTED ${String(text).length} chars]` : `"${text}"`;
    this.deps.log('action', `MCP Directive: type_mark(#${markId}, ${shown}${opts.clearFirst ? ', clear_first' : ''})`);
    const target = markId >= 100
      ? await resolveFrameMark(wc, markId)
      : await this.deps.marksOverlay.getMarkTarget(wc, markId);
    if (!target) {
      throw new Error(`Mark #${markId} not found. Call find(include_frames:true) or take_annotated_screenshot() to refresh marks.`);
    }

    this.deps.state.agentStatus = 'SIMULATING_INPUT';
    this.deps.broadcastState();

    await this.deps.simulator.clickAt(wc, target.currentCenter);
    await new Promise((r) => setTimeout(r, 100));

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
      const retry = markId >= 100 ? await resolveFrameMark(wc, markId) : await this.deps.marksOverlay.getMarkTarget(wc, markId);
      if (retry) {
        await this.deps.simulator.clickAt(wc, retry.currentCenter);
        await new Promise((r) => setTimeout(r, 100));
      }
    }

    if (opts.clearFirst) {
      // Replace rather than append: the target may already hold a value (e.g. a pre-filled
      // origin/airport field), and appending silently corrupts it.
      await this.deps.simulator.clearFocusedField(wc);
    }

    await this.deps.simulator.typeText(wc, text);

    this.deps.state.agentStatus = 'IDLE';
    this.deps.broadcastState();
    this.deps.bumpRevision();

    return opts.secret
      ? `Focused mark #${markId} and typed ${String(text).length} chars (redacted)`
      : `Focused mark #${markId} and typed "${text}"`;
  }

  public getActiveMarks(): MarkItem[] {
    return this.deps.marksOverlay.getActiveMarks();
  }
}
