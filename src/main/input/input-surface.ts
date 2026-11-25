/**
 * Humanized input surface.
 *
 * Owns the input simulator, the click/type/fill/scroll actions, the trusted key
 * press and the chaos trajectory helpers. The chassis supplies the active tab,
 * the telemetry sinks, the human-takeover gate and the agent-status reports, so
 * the surface never reaches back into the chassis for state.
 */
import type { WebContents } from 'electron';
import { InputActionsController, type InputActionsStatus } from '../input-actions.js';
import { generateChaosTrajectory, type ChaosKinematicsOptions, type PathStep } from '../telemetry/chaos-kinematics.js';
import { loadInputProfile } from '../telemetry/input-profile.js';
import { HumanizedInputSimulator } from '../telemetry/input-simulator.js';

/** Dependencies the input surface needs from the active tab and chassis state. */
export interface InputSurfaceDeps {
  activeWebContents(): WebContents;
  /** Mouse-move sink: the new cursor position and the observed velocity. */
  onMouseMove(point: { x: number; y: number }, velocity: number): void;
  onClick(point: { x: number; y: number }): void;
  onKey(char: string, delay: number): void;
  onScroll(deltaY: number): void;
  /** Stamp a synthetic dispatch so the human-activity monitor can tell it apart. */
  markSynthetic(at: number): void;
  /** Refuse input while the human has the wheel. */
  humanActive(): boolean;
  status: InputActionsStatus;
  log(level: 'info' | 'warn' | 'action', message: string): void;
  bumpRevision(): void;
}

/** The humanized input path shared by the primitive actions and the bridge routes. */
export class InputSurface {
  readonly simulator: HumanizedInputSimulator;
  private readonly actions: InputActionsController;

  constructor(private readonly deps: InputSurfaceDeps) {
    this.simulator = new HumanizedInputSimulator({
      onMouseMove: deps.onMouseMove,
      onClick: deps.onClick,
      onKey: deps.onKey,
      onScroll: deps.onScroll,
    });

    // Human pacing knobs (Settings → INPUT); loaded once at boot, updated live over IPC.
    this.simulator.setProfile(loadInputProfile());
    // Takeover arbitration: every synthetic dispatch is stamped so the monitor can tell our input
    // from the person's, and the gate refuses input while the human has the wheel.
    this.simulator.setSyntheticMarker((at) => deps.markSynthetic(at));
    this.simulator.setHumanGate(() => deps.humanActive());

    this.actions = new InputActionsController({
      activeWebContents: () => this.deps.activeWebContents(),
      simulator: () => this.simulator,
      status: this.deps.status,
      log: this.deps.log,
      bumpRevision: this.deps.bumpRevision,
    });
  }


  clickElement(selector?: string, coordinates?: { x: number; y: number }): Promise<string> {
    return this.actions.clickElement(selector, coordinates);
  }

  typeText(text: string, selector?: string, opts: { clearFirst?: boolean } = {}): Promise<string> {
    return this.actions.typeText(text, selector, opts);
  }

  fillForm(
    fields: Record<string, string | boolean | number>,
    submitSelector?: string,
  ): Promise<{ success: boolean; fieldsFilled: number; submitted: boolean; details: string[] }> {
    return this.actions.fillForm(fields, submitSelector);
  }

  scrollPage(direction: 'up' | 'down', amount: number = 400): Promise<string> {
    return this.actions.scrollPage(direction, amount);
  }

  insertText(text: string): Promise<boolean> {
    return this.simulator.insertText(this.deps.activeWebContents(), text);
  }


  /** A trusted key press on the active tab, logged and revision-stamped. */
  async pressKey(key: string): Promise<string> {
    const wc = this.deps.activeWebContents();
    this.deps.log('action', `MCP Directive: press_key("${key}")`);
    await this.simulator.pressKey(wc, key);
    this.deps.bumpRevision();
    return `Pressed key: ${key}`;
  }

  testChaosTrajectory(target: { x: number; y: number }, options?: ChaosKinematicsOptions): PathStep[] {
    const start = this.simulator.getCursorPosition();
    return generateChaosTrajectory(start, target, options);
  }

  async moveMouse(target: { x: number; y: number }, options?: ChaosKinematicsOptions): Promise<void> {
    const wc = this.deps.activeWebContents();
    await this.simulator.moveMouseTo(wc, target, options);
  }
}
