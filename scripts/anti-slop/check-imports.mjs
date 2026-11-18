#!/usr/bin/env node
/**
 * check-imports.mjs
 *
 * Import-boundary gate: detects circular dependencies (default, blocking)
 * and configurable layer violations (`imports.deny` in anti-slop.config.json).
 * Catches the architecture drift that size budgets cannot: a cycle between
 * modules is two responsibilities fused, and a `from`/`forbid` rule encodes
 * the ports-and-adapters direction the modular-architecture skill teaches.
 *
 * Zero dependencies. Resolution is relative-import only (package specifiers
 * are ignored); candidates probe extensions and /index files.
 *
 * Usage:
 *   node scripts/anti-slop/check-imports.mjs [--src src] [--report-only]
 *
 * Config:
 *   "imports": { "src": "src", "deny": [{ "from": "src/app/**", "forbid": "src/collections/**" }] }
 *   `from`/`forbid` are globs matched against repo-relative paths ('/' separators).
 */

import { readFileSync, existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { stripComments } from './lib.mjs';
import {
  loadConfig, gateArgs, resolveScanTarget, matchesAnyGlob,
} from './cli.mjs';
import { loadBaseline, saveBaseline, compareSets, BASELINE_FILE } from './baseline.mjs';

// --- parsing ------------------------------------------------------------------

const IMPORT_RE =
  /(?:import|export)\s+(?:[\w*{}\s,]*?\sfrom\s+)?['"]([^'"]+)['"]|(?:require|import)\(\s*['"]([^'"]+)['"]\s*\)/g;

const PROBE_EXTS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.mts'];

/** Resolve a relative specifier to a file inside `root`; null for packages/misses.
 * Probes extensions and /index files; a specifier written with one extension
 * (e.g. './c.js' for a c.ts file, the TS convention) is re-probed with all of them.
 */
export function resolveSpecifier(fromFull, spec, root) {
  if (!spec.startsWith('.')) return null;
  let base = path.resolve(path.dirname(fromFull), spec);
  const hasExt = PROBE_EXTS.includes(path.extname(base).toLowerCase());
  const stem = hasExt ? base.slice(0, base.length - path.extname(base).length) : base;
  const candidates = [
    ...(hasExt ? [base] : []),
    ...PROBE_EXTS.map((e) => stem + e),
    ...PROBE_EXTS.map((e) => path.join(stem, 'index' + e)),
  ];
  for (const c of candidates) {
    if (existsSync(c) && statSync(c).isFile()) {
      return path.relative(root, c).split(path.sep).join('/');
    }
  }
  return null;
}

/**
 * Extract import specifiers, skipping statements that begin inside string
 * literals — a code example embedded in a string is not an import edge.
 */
function parseImports(source) {
  const ranges = stringRanges(source);
  const specs = [];
  for (const m of source.matchAll(IMPORT_RE)) {
    const idx = m.index ?? 0;
    if (ranges.some(([s, e]) => idx >= s && idx <= e)) continue;
    const spec = m[1] ?? m[2];
    if (spec) specs.push(spec);
  }
  return specs;
}

/** [start, end] index ranges of string literals (end = closing quote index). */
function stringRanges(src) {
  const ranges = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === '"' || c === "'" || c === '`') {
      const start = i;
      const q = c;
      i++;
      while (i < src.length && src[i] !== q) {
        if (src[i] === '\\') i++;
        i++;
      }
      ranges.push([start, i]);
      i++; // closing quote
    } else {
      i++;
    }
  }
  return ranges;
}

/** Build the internal import graph: relFile -> Set<relFile> (relative imports only). */
export function buildImportGraph(files, root) {
  const graph = new Map();
  for (const file of files) {
    const source = stripComments(readFileSync(file.full, 'utf8'));
    const edges = graph.get(file.rel) ?? new Set();
    for (const spec of parseImports(source)) {
      const resolved = resolveSpecifier(file.full, spec, root);
      if (resolved && resolved !== file.rel) edges.add(resolved);
    }
    graph.set(file.rel, edges);
  }
  return graph;
}

/**
 * Find circular dependencies. Returns each cycle once, as a chain
 * [a, b, ..., a] rotated so the lexicographically smallest node is first.
 */
export function findCycles(graph) {
  const cycles = new Map(); // key -> chain
  const state = new Map(); // rel -> 'visiting' | 'done'
  const stack = [];

  function dfs(node) {
    state.set(node, 'visiting');
    stack.push(node);
    for (const next of graph.get(node) ?? []) {
      const s = state.get(next);
      if (s === 'visiting') {
        const at = stack.indexOf(next);
        const chain = stack.slice(at).concat(next);
        const key = [...chain.slice(0, -1)].sort().join('~');
        if (!cycles.has(key)) cycles.set(key, chain);
      } else if (!s) {
        dfs(next);
      }
    }
    stack.pop();
    state.set(node, 'done');
  }

  for (const node of graph.keys()) {
    if (!state.get(node)) dfs(node);
  }
  return [...cycles.values()];
}

// --- CLI (only when run directly; exported functions are unit-testable) --------

const isMain =
  process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

/** Evaluate cycles + deny rules against the graph, printing findings.
 * Returns the violation count. Deny-rule violations are never baselined:
 * rules are declared deliberately, so violating one is new debt by definition.
 */
function evaluateBoundaries(graph, cycles, deny, baseline) {
  let violations = 0;
  const cycleKeys = cycles.map((chain) => [...chain.slice(0, -1)].sort().join('~'));

  if (cycles.length > 0) {
    if (baseline?.imports) {
      const { added } = compareSets(cycleKeys, baseline.imports.cycles);
      if (added.length === 0) {
        console.log(`[ok] No NEW cycles (${cycles.length} baselined cycle(s) remain; ${graph.size} files).`);
      } else {
        console.log(`NEW circular dependencies (${added.length}):`);
        for (const key of added.slice(0, 20)) {
          const chain = cycles.find((c) => [...c.slice(0, -1)].sort().join('~') === key);
          console.log(`  ${chain ? chain.join(' -> ') : key}`);
        }
        violations += added.length;
      }
    } else {
      console.log(`Circular dependencies (${cycles.length}):`);
      for (const chain of cycles.slice(0, 20)) {
        console.log(`  ${chain.join(' -> ')}`);
        violations++;
      }
    }
  }

  for (const rule of deny) {
    if (!rule?.from || !rule?.forbid) {
      console.error(`[warn] ignoring malformed imports.deny rule: ${JSON.stringify(rule)}`);
      continue;
    }
    for (const [from, edges] of graph) {
      if (!matchesAnyGlob(from, [rule.from])) continue;
      for (const to of edges) {
        if (matchesAnyGlob(to, [rule.forbid])) {
          console.log(`Layer violation: ${from} imports ${to} (deny: from '${rule.from}' forbid '${rule.forbid}')`);
          violations++;
        }
      }
    }
  }
  return violations;
}

function main() {
  const cfgImports = loadConfig().imports ?? {};
  const { args } = gateArgs({
    argv: process.argv.slice(2),
    usage: 'Usage: node check-imports.mjs [--src src] [--report-only] [--baseline file] [--update-baseline]\n' +
      'Config: anti-slop.config.json "imports" section (src, deny: [{from, forbid}]).\n' +
      'With a baseline file (default anti-slop.baseline.json) the gate fails only on NEW cycles.',
    spec: { '--src': 'string', '--report-only': 'flag', '--baseline': 'string', '--update-baseline': 'flag' },
    defaults: { src: cfgImports.src ?? 'src' },
  });

  const src = path.resolve(args.src);
  if (!existsSync(src) || !statSync(src).isDirectory()) {
    console.error(`Source directory not found: ${src}`);
    process.exit(1);
  }
  const files = resolveScanTarget(args.src);
  const graph = buildImportGraph(files, src);
  const deny = Array.isArray(cfgImports.deny) ? cfgImports.deny : [];

  const cycles = findCycles(graph);
  const cycleKeys = cycles.map((chain) => [...chain.slice(0, -1)].sort().join('~'));

  if (args.updateBaseline) {
    const file = args.baseline ?? BASELINE_FILE;
    saveBaseline(file, { imports: { cycles: [...cycleKeys].sort() } });
    console.log(`[ok] Baseline written to ${file} (${cycleKeys.length} cycle(s)).`);
    console.log('    Commit it. The gate now fails only on NEW cycles; shrink the baseline as you break them.');
    process.exit(0);
  }

  const baseline = loadBaseline(args.baseline);
  const violations = evaluateBoundaries(graph, cycles, deny, baseline);

  if (violations === 0) {
    if (deny.length === 0) {
      console.log(`[ok] No cycles (${graph.size} files). Cycles-only gate: no imports.deny rules configured — declare some (see README "Tuning per repo") to enforce layer direction.`);
    } else {
      console.log(`[ok] Import-boundary check passed (${graph.size} files, no cycles, ${deny.length} layer rule(s)).`);
    }
    process.exit(0);
  }

  console.error(
    `\n[x] Import-boundary check FAILED (${violations} violation(s)).\n` +
    '    Fix: break the cycle by extracting the shared part into a module both can import\n' +
    '    (see the modular-architecture skill). Do NOT create a re-export shim that keeps the cycle.'
  );
  process.exit(args.reportOnly ? 0 : 1);
}

if (isMain) main();
