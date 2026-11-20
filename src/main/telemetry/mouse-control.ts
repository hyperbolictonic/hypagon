/**
 * Pointer control: the organic glide, the click, and the inertial scroll.
 *
 * A 140-step trajectory means 140 awaited CDP round trips; on a heavy page each one costs
 * 50-300ms, so a single click took 40-50s. The path is sampled to at most 12 dispatch points and
 * paced to a distance-aware budget, so the glide matches a comfortable mouse instead of a
 * slow-motion replay. The ghost-cursor trail is drawn in the page (see `visual-cursor.ts`).
 *
 * When to use: `HumanizedInputSimulator` for every pointer method.
 */
import type { WebContents } from 'electron';
import { generateOrganicTrajectory, type Point, type ChaosKinematicsOptions } from './bezier.js';
import { bump } from '../metrics.js';
import { ensureVisualCursor } from './visual-cursor.js';
import type { CdpInput } from './cdp-input.js';
import type { InputTelemetryReporter } from './input-types.js';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** When to use: constructing pointer control from the simulator's transport and profile. */
export interface MouseControlHooks {
  readonly cdp: CdpInput;
  readonly speedPxPerSec: () => number;
  readonly clickDwellMs: () => number;
  readonly reporter?: InputTelemetryReporter;
}

/** When to use: one per simulator — it owns the cursor position and the emulation scales. */
export class MouseControl {
  private cursor: Point = { x: 100, y: 100 };
  /** Per-WebContents emulation scale: CSS coordinates become view coordinates by multiplying. */
  private readonly viewportScales = new WeakMap<WebContents, number>();
  private readonly hooks: MouseControlHooks;

  constructor(hooks: MouseControlHooks) {
    this.hooks = hooks;
  }

  /** Register the letterbox scale of a device-emulated tab (1 clears it). */
  setViewportScale(webContents: WebContents, scale: number): void {
    if (!webContents) return;
    if (Number.isFinite(scale) && scale > 0 && scale !== 1) this.viewportScales.set(webContents, scale);
    else this.viewportScales.delete(webContents);
  }

  /** When to use: reporting the last synthetic pointer position. */
  getCursorPosition(): Point {
    return { ...this.cursor };
  }

  /** Map a CSS point into the native view's DIP space under device emulation. */
  private toViewPoint(webContents: WebContents, point: Point): Point {
    const scale = this.viewportScales.get(webContents);
    if (!scale) return point;
    return { x: point.x * scale, y: point.y * scale };
  }

  private viewportFactor(webContents: WebContents): number {
    return this.viewportScales.get(webContents) ?? 1;
  }

  /** Moves the mouse smoothly along an organic Bézier trajectory to target coordinates. */
  async moveMouseTo(webContents: WebContents, target: Point, options?: ChaosKinematicsOptions): Promise<void> {
    this.hooks.cdp.ensureTarget(webContents);
    const trajectory = generateOrganicTrajectory(this.cursor, target, options);

    // Initialize visual ghost cursor overlay inside the web page if needed
    await ensureVisualCursor(webContents);

    // Two knobs, both distance-aware so the glide matches a comfortable mouse rather than a
    // slow-motion replay: a fast human flicks ~500px in 250-400ms (1200+dpi gaming mouse even
    // quicker), and a short hop is near-instant. Budget = distance / speed, from the profile;
    // KUANG_CURSOR_BUDGET_MS overrides it with a fixed value (0 = no artificial dwell at all).
    const MAX_DISPATCH_POINTS = 12;
    const distance = Math.hypot(target.x - this.cursor.x, target.y - this.cursor.y);
    const rawBudget = process.env.KUANG_CURSOR_BUDGET_MS;
    const CURSOR_BUDGET_MS = (() => {
      if (rawBudget !== undefined && rawBudget !== '') {
        const n = Number(rawBudget);
        if (Number.isFinite(n) && n >= 0) return n;
      }
      const ms = (distance / Math.max(200, this.hooks.speedPxPerSec())) * 1000;
      return Math.round(Math.min(800, Math.max(70, ms)));
    })();

    const stride = Math.max(1, Math.ceil(trajectory.length / MAX_DISPATCH_POINTS));
    const points: typeof trajectory = [];
    for (let i = 0; i < trajectory.length; i++) {
      if (i % stride === 0 || i === trajectory.length - 1) points.push(trajectory[i]);
    }
    // Pace the samples to fill the budget exactly, instead of summing the (much longer) raw
    // per-step cadence. Never below 4ms: back-to-back CDP moves coalesce into one jump.
    const rawPacing = points.reduce((sum, s) => sum + Math.max(6, s.delayMs), 0);
    const pace = rawPacing > 0 ? CURSOR_BUDGET_MS / rawPacing : 0;

    let sampleIndex = 0;
    for (const step of points) {
      const viewStep = this.toViewPoint(webContents, step);
      const factor = this.viewportFactor(webContents);
      await this.hooks.cdp.dispatch(
        webContents,
        'Input.dispatchMouseEvent',
        { type: 'mouseMoved', x: viewStep.x, y: viewStep.y, button: 'none', buttons: 0, pointerType: 'mouse' },
        () => {
          webContents.sendInputEvent({
            type: 'mouseMove',
            x: viewStep.x,
            y: viewStep.y,
            movementX: (step.x - this.cursor.x) * factor,
            movementY: (step.y - this.cursor.y) * factor,
          });
        },
      );

      // Draw the trail every third sample (and the last one). One executeJavaScript per sample
      // queues work on the renderer's main thread, and the awaited CDP moves then wait behind it
      // — on a heavy page that cost more than the glide itself.
      const drawTrail = sampleIndex % 3 === 0 || sampleIndex === points.length - 1;
      if (drawTrail) {
        webContents.executeJavaScript(
          `window.__kuangMoveCursor && window.__kuangMoveCursor(${step.x}, ${step.y}, ${step.isCorrective ? 'true' : 'false'})`,
          true,
        ).catch(() => {});
      }
      sampleIndex++;

      this.cursor = { x: step.x, y: step.y };

      if (CURSOR_BUDGET_MS > 0) await sleep(Math.max(4, Math.min(step.delayMs * pace, 40)));
    }

    // Land exactly on target (the sampled path can end a pixel or two off).
    if (points.length === 0 || this.cursor.x !== target.x || this.cursor.y !== target.y) {
      const viewTarget = this.toViewPoint(webContents, target);
      await this.hooks.cdp.dispatch(
        webContents,
        'Input.dispatchMouseEvent',
        { type: 'mouseMoved', x: viewTarget.x, y: viewTarget.y, button: 'none', buttons: 0, pointerType: 'mouse' },
        () => {
          webContents.sendInputEvent({ type: 'mouseMove', x: viewTarget.x, y: viewTarget.y });
        },
      );
      this.cursor = { x: target.x, y: target.y };
    }

    // Report the glide ONCE, not once per step. The in-page phosphor trail is already drawn
    // per step above, so emitting a telemetry event per step only flooded the HUD.
    const lastStep = trajectory.length > 0 ? trajectory[trajectory.length - 1] : null;
    this.hooks.reporter?.onMouseMove?.(this.cursor, lastStep ? lastStep.velocity : 0);
  }

  /** When to use: clickAt — one button event over CDP with the native fallback. */
  private async buttonEvent(
    webContents: WebContents,
    target: Point,
    event: {
      cdpType: 'mousePressed' | 'mouseReleased';
      nativeType: 'mouseDown' | 'mouseUp';
      button: 'left' | 'right' | 'middle';
      buttons: number;
      clickCount: number;
    },
  ): Promise<void> {
    const viewTarget = this.toViewPoint(webContents, target);
    await this.hooks.cdp.dispatch(
      webContents,
      'Input.dispatchMouseEvent',
      {
        type: event.cdpType,
        x: viewTarget.x,
        y: viewTarget.y,
        button: event.button,
        buttons: event.buttons,
        clickCount: event.clickCount,
        pointerType: 'mouse',
      },
      () => {
        webContents.sendInputEvent({
          type: event.nativeType,
          x: viewTarget.x,
          y: viewTarget.y,
          button: event.button,
          clickCount: event.clickCount,
        });
      },
    );
  }

  /**
   * Simulates a humanized click: glide, hesitate, mouseDown, dwell, mouseUp, recover.
   */
  async clickAt(
    webContents: WebContents,
    target: Point,
    options?: { button?: 'left' | 'right' | 'middle'; clickCount?: number },
  ): Promise<void> {
    bump('action.click');
    const button = options?.button ?? 'left';
    const clickCount = options?.clickCount ?? 1;

    // Move to location
    await this.moveMouseTo(webContents, target);

    // Trigger visual in-page ripple
    webContents.executeJavaScript(
      `window.__kuangClickCursor && window.__kuangClickCursor(${target.x}, ${target.y})`,
      true,
    ).catch(() => {});

    // Pre-click hesitation (mimicking visual confirmation), scaled by the profile.
    await sleep(Math.max(0, this.hooks.clickDwellMs() * (0.6 + Math.random() * 0.6)));

    const viewTarget = this.toViewPoint(webContents, target);

    // Mouse Down
    await this.buttonEvent(webContents, target, {
      cdpType: 'mousePressed',
      nativeType: 'mouseDown',
      button,
      buttons: 1,
      clickCount,
    });

    // Contact duration (finger depressing mouse switch), scaled by the profile.
    await sleep(Math.max(0, this.hooks.clickDwellMs() * (0.8 + Math.random() * 0.5)));

    // Mouse Up
    await this.buttonEvent(webContents, target, {
      cdpType: 'mouseReleased',
      nativeType: 'mouseUp',
      button,
      buttons: 0,
      clickCount,
    });

    this.hooks.reporter?.onClick?.(target);

    // Post-click recovery pause
    await sleep(40 + Math.random() * 60);
  }

  /** Smoothly scrolls the page in incremental chunks simulating mousewheel inertia. */
  async scrollPage(webContents: WebContents, deltaY: number, chunks: number = 8): Promise<void> {
    this.hooks.cdp.ensureTarget(webContents);
    bump('action.scroll');
    const step = Math.round(deltaY / chunks);
    for (let i = 0; i < chunks; i++) {
      const viewCursor = this.toViewPoint(webContents, this.cursor);
      await this.hooks.cdp.dispatch(
        webContents,
        'Input.dispatchMouseEvent',
        { type: 'mouseWheel', x: viewCursor.x, y: viewCursor.y, deltaX: 0, deltaY: -step, pointerType: 'mouse' },
        () => {
          webContents.sendInputEvent({
            type: 'mouseWheel',
            x: viewCursor.x,
            y: viewCursor.y,
            deltaX: 0,
            deltaY: -step,
            canScroll: true,
          });
        },
      );

      this.hooks.reporter?.onScroll?.(step);
      await sleep(25 + Math.random() * 20);
    }
  }
}
