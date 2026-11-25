#!/usr/bin/env node
/**
 * config.mjs — per-repo configuration for the anti-slop gates.
 *
 * Reads `anti-slop.config.json` from the repo root, validates it loudly (a
 * typo or a rejected tuning key must never silently disable a gate), and
 * exposes the scan-extension set a preset may retarget every gate with.
 *
 * Split from cli.mjs so that per-repo configuration and CLI plumbing are
 * separate responsibilities: config owns the file format, loud validation and
 * defaults; cli.mjs owns flags, gate bootstrap and path resolution.
 */

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * The scan extension set for a gate run: `config.scan.extensions` (a preset
 * may write it) when present and valid, otherwise the default JS/TS set.
 */
export function scanExtensions(config) {
  const exts = config?.scan?.extensions;
  if (exts === undefined) return null;
  if (
    Array.isArray(exts) && exts.length > 0 &&
    exts.every((x) => typeof x === 'string' && /^\.[A-Za-z0-9]+$/.test(x))
  ) return exts;
  console.error('[warn] scan.extensions must be a non-empty array of dot-extensions (e.g. [".py"]); using defaults.');
  return null;
}

const KNOWN_SECTIONS = new Set(['duplicates', 'modularity', 'docs', 'imports', 'classLiterals', 'encoding', 'scan', '$schema', '_comment']);

/** Keys each section accepts. Anything else is a typo or an attempt to tune
 * the gate away; either way it must not be ignored silently. */
const KNOWN_SECTION_KEYS = {
  duplicates: new Set(['src', 'minTokens', 'threshold', 'maxDuplicatedLines', 'ignore', 'includeTests']),
  modularity: new Set(['src', 'maxFileLines', 'maxFunctionLines', 'maxClassMethods', 'maxExportsPerFile', 'softFactor', 'maxExceptions', 'ignorePaths']),
  docs: new Set(['src', 'ignorePaths', 'ignoreExports']),
  imports: new Set(['src', 'deny']),
  classLiterals: new Set(['src', 'minOccurrences', 'allow']),
  encoding: new Set(['ignorePaths']),
  scan: new Set(['extensions']),
};

/** Per-file budget overrides are rejected by design — a monolith needs
 * decomposition, not an exemption. Named explicitly because a generic
 * "unknown key" warning still reads as though the override were supported. */
const REJECTED_KEYS = new Set(['fileLineOverrides', 'perFileOverrides', 'overrides']);

/** Light validation: unknown keys and wrong types warn instead of silently
 * disabling the tuning (a typo like "duplicate" would otherwise run the gates
 * on defaults with no signal why). */
function validateConfig(parsed) {
  const warns = [];
  for (const key of Object.keys(parsed)) {
    if (!KNOWN_SECTIONS.has(key)) warns.push(`unknown key "${key}" (ignored)`);
  }
  for (const [section, known] of Object.entries(KNOWN_SECTION_KEYS)) {
    const body = parsed[section];
    if (!body || typeof body !== 'object' || Array.isArray(body)) continue;
    for (const key of Object.keys(body)) {
      if (known.has(key)) continue;
      if (REJECTED_KEYS.has(key)) {
        warns.push(
          `${section}.${key} is not supported and is IGNORED - per-file budget overrides are ` +
          'rejected by design, so the limit still applies to every file. Decompose the file by ' +
          'responsibility instead (see the modular-architecture skill)',
        );
      } else {
        warns.push(`unknown key "${section}.${key}" (ignored)`);
      }
    }
  }
  const num = (section, key) => {
    const v = parsed[section]?.[key];
    if (v !== undefined && (typeof v !== 'number' || Number.isNaN(v))) warns.push(`${section}.${key} must be a number`);
  };
  const arr = (section, key) => {
    const v = parsed[section]?.[key];
    if (v !== undefined && !Array.isArray(v)) warns.push(`${section}.${key} must be an array of globs/names`);
  };
  const bool = (section, key) => {
    const v = parsed[section]?.[key];
    if (v !== undefined && typeof v !== 'boolean') warns.push(`${section}.${key} must be a boolean`);
  };
  num('duplicates', 'minTokens');
  num('duplicates', 'threshold');
  num('duplicates', 'maxDuplicatedLines');
  arr('duplicates', 'ignore');
  bool('duplicates', 'includeTests');
  num('modularity', 'maxFileLines');
  num('modularity', 'maxFunctionLines');
  num('modularity', 'maxClassMethods');
  num('modularity', 'maxExportsPerFile');
  num('modularity', 'maxExceptions');
  num('modularity', 'softFactor');
  const soft = parsed.modularity?.softFactor;
  if (typeof soft === 'number' && (soft <= 0 || soft > 1)) {
    warns.push('modularity.softFactor must be > 0 and <= 1 (a fraction of the hard cap)');
  }
  arr('modularity', 'ignorePaths');
  arr('docs', 'ignorePaths');
  arr('docs', 'ignoreExports');
  arr('encoding', 'ignorePaths');
  num('classLiterals', 'minOccurrences');
  arr('classLiterals', 'allow');
  arr('scan', 'extensions');
  if (parsed.imports?.deny !== undefined && !Array.isArray(parsed.imports.deny)) {
    warns.push('imports.deny must be an array of { from, forbid } rules');
  }
  if (warns.length > 0) {
    console.error(`[warn] anti-slop.config.json: ${warns.join('; ')}.`);
  }
}

/**
 * Reads `anti-slop.config.json` from process.cwd() (repo root), returning the
 * parsed object or {} when absent (warn+{} when unparsable).
 * Scripts merge: defaults < config file < CLI flags.
 *
 * Shape:
 * {
 *   "duplicates": { "src": "src", "minTokens": 50, "threshold": 3,
 *                   "ignore": ["collections/**"] },
 *   "modularity": { "src": "src", "maxFileLines": 300, "maxFunctionLines": 80,
 *                   "maxClassMethods": 10 },
 *   "docs":       { "src": "src", "ignorePaths": ["app/(payload)/**"],
 *                   "ignoreExports": ["metadata", "dynamic"] },
 *   "imports":    { "src": "src", "deny": [{ "from": "src/domain/**",
 *                   "forbid": "src/infra/**" }] }
 * }
 *
 * `ignore` (duplicates) and `ignorePaths` (docs/modularity) exclude files
 * whose repetition is shape, not logic.
 */
export function loadConfig() {
  const file = path.join(process.cwd(), 'anti-slop.config.json');
  if (!existsSync(file)) return {};
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(file, 'utf8'));
  } catch (err) {
    console.error(`[warn] Could not parse anti-slop.config.json (${err.message}); using defaults.`);
    return {};
  }
  if (!parsed || typeof parsed !== 'object') {
    console.error('[warn] anti-slop.config.json is not an object; using defaults.');
    return {};
  }
  validateConfig(parsed);
  return parsed;
}
