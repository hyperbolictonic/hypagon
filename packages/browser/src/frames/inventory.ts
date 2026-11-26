/**
 * Child-frame controls for the host contract.
 *
 * A frame scan returns geometry, but `find(include_frames)` and
 * `observe(som|components)` also need each frame's controls with top-level
 * coordinates and the 100+ mark ids the click path resolves through.
 */
import type { BrowserTarget } from '../target.ts';
import { controlFactsExpression, parseControlFacts, type ControlFacts } from '../primitives/control-facts.ts';
import { clearFrameMarks, registerFrameMarks } from './frame-marks.ts';
import { evaluateInFrames } from './frame-eval.ts';
import type { FrameInfo } from './frames.ts';

/** When to use: `getFrames` — the frame cap, the control filter and whether to read surfaces. */
export interface FrameControlOptions {
  maxFrames?: number;
  selector?: string;
  limit?: number;
  includeOffscreen?: boolean;
  skipHitTest?: boolean;
  deep?: boolean;
  component?: boolean;
}

/** A frame row plus the controls stamped inside it. */
export type FrameWithControls = FrameInfo & { controls?: ControlFacts[]; controlsTotal?: number };

function onScreen(control: ControlFacts, viewport: FrameInfo['rect']): boolean {
  const rect = control.rect;
  return (
    rect.width > 0 &&
    rect.height > 0 &&
    rect.x < viewport.width &&
    rect.y < viewport.height &&
    rect.x + rect.width > 0 &&
    rect.y + rect.height > 0
  );
}

/**
 * When to use: a frames read — evaluate the control-facts expression in every child
 * frame, offset its rects into the top-level viewport and publish the mark ids.
 */
export async function attachFrameControls(
  target: BrowserTarget,
  frames: FrameInfo[],
  options: FrameControlOptions = {},
): Promise<FrameWithControls[]> {
  const out: FrameWithControls[] = frames.map((frame) => ({ ...frame }));
  if (!out.some((frame) => frame.depth > 0)) return out;

  const maxFrames = Math.max(1, Math.min(options.maxFrames ?? 8, 16));
  const limit = Math.max(1, Math.min(options.limit ?? 200, 200));
  const viewport = out.find((frame) => frame.depth === 0)?.rect;

  clearFrameMarks(target);
  const evaluated = await evaluateInFrames(target, 'null', {
    maxFrames,
    expressionForFrame: (_frame, index) =>
      index === 0
        ? 'null'
        : controlFactsExpression({
            selector: options.selector,
            limit,
            includeOffscreen: true,
            skipHitTest: options.skipHitTest === true,
            deep: options.deep === true,
            markIdBase: 100 + (index - 1) * 100,
            component: options.component === true,
          }),
  });

  const byId = new Map(out.map((frame) => [frame.frameId, frame]));
  for (const result of evaluated) {
    const frame = byId.get(result.frameId);
    if (!frame || frame.depth === 0 || !result.ok) continue;
    const parsed = parseControlFacts(result.value);
    let controls: ControlFacts[] = parsed.controls.map((control) => {
      const rect = {
        x: control.rect.x + frame.rect.x,
        y: control.rect.y + frame.rect.y,
        width: control.rect.width,
        height: control.rect.height,
      };
      const visible = control.visible && !!frame.visibleRect;
      const occluded = control.occluded || !onScreen({ ...control, rect }, viewport ?? frame.rect);
      return { ...control, rect, visible, occluded };
    });
    if (options.includeOffscreen === false && viewport) {
      controls = controls.filter((control) => onScreen(control, viewport));
    }
    frame.controls = controls;
    frame.controlsTotal = parsed.controls.length;
    registerFrameMarks(
      target,
      controls
        .filter((control) => typeof control.id === 'number' && control.id >= 100)
        .map((control) => ({ id: Number(control.id), frameId: frame.frameId })),
    );
  }
  return out;
}
