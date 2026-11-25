/**
 * In-process ONNX decision model (open-jev).
 *
 * The model is loaded lazily and cached per model/device pair. State is passed
 * as text, because open-jev takes one piece of text rather than the components
 * array; revision pinning is not exposed by Transformers.js.
 */
import type { DecisionCall, DecisionConfig, DecisionResult } from './types.js';

let localModel: any = null;
let localModelKey = '';

/** When to use: the local-onnx protocol. */
export async function runLocalOnnx(cfg: DecisionConfig, call: DecisionCall): Promise<DecisionResult> {
  const started = Date.now();
  const modelId = call.model || cfg.model;
  const key = `${modelId}|${cfg.device || ''}`;

  let mod: any;
  try {
    mod = await import('open-jev' as any);
  } catch {
    return {
      ok: false,
      protocol: 'local-onnx',
      model: modelId,
      error: {
        code: 'NOT_CONFIGURED',
        message: 'The local decision runtime is not installed (open-jev).',
        hint: 'Run `pnpm add open-jev @huggingface/transformers`. The model weights (kev-0.6b ≈ 0.34 GB) download on first use; nothing is bundled with Kuang.',
      },
    };
  }

  try {
    if (!localModel || localModelKey !== key) {
      localModel = await mod.OpenJev.load({ model: modelId, device: cfg.device || 'cpu' });
      localModelKey = key;
    }
    // Kuang states are often the components array, so serialise the whole structure.
    const state = typeof call.state === 'string' ? call.state : JSON.stringify(call.state, null, 2);
    const answers = await localModel.decide(state, call.questions);
    return {
      ok: true,
      protocol: 'local-onnx',
      model: localModel?.runtime?.model || modelId,
      answers,
      latencyMs: Date.now() - started,
    };
  } catch (err: any) {
    return {
      ok: false,
      protocol: 'local-onnx',
      model: modelId,
      latencyMs: Date.now() - started,
      error: { code: 'UPSTREAM_ERROR', message: `Local decision model failed: ${err?.message || err}` },
    };
  }
}
