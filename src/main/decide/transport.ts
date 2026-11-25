/**
 * The TypeSafe transport.
 *
 * A dumb pipe: the questions go up, the answers come back untouched. The only
 * interpretation is the image-retry rule (an endpoint that rejects the image is
 * retried once without it) and the key-rejected hint.
 */
import type { DecisionCall, DecisionConfig, DecisionResult } from './types.js';

function systemOneUrl(base: string): string {
  const trimmed = base.replace(/\/+$/, '');
  return /\/systemone$/i.test(trimmed) ? trimmed : `${trimmed}/v1/systemone`;
}

function requestHeaders(cfg: DecisionConfig, call: DecisionCall): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    ...(cfg.key ? { Authorization: `Bearer ${cfg.key}` } : {}),
    // Images are behind a "danger zone" flag on TypeSafe; only send it when there are assets.
    ...(call.assets && Object.keys(call.assets).length ? { 'TypeSafe-Danger-Zone-Images': 'true' } : {}),
  };
}

function requestBody(cfg: DecisionConfig, call: DecisionCall): string {
  return JSON.stringify({
    model: call.model || cfg.model,
    state: call.state,
    questions: call.questions,
    ...(call.assets && Object.keys(call.assets).length ? { assets: call.assets } : {}),
  });
}

/** A rejected key has two different fixes depending on the endpoint; say which one applies. */
function rejectedKeyHint(cfg: DecisionConfig): string {
  return /opencode\.ai/i.test(cfg.url || '')
    ? 'The key was rejected upstream. Verify it on its own with: curl https://opencode.ai/inference/v1/models -H "Authorization: Bearer $KEY" (200 = valid). Jev is an OpenCode *Console* pay-as-you-go model, so an OpenCode Go subscription key will not authorise it, and a TypeSafe key does not work on the opencode.ai endpoint.'
    : 'The key was rejected upstream — check KUANG_DECISION_KEY (a TypeSafe key for api.typesafe.ai; an OpenCode Console key for opencode.ai/inference/systemone).';
}

function upstreamFailure(
  cfg: DecisionConfig,
  call: DecisionCall,
  started: number,
  status: number,
  text: string,
): DecisionResult {
  return {
    ok: false,
    protocol: 'typesafe',
    model: call.model || cfg.model,
    latencyMs: Date.now() - started,
    error: {
      code: 'UPSTREAM_ERROR',
      status,
      message: `Decision endpoint returned HTTP ${status}: ${(text || '').slice(0, 300)}`,
      hint: status === 401 || status === 403 ? rejectedKeyHint(cfg) : undefined,
    },
  };
}

/** When to use: the typesafe protocol. */
export async function runTypesafe(cfg: DecisionConfig, call: DecisionCall): Promise<DecisionResult> {
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), cfg.timeoutMs);
  try {
    const res = await fetch(systemOneUrl(cfg.url || ''), {
      method: 'POST',
      headers: requestHeaders(cfg, call),
      body: requestBody(cfg, call),
      signal: controller.signal,
    });
    const text = await res.text();
    let json: any = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      // keep the raw body for the error below
    }
    if (!res.ok) {
      // Some gateways strip unknown headers. If TypeSafe says images are not enabled, retry once
      // without the image rather than failing the decision — and report that the image was skipped.
      if (call.assets && Object.keys(call.assets).length && res.status === 400 && text.toLowerCase().includes('images are experimental')) {
        const retry = await runTypesafe(cfg, { ...call, assets: undefined });
        return { ...retry, imageNote: 'the endpoint rejected the image (header not forwarded); decided without it' };
      }
      return upstreamFailure(cfg, call, started, res.status, text);
    }
    if (!json || typeof json !== 'object') {
      return {
        ok: false,
        protocol: 'typesafe',
        latencyMs: Date.now() - started,
        error: { code: 'UPSTREAM_ERROR', message: 'Decision endpoint returned a non-JSON body', hint: (text || '').slice(0, 200) },
      };
    }
    return {
      ok: true,
      protocol: 'typesafe',
      model: json.model || call.model || cfg.model,
      // Pass the answers through untouched: no coercion, no defaulting, no interpretation.
      answers: json.answers || json,
      usage: json.usage,
      latencyMs: Date.now() - started,
    };
  } catch (err: any) {
    const aborted = err?.name === 'AbortError';
    return {
      ok: false,
      protocol: 'typesafe',
      latencyMs: Date.now() - started,
      error: {
        code: aborted ? 'TIMEOUT' : 'UPSTREAM_ERROR',
        message: aborted ? `Decision endpoint did not answer within ${cfg.timeoutMs} ms` : `Decision call failed: ${err?.message || err}`,
      },
    };
  } finally {
    clearTimeout(timer);
  }
}
