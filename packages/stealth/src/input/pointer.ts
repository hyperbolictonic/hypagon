/**
 * The pointer: an organic glide, the in-page ghost cursor, and a humanized click.
 *
 * The glide budget, the sample pacing and the press/release dwell are one
 * choreography, and the click is the glide plus three pauses. Keeping it away from
 * the keyboard means each can be read on its own.
 */
import type { BrowserTarget } from '@hyperbolictonic/hypagon-browser';
import { generateOrganicTrajectory, type ChaosKinematicsOptions, type PathStep, type Point } from '../movement/bezier.ts';
import type { CdpInput } from './cdp-input.ts';
import type { InputState } from './context.ts';
import { VISUAL_CURSOR_SCRIPT } from './cursor-overlay.ts';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Dispatch at most this many mouse moves for one glide. */
const MAX_DISPATCH_POINTS = 12;

/** When to use: `HumanizedInput` — everything that moves the pointer. */
export class HumanPointer {
  private readonly state: InputState;
  private readonly cdp: CdpInput;

  constructor(state: InputState, cdp: CdpInput) {
    this.state = state;
    this.cdp = cdp;
  }

  /** Moves the mouse smoothly along an organic trajectory to target coordinates. */
  async moveMouseTo(target: BrowserTarget, point: Point, options?: ChaosKinematicsOptions): Promise<void> {
    this.cdp.ensureTarget(target);
    const trajectory = generateOrganicTrajectory(this.state.cursor, point, options);

    await this.ensureVisualCursor(target);

    const points = this.samplePath(trajectory);
    const budgetMs = this.budgetMs(Math.hypot(point.x - this.state.cursor.x, point.y - this.state.cursor.y));
    await this.glide(target, points, budgetMs);
    await this.land(target, point, points.length);

    // Report the glide ONCE, not once per step. The in-page trail is already drawn
    // per step, so emitting a telemetry event per step only flooded the HUD — one click
    // produced 38-140 `mouse_move` rows.
    const lastStep = trajectory.length > 0 ? trajectory[trajectory.length - 1] : null;
    this.state.reporter?.onMouseMove?.(this.state.cursor, lastStep ? lastStep.velocity : 0);
  }

  /**
   * A 140-step trajectory means 140 awaited CDP round trips; on a heavy page each costs
   * 50-300ms. Two knobs, both distance-aware: a fast human flicks ~500px in 250-400ms and a
   * short hop is near-instant. Budget = distance / speed from the profile;
   * KUANG_CURSOR_BUDGET_MS overrides it with a fixed value (0 = no artificial dwell at all).
   */
  private budgetMs(distance: number): number {
    const rawBudget = process.env.KUANG_CURSOR_BUDGET_MS;
    if (rawBudget !== undefined && rawBudget !== '') {
      const n = Number(rawBudget);
      if (Number.isFinite(n) && n >= 0) return n;
    }
    const ms = (distance / Math.max(200, this.state.profile.mouseSpeedPxPerSec)) * 1000;
    return Math.round(Math.min(800, Math.max(70, ms)));
  }

  /** Thin the trajectory to at most MAX_DISPATCH_POINTS samples, always keeping the last. */
  private samplePath(trajectory: PathStep[]): PathStep[] {
    const stride = Math.max(1, Math.ceil(trajectory.length / MAX_DISPATCH_POINTS));
    const points: PathStep[] = [];
    for (let i = 0; i < trajectory.length; i++) {
      if (i % stride === 0 || i === trajectory.length - 1) points.push(trajectory[i]);
    }
    return points;
  }

  /** Walk the samples, drawing the trail every third one and pacing to the budget. */
  private async glide(target: BrowserTarget, points: PathStep[], budgetMs: number): Promise<void> {
    // Pace the samples to fill the budget exactly, instead of summing the (much longer) raw
    // per-step cadence. Never below 4ms: back-to-back CDP moves coalesce into one jump.
    const rawPacing = points.reduce((sum, step) => sum + Math.max(6, step.delayMs), 0);
    const pace = rawPacing > 0 ? budgetMs / rawPacing : 0;

    let sampleIndex = 0;
    for (const step of points) {
      const viewStep = this.cdp.toViewPoint(target, step);
      const factor = this.cdp.viewportFactor(target);
      await this.cdp.dispatch(
        target,
        'Input.dispatchMouseEvent',
        { type: 'mouseMoved', x: viewStep.x, y: viewStep.y, button: 'none', buttons: 0, pointerType: 'mouse' },
        () => {
          this.state.native?.mouseMove?.(
            target,
            viewStep.x,
            viewStep.y,
            (step.x - this.state.cursor.x) * factor,
            (step.y - this.state.cursor.y) * factor,
          );
        },
      );

      // Draw the trail every third sample (and the last one). One evaluate per sample
      // queues work on the renderer's main thread, and the awaited CDP moves then wait
      // behind it — on a heavy page that cost more than the glide itself.
      const drawTrail = sampleIndex % 3 === 0 || sampleIndex === points.length - 1;
      if (drawTrail) {
        target
          .evaluate(
            `window.__kuangMoveCursor && window.__kuangMoveCursor(${step.x}, ${step.y}, ${step.isCorrective ? 'true' : 'false'})`,
            { userGesture: true },
          )
          .catch(() => undefined);
      }
      sampleIndex++;

      this.state.cursor = { x: step.x, y: step.y };

      if (budgetMs > 0) await sleep(Math.max(4, Math.min(step.delayMs * pace, 40)));
    }
  }

  /** Land exactly on target — the sampled path can end a pixel or two off. */
  private async land(target: BrowserTarget, point: Point, sampled: number): Promise<void> {
    if (sampled > 0 && this.state.cursor.x === point.x && this.state.cursor.y === point.y) return;
    const viewTarget = this.cdp.toViewPoint(target, point);
    await this.cdp.dispatch(
      target,
      'Input.dispatchMouseEvent',
      { type: 'mouseMoved', x: viewTarget.x, y: viewTarget.y, button: 'none', buttons: 0, pointerType: 'mouse' },
      () => {
        this.state.native?.mouseMove?.(target, viewTarget.x, viewTarget.y, 0, 0);
      },
    );
    this.state.cursor = { x: point.x, y: point.y };
  }

  /** Install the in-page ghost cursor once per document. */
  async ensureVisualCursor(target: BrowserTarget): Promise<void> {
    if (!target) return;
    try {
      await target.evaluate(VISUAL_CURSOR_SCRIPT, { userGesture: true });
    } catch {
      // The overlay is cosmetic; a cross-origin or closing document may refuse it.
    }
  }

  /** One mouse-button transition: CDP first, a native fallback otherwise. */
  private async dispatchMouseTransition(
    target: BrowserTarget,
    type: 'mousePressed' | 'mouseReleased',
    point: Point,
    button: 'left' | 'right' | 'middle',
    clickCount: number,
  ): Promise<void> {
    const pressed = type === 'mousePressed';
    await this.cdp.dispatch(
      target,
      'Input.dispatchMouseEvent',
      { type, x: point.x, y: point.y, button, buttons: pressed ? 1 : 0, clickCount, pointerType: 'mouse' },
      () => {
        this.state.native?.mouseButton?.(target, point.x, point.y, button, clickCount, pressed ? 'down' : 'up');
      },
    );
  }

  /**
   * Simulates a humanized click: traverse via an organic path, hesitate, press, hold
   * and release.
   */
  async clickAt(
    target: BrowserTarget,
    point: Point,
    options?: { button?: 'left' | 'right' | 'middle'; clickCount?: number },
  ): Promise<void> {
    this.state.metrics?.click?.();
    const button = options?.button ?? 'left';
    const clickCount = options?.clickCount ?? 1;

    await this.moveMouseTo(target, point);

    // Trigger the visual in-page ripple.
    target
      .evaluate(`window.__kuangClickCursor && window.__kuangClickCursor(${point.x}, ${point.y})`, { userGesture: true })
      .catch(() => undefined);

    // Pre-click hesitation (mimicking visual confirmation), scaled by the profile.
    await sleep(Math.max(0, this.state.profile.clickDwellMs * (0.6 + Math.random() * 0.6)));

    const viewTarget = this.cdp.toViewPoint(target, point);

    await this.dispatchMouseTransition(target, 'mousePressed', viewTarget, button, clickCount);

    // Contact duration (finger depressing mouse switch), scaled by the profile.
    await sleep(Math.max(0, this.state.profile.clickDwellMs * (0.8 + Math.random() * 0.5)));

    await this.dispatchMouseTransition(target, 'mouseReleased', viewTarget, button, clickCount);

    this.state.reporter?.onClick?.(point);

    // Post-click recovery pause.
    await sleep(40 + Math.random() * 60);
  }
}
