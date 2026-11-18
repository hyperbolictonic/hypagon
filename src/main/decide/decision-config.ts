/**
 * Decision-backend configuration: env overrides, the stored `data/decision.json`, and
 * the status shape the health payload reports.
 *
 * Kept apart from the client so the settings UI, the bridge and the tools can read or
 * write configuration without importing the transport.
 *
 * When to use: resolving which backend a decision call will use, saving a new one from
 * Settings, or reporting `decisionStatus()` on health.
 */

import fs from 'node:fs';
import path from 'node:path';
import { dataPath } from '../data-paths.js';

import type { DecisionConfig, DecisionProtocol } from './decision-types.js';

export type { DecisionConfig, DecisionProtocol } from './decision-types.js';

const CONFIG_FILE = dataPath('decision.json');

function readConfigFile(): Partial<DecisionConfig> | null {
  try {
    if (!fs.existsSync(CONFIG_FILE)) return null;
    const parsed = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    // A malformed config is treated as absent (and reported through NOT_CONFIGURED).
    return null;
  }
}

/** Resolve configuration (env overrides file). Returns null when nothing is configured. */
export function resolveDecisionConfig(): DecisionConfig | null {
  const file = readConfigFile() || {};
  const rawProtocol = (process.env.KUANG_DECISION_PROTOCOL || file.protocol || '').toLowerCase();
  // `d1-onnx` was the first name for the local path; d1-3B cannot be loaded by open-jev, so the
  // local family is honestly named for what it runs (kev / open-jev ONNX) and the old name is
  // accepted as an alias so existing config files keep working.
  const protocol = (rawProtocol === 'd1-onnx' ? 'local-onnx' : rawProtocol) as DecisionProtocol | '';
  if (protocol !== 'typesafe' && protocol !== 'local-onnx') return null;

  const url = process.env.KUANG_DECISION_URL || file.url || undefined;
  // typesafe needs an endpoint; the local model runs in-process and needs none.
  if (protocol === 'typesafe' && !url) return null;

  return {
    protocol,
    url,
    model: process.env.KUANG_DECISION_MODEL || file.model || (protocol === 'typesafe' ? 'jev-1.13' : 'kev-0.6b'),
    key: process.env.KUANG_DECISION_KEY || file.key || undefined,
    revision: process.env.KUANG_DECISION_REVISION || file.revision || undefined,
    device: process.env.KUANG_DECISION_DEVICE || file.device || undefined,
    timeoutMs: Number(process.env.KUANG_DECISION_TIMEOUT_MS || file.timeoutMs || 30000),
  };
}

/** Raw configuration as stored on disk (file values only — env is read at resolve time). */
export function readStoredDecisionConfig(): Partial<DecisionConfig> {
  return readConfigFile() || {};
}

/**
 * Persist (or clear) `data/decision.json`. Returns the resolved status so the caller can show
 * exactly what the app will use, including the effect of environment overrides.
 */
export function saveDecisionConfig(input: Partial<DecisionConfig> | null): { ok: boolean; status: ReturnType<typeof decisionStatus> } {
  try {
    fs.mkdirSync(path.dirname(CONFIG_FILE), { recursive: true });
    if (!input || !input.protocol) {
      fs.rmSync(CONFIG_FILE, { force: true });
      return { ok: true, status: decisionStatus() };
    }
    const clean: Record<string, unknown> = { protocol: input.protocol };
    for (const key of ['url', 'model', 'key', 'revision', 'device'] as const) {
      const value = input[key];
      if (typeof value === 'string' && value.trim()) clean[key] = value.trim();
    }
    if (typeof input.timeoutMs === 'number' && input.timeoutMs > 0) clean.timeoutMs = input.timeoutMs;
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(clean, null, 2) + '\n', 'utf8');
    return { ok: true, status: decisionStatus() };
  } catch {
    return { ok: false, status: decisionStatus() };
  }
}

/** Shape reported by `/health` and `help`, so an agent can tell whether `decide` will work. */
export function decisionStatus(): {
  configured: boolean;
  protocol?: DecisionProtocol;
  model?: string;
  endpoint?: string;
  local?: boolean;
} {
  const cfg = resolveDecisionConfig();
  if (!cfg) return { configured: false };
  return {
    configured: true,
    protocol: cfg.protocol,
    model: cfg.model,
    endpoint: cfg.protocol === 'typesafe' ? cfg.url : 'in-process',
    local: cfg.protocol === 'local-onnx',
  };
}
