/**
 * Optional decision-model bridge — **off unless configured**.
 *
 * Kuang surfaces facts; a decision model picks between them. This module is the only place
 * Kuang talks to one, and it is deliberately a dumb pipe:
 *
 *   state + typed questions  →  the model's answers, verbatim
 *
 * No prompt assembly, no retries that change the question, no synthesis. If the upstream is
 * down the caller gets a typed error, never a fabricated answer. Nothing in Kuang calls this
 * implicitly — every call is somebody's explicit request, so the tool surface stays
 * deterministic and local-first.
 *
 * Two protocols:
 *
 *   typesafe      POST {url}/v1/systemone  (hosted Jev, e.g. jev-1.13). Questions are forwarded
 *                 exactly as supplied; answers carry probabilities + confidence.
 *   local-onnx    In-process via `open-jev` (Transformers.js / ONNX). Default model `kev-0.6b`
 *                 (0.34 GB, Qwen3-0.6B); `open-jev` (DeBERTa-v3-large) is the other small option.
 *
 * Configuration comes from the environment, then `data/decision.json` (gitignored). The config
 * store, the transports and the event bus live in their own modules; this file is the entry point.
 */
import { detectSensitiveGate } from './sensitive-gate.js';
import { summarizeQuestions } from './decision-questions.js';
import { resolveDecisionConfig } from './config.js';
import { emitDecisionEvent } from './events.js';
import { runLocalOnnx } from './local.js';
import { runTypesafe } from './transport.js';
import type { DecisionCall, DecisionEvent, DecisionResult } from './types.js';

export type {
  DecisionCall,
  DecisionConfig,
  DecisionEvent,
  DecisionFailureCode,
  DecisionProtocol,
  DecisionResult,
} from './types.js';
export { decisionStatus, readStoredDecisionConfig, resolveDecisionConfig, saveDecisionConfig } from './config.js';
export { emitDecisionEvent, onDecision } from './events.js';

/** One decision call. Never throws: failures are returned as typed results. */
export async function runDecision(call: DecisionCall): Promise<DecisionResult> {
  const startedAt = Date.now();
  const cfg = resolveDecisionConfig();
  const record: DecisionEvent = {
    ts: startedAt,
    protocol: cfg?.protocol,
    model: call.model || cfg?.model,
    ok: false,
    statePreview: (typeof call.state === 'string' ? call.state : JSON.stringify(call.state ?? '')).slice(0, 160),
    questions: summarizeQuestions(call.questions || {}),
  };

  if (!cfg) {
    const result: DecisionResult = {
      ok: false,
      error: {
        code: 'NOT_CONFIGURED',
        message: 'No decision model is configured.',
        hint: 'Set KUANG_DECISION_PROTOCOL (typesafe | local-onnx) and, for typesafe, KUANG_DECISION_URL (+ _KEY, optional _MODEL), or write data/decision.json. See docs/DECISION_MODELS.md.',
      },
    };
    emitDecisionEvent({ ...record, latencyMs: Date.now() - startedAt, error: result.error });
    return result;
  }
  if (!call.questions || typeof call.questions !== 'object' || !Object.keys(call.questions).length) {
    const result: DecisionResult = { ok: false, protocol: cfg.protocol, error: { code: 'BAD_REQUEST', message: 'decide needs at least one typed question.' } };
    emitDecisionEvent({ ...record, protocol: cfg.protocol, latencyMs: Date.now() - startedAt, error: result.error });
    return result;
  }

  // Sensitive gate: ask a human, not a model. Checked before any network call, so it cannot be
  // out-voted by a confident answer and cannot spend an attempt.
  const gate = detectSensitiveGate(call.state, { url: call.pageUrl });
  if (gate) {
    const result: DecisionResult = {
      ok: false,
      protocol: cfg.protocol,
      gate: gate.kind,
      error: {
        code: 'HUMAN_REQUIRED',
        message: gate.reason,
        hint: gate.evidence.length ? `Matched: ${gate.evidence.join(' | ')}` : undefined,
      },
    };
    emitDecisionEvent({ ...record, protocol: cfg.protocol, latencyMs: Date.now() - startedAt, ok: false, error: result.error });
    return result;
  }

  const result = cfg.protocol === 'local-onnx' ? await runLocalOnnx(cfg, call) : await runTypesafe(cfg, call);
  emitDecisionEvent({
    ...record,
    protocol: result.protocol || cfg.protocol,
    model: result.model || record.model,
    latencyMs: result.latencyMs ?? Date.now() - startedAt,
    ok: result.ok,
    error: result.error,
    answers: result.answers,
  });
  return result;
}
