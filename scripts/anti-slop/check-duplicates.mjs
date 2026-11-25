#!/usr/bin/env node
/**
 * check-duplicates.mjs
 *
 * Built-in copy/paste detector for JS/TS/React code. Fails (exit 1) when the
 * percentage of duplicated lines across the source tree exceeds `threshold`.
 * Used as a pre-completion / pre-commit gate by the `verify-clean-code` skill.
 *
 * Zero dependencies. Why not jscpd: verified in testing that jscpd (v3 and v4
 * via npx) can analyze 0 files on some Windows setups; a built-in token-stream
 * detector is deterministic and needs no downloads.
 *
 * Method: strip comments, tokenize, compare sliding windows of `min-tokens`
 * consecutive tokens between files (and within a file). Windows are
 * normalized: string/number literals are abstracted so clones with changed
 * text/numbers are still caught.
 *
 * Usage:
 *   node scripts/anti-slop/check-duplicates.mjs [--src src] [--min-tokens 50] [--threshold 3]
 *   threshold = max allowed duplicated-lines percent; 0 disables failing.
 */

import { readFileSync } from 'node:fs';
import {
  stripNoise, tokenize,
} from './lib.mjs';
import {
  matchesAnyGlob, gateArgs, resolveScanTarget,
} from './cli.mjs';
import { loadConfig, scanExtensions } from './config.mjs';
import { baselineGate, loadBaseline } from './baseline.mjs';

// --- args -------------------------------------------------------------------
// Defaults < anti-slop.config.json < CLI flags.
const cfgDups = (loadConfig().duplicates ?? {});
const { args } = gateArgs({
  argv: process.argv.slice(2),
  usage: 'Usage: node check-duplicates.mjs [--src src] [--min-tokens 50] [--threshold 3] [--baseline file] [--update-baseline] [--summary]\n' +
         'Config: anti-slop.config.json "duplicates" section (src, minTokens, threshold, ignore globs, includeTests).\n' +
         'With a baseline file (default anti-slop.baseline.json) the gate fails only on NEW clones.',
  spec: { '--src': 'string', '--min-tokens': 'number', '--threshold': 'number', '--baseline': 'string', '--update-baseline': 'flag', '--summary': 'flag', '--include-tests': 'flag' },
  defaults: {
    src: cfgDups.src ?? 'src',
    minTokens: cfgDups.minTokens ?? 50,
    threshold: cfgDups.threshold ?? 3,
    includeTests: cfgDups.includeTests ?? false,
  },
});
if (args.minTokens < 10) {
  console.error('min-tokens must be a number >= 10');
  process.exit(1);
}
const IGNORE_GLOBS = Array.isArray(cfgDups.ignore) ? cfgDups.ignore : [];

// --- detect -------------------------------------------------------------------
const allFiles = resolveScanTarget(args.src, {
  includeTests: args.includeTests,
  extensions: scanExtensions(loadConfig()),
});
const files = allFiles.filter((f) => !matchesAnyGlob(f.rel, IGNORE_GLOBS));
const excludedCount = allFiles.length - files.length;
if (IGNORE_GLOBS.length > 0) {
  console.log(`Ignoring paths relative to '${args.src}/': ${IGNORE_GLOBS.join(', ')} (${excludedCount} file(s) excluded).`);
}
const K = args.minTokens;

// Map: window key -> [{ file, idx }]
const windows = new Map();

for (const file of files) {
  const stripped = stripNoise(readFileSync(file.full, 'utf8'));
  file.tokens = tokenize(stripped);
  file.totalLines = stripped.split('\n').length;
  if (file.tokens.length < K) continue;
  for (let i = 0; i + K <= file.tokens.length; i++) {
    const key = file.tokens.slice(i, i + K).map((x) => x.t).join('\u0000');
    let list = windows.get(key);
    if (!list) { list = []; windows.set(key, list); }
    list.push({ file, idx: i });
  }
}

// Merge overlapping window hits into clone regions (per file pair).
const clones = []; // { aFile, bFile, aStart, aEnd, bStart, bEnd, tokens }
const seenPairs = new Set();

for (const list of windows.values()) {
  if (list.length < 2) continue;
  for (let x = 0; x < list.length; x++) {
    for (let y = x + 1; y < list.length; y++) {
      const A = list[x];
      const B = list[y];
      if (A.file === B.file && Math.abs(A.idx - B.idx) < K) continue; // overlapping self-match
      const pairKey = `${A.file.rel}|${A.idx}|${B.file.rel}|${B.idx}`;
      // skip if this (A,B) pair region is already covered by a longer clone
      const idPair = `${A.file.rel}~${B.file.rel}`;
      let covered = false;
      for (const c of clones) {
        if (c.aFile !== A.file.rel || c.bFile !== B.file.rel) continue;
        if (A.idx >= c.aStart - K && A.idx <= c.aEnd + K && B.idx >= c.bStart - K && B.idx <= c.bEnd + K) {
          // extend if adjacent
          if (A.idx <= c.aEnd + 1 || B.idx <= c.bEnd + 1) {
            c.aEnd = Math.max(c.aEnd, A.idx + K - 1);
            c.bEnd = Math.max(c.bEnd, B.idx + K - 1);
            c.tokens = Math.max(c.tokens, c.aEnd - c.aStart + 1);
            covered = true;
            break;
          }
        }
      }
      if (covered) continue;
      if (seenPairs.has(idPair) && clones.length > 200) continue; // hard cap on pathological input
      clones.push({
        aFile: A.file.rel, bFile: B.file.rel,
        aStart: A.idx, aEnd: A.idx + K - 1,
        bStart: B.idx, bEnd: B.idx + K - 1,
        tokens: K,
      });
      seenPairs.add(idPair);
    }
  }
}

// --- compute duplicated lines per file ---------------------------------------
const dupLines = new Map(); // rel -> Set<line>
const totalLines = new Map();
for (const f of files) totalLines.set(f.rel, f.totalLines);

const cloneRegions = [];
for (const c of clones) {
  const aTok = files.find((f) => f.rel === c.aFile).tokens;
  const bTok = files.find((f) => f.rel === c.bFile).tokens;
  cloneRegions.push({
    aFile: c.aFile, aLine: aTok[c.aStart]?.line ?? 1, aEndLine: aTok[Math.min(c.aEnd, aTok.length - 1)]?.line ?? aTok.length,
    bFile: c.bFile, bLine: bTok[c.bStart]?.line ?? 1, bEndLine: bTok[Math.min(c.bEnd, bTok.length - 1)]?.line ?? bTok.length,
    tokens: c.tokens,
  });
}

// Same-file pairs whose line ranges overlap are the sliding window matching
// itself shifted within one line — not clones, and they inflate both the
// region list and the per-file ranking. Keep disjoint same-file pairs and all
// cross-file pairs.
const regions = cloneRegions.filter((r) => {
  if (r.aFile !== r.bFile) return true;
  return r.aLine > r.bEndLine || r.bLine > r.aEndLine;
});

for (const r of regions) {
  for (const [rel, s, e] of [[r.aFile, r.aLine, r.aEndLine], [r.bFile, r.bLine, r.bEndLine]]) {
    let set = dupLines.get(rel);
    if (!set) { set = new Set(); dupLines.set(rel, set); }
    for (let l = s; l <= e; l++) set.add(l);
  }
}

let totalDup = 0;
let totalAll = 0;
for (const f of files) {
  totalAll += f.totalLines;
  totalDup += dupLines.get(f.rel)?.size ?? 0;
}
const pct = totalAll > 0 ? (totalDup / totalAll) * 100 : 0;

// --- report -------------------------------------------------------------------
console.log(`Checked ${files.length} files (${totalAll} lines), min-tokens=${K}, threshold=${args.threshold}%`);

if (regions.length === 0) {
  console.log('[ok] No duplicates found.');
  process.exit(0);
}

const MAX_REPORT = args.summary ? 3 : 40;
console.log(`Found ${regions.length} clone region(s). Showing up to ${MAX_REPORT}:\n`);
for (const r of regions.slice(0, MAX_REPORT)) {
  console.log(`  ${r.aFile}:${r.aLine}-${r.aEndLine}  <->  ${r.bFile}:${r.bLine}-${r.bEndLine}  (~${r.tokens} tokens)`);
}

const worst = [...dupLines.entries()]
  .map(([rel, set]) => ({ rel, dup: set.size, total: totalLines.get(rel) }))
  .filter((f) => f.dup > 0)
  .sort((a, b) => b.dup / b.total - a.dup / a.total)
  .slice(0, args.summary ? 3 : 5);
console.log('\nMost duplicated files:');
for (const w of worst) console.log(`  ${w.rel}: ${w.dup}/${w.total} lines (${((w.dup / w.total) * 100).toFixed(1)}%)`);
console.log(`\nTotal duplicated lines: ${totalDup}/${totalAll} (${pct.toFixed(1)}%)`);

if (args.threshold > 0 && pct >= args.threshold * 0.9 && pct <= args.threshold) {
  console.log(
    `[note] approaching the duplication threshold (${pct.toFixed(1)}% of ${args.threshold}%). ` +
    'This is a ratio: adding clean lines dilutes it, so watch maxDuplicatedLines too.',
  );
}

// --- absolute guards ----------------------------------------------------------
// The percentage is a ratio: adding a large *clean* file lowers it without
// removing a clone. An absolute ceiling (config) and the baseline's stored
// total are immune to that, so both are checked before the ratio.
if (!args.updateBaseline) {
  const failures = [];
  const maxDup = cfgDups.maxDuplicatedLines;
  if (typeof maxDup === 'number' && maxDup > 0 && totalDup > maxDup) {
    failures.push(`absolute budget: ${totalDup} duplicated lines > maxDuplicatedLines ${maxDup}`);
  }
  const storedTotal = loadBaseline(args.baseline)?.duplicates?.totalDuplicatedLines;
  if (typeof storedTotal === 'number' && totalDup > storedTotal) {
    failures.push(`baseline total: ${totalDup} duplicated lines > accepted ${storedTotal}`);
  }
  if (failures.length > 0) {
    console.error(
      `\n[x] Duplicate-code check FAILED (absolute, not a ratio).\n` +
      failures.map((f) => `    ${f}`).join('\n') + '\n' +
      '    The percentage can be diluted by adding clean lines; an absolute total cannot.\n' +
      '    Fix: extract the duplicates into existing shared modules (see the reuse-before-create skill).\n' +
      '    Never raise the budget or re-baseline to absorb them.'
    );
    process.exit(1);
  }
}

// --- baseline (ratchet) mode ---------------------------------------------------
const perFileDup = {};
for (const [rel, set] of dupLines) if (set.size > 0) perFileDup[rel] = set.size;
const decision = baselineGate({
  args,
  section: 'duplicates',
  current: perFileDup,
  extra: { totalDuplicatedLines: totalDup },
  unit: 'duplicated line(s)',
  fixLine: 'Fix: extract into existing shared modules (see the reuse-before-create skill).',
});
if (decision === 'ok') process.exit(0);
if (decision === 'fail') process.exit(1);

if (args.threshold > 0 && pct > args.threshold) {
  console.error(
    `\n[x] Duplicate-code check FAILED (${pct.toFixed(1)}% > ${args.threshold}%).\n` +
    '    Fix: extract duplicates into existing shared modules (see the reuse-before-create skill).\n' +
    '    Do NOT weaken the threshold or add ignore comments to pass.\n' +
    '    Adopting a repo with legacy duplication? Snapshot it once:\n' +
    `    node scripts/anti-slop/check-duplicates.mjs --update-baseline — the gate then fails only on NEW clones.`
  );
  process.exit(1);
}
console.log('[ok] Duplicate-code check passed.');
