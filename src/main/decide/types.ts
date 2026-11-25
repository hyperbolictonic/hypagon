/**
 * The decision-model contract.
 *
 * Shared by the config store, the transports, the event bus and the entry point
 * so none of them has to import another (and no cycle can form).
 */

/** When to use: naming the transport in config and results. */
export type DecisionProtocol = 'typesafe' | 'local-onnx';

/** When to use: resolving what `decide` will call. */
export interface DecisionConfig {
  protocol: DecisionProtocol;
  url?: string;
  model: string;
  key?: string;
  revision?: string;
  device?: string;
  timeoutMs: number;
}

/** When to use: passing a page state and typed questions to the model. */
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

/** When to use: mapping a failure to its typed code. */
export type DecisionFailureCode =
  | 'NOT_CONFIGURED'
  | 'BAD_REQUEST'
  | 'UPSTREAM_ERROR'
  | 'TIMEOUT'
  | 'NO_DECISION'
  | 'HUMAN_REQUIRED';

/** When to use: the entry point's return value. */
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
/** When to use: the HUD's DECISIONS tab record. */
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
