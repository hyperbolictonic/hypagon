/**
 * Shared decision types: the protocol, one call, its result and the HUD event.
 *
 * Kept in one leaf module so configuration, the event bus and the client can all
 * reference them without importing each other.
 *
 * When to use: typing a decide call/result, or a HUD decision event.
 */

/** When to use: branching on how the configured backend speaks (typesafe or local ONNX). */
export type DecisionProtocol = 'typesafe' | 'local-onnx';

/** When to use: reading or writing the stored decision backend configuration. */
export interface DecisionConfig {
  protocol: DecisionProtocol;
  url?: string;
  model: string;
  key?: string;
  revision?: string;
  device?: string;
  timeoutMs: number;
}

/** When to use: sending one decide call (state, typed questions, model, assets). */
export interface DecisionCall {
  state: unknown;
  questions: Record<string, unknown>;
  /** Optional per-call overrides (e.g. a different model), never credentials. */
  model?: string;
  /** URL of the page the state came from — lets the gate rule ignore app-internal pages. */
  pageUrl?: string;
  /** Image assets referenced from the state (TypeSafe format: {ref: {type, format, data_base64}}). */
  assets?: Record<string, unknown>;
}

/** When to use: mapping a decision failure onto a bridge status or hint. */
export type DecisionFailureCode = 'NOT_CONFIGURED' | 'BAD_REQUEST' | 'UPSTREAM_ERROR' | 'TIMEOUT' | 'NO_DECISION' | 'HUMAN_REQUIRED';

/** When to use: reading a decision answer, its protocol/latency, or the failure. */
export interface DecisionResult {
  ok: boolean;
  protocol?: DecisionProtocol;
  model?: string;
  answers?: Record<string, unknown>;
  latencyMs?: number;
  usage?: unknown;
  /** Set when a sensitive gate (age verification, CAPTCHA) stopped the call before the model. */
  gate?: 'age_verification' | 'captcha';
  /** Note about an image that could not be sent (endpoint rejected / not multimodal). */
  imageNote?: string;
  error?: { code: DecisionFailureCode; message: string; hint?: string; status?: number };
}

/** One completed decision call, for the HUD's DECISIONS tab. Never contains the API key. */
export interface DecisionEvent {
  ts: number;
  protocol?: DecisionProtocol;
  model?: string;
  latencyMs?: number;
  ok: boolean;
  error?: { code?: DecisionFailureCode; message?: string };
  statePreview: string;
  questions: Array<{ id: string; type?: string; instruction?: string }>;
  answers?: Record<string, unknown>;
}
