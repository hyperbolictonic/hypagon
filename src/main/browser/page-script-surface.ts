/**
 * Page-script surface.
 *
 * Owns running script in the active tab: the directive-logged evaluation, the
 * cross-frame CDP evaluation and the shared control description used by marks,
 * find, the decision guard and recipes. The chassis supplies the active tab and
 * the log; Shadow Walk policy is read from its own guard.
 */
import type { WebContents } from 'electron';
import { evaluateInFrames, type FrameEvalOptions, type FrameEvalResult } from './frame-eval.js';
import { ElectronTarget } from '../../../packages/electron/src/target.ts';
import { controlFactsExpression, parseControlFacts, type ControlFacts, type ControlFactsOptions } from '../primitives/control-facts.js';
import { assertShadowSurface } from '../shadow-walk/guard.js';

/** Dependencies the page-script surface needs from the active tab. */
export interface PageScriptSurfaceDeps {
  activeWebContents(): WebContents;
  log(level: 'info' | 'warn' | 'action', message: string): void;
}

/** The script-evaluation and control-description surface over the active tab. */
export class PageScriptSurface {
  constructor(private readonly deps: PageScriptSurfaceDeps) {}

  /** Execute script in the active tab and log the MCP directive. */
  async evaluate(script: string): Promise<any> {
    const wc = this.deps.activeWebContents();
    this.deps.log('action', `MCP Directive: evaluate_javascript("${script.substring(0, 30)}...")`);
    return await wc.executeJavaScript(script);
  }

  /**
   * Evaluate in the main frame and its child frames (cross-origin included), via CDP isolated
   * worlds. Opt-in: two CDP commands per frame, so callers pass a frame budget.
   */
  async evaluateInFrames(script: string, options?: FrameEvalOptions): Promise<FrameEvalResult[]> {
    const wc = this.deps.activeWebContents();
    this.deps.log('action', `MCP Directive: evaluate_in_frames(${options?.maxFrames ?? 8} max)`);
    return evaluateInFrames(new ElectronTarget(wc), script, options);
  }

  /**
   * Shared control description used by marks, find, the decision guard and recipes.
   * One injected expression, no per-element round trips.
   */
  async describeControls(options: ControlFactsOptions = {}): Promise<{ url?: string; controls: ControlFacts[] }> {
    if (options.deep === true) assertShadowSurface('deepOpenRoots');
    const wc = this.deps.activeWebContents();
    const raw = await wc.executeJavaScript(controlFactsExpression(options)).catch(() => null);
    return parseControlFacts(raw);
  }

  /** Execute page script without per-poll log spam (used by primitive probes). */
  async quiet(script: string): Promise<any> {
    const wc = this.deps.activeWebContents();
    return await wc.executeJavaScript(script);
  }
}
