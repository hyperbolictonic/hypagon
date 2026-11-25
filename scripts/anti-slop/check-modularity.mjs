#!/usr/bin/env node
/**
 * check-modularity.mjs
 *
 * Deterministic monolith gate. Flags structural size violations:
 *   - files exceeding --max-file-lines (default 500)
 *   - functions/methods exceeding --max-function-lines (default 80)
 *   - classes exceeding --max-class-methods (default 10 public methods)
 *
 * Zero dependencies. Parsing is heuristic (brace matching on comment/string-
 * stripped source); thresholds are budgets, not exact science — treat hits as
 * "split by responsibility" signals.
 *
 * Usage:
 *   node scripts/anti-slop/check-modularity.mjs [paths...] [--src src] [--max-file-lines 500]
 *        [--max-function-lines 80] [--max-class-methods 10] [--report-only]
 *
 * With no path arguments it scans --src (default `src`).
 * With path arguments it checks exactly those files (used by git hooks to
 * check only staged files, so legacy violations don't block commits).
 * --report-only prints findings but always exits 0.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  stripNoise, lineOf, isFunctionBody, extractExports, parseLimitExceptions,
} from './lib.mjs';
import {
  gateArgs, collectPathFiles, resolveScanTarget, applyIgnorePaths, toScanRelative,
} from './cli.mjs';
import { loadConfig, scanExtensions } from './config.mjs';
import { baselineGate } from './baseline.mjs';

// Defaults < anti-slop.config.json < CLI flags.
const cfgMod = ((loadConfig().modularity) ?? {});
const { args, positionals } = gateArgs({
  argv: process.argv.slice(2),
  usage: 'Usage: node check-modularity.mjs [paths...] [--src src] [--max-file-lines 500] [--max-function-lines 80] [--max-class-methods 10] [--max-exports-per-file 20] [--report-only] [--baseline file] [--update-baseline]\n' +
         'Config: anti-slop.config.json "modularity" section (src, maxFileLines, maxFunctionLines, maxClassMethods, maxExportsPerFile, softFactor, maxExceptions).\n' +
         'Limits have a soft band (softFactor of the hard cap) that only prints a note.\n' +
         'A file may declare `// anti-slop: <limit> <value> — <reason>`; exceptions are printed and capped.\n' +
         'With path arguments, checks exactly those files (git-hook staged mode).\n' +
         'With a baseline file (default anti-slop.baseline.json) the gate fails only on NEW violations.',
  spec: {
    '--src': 'string', '--max-file-lines': 'number', '--max-function-lines': 'number',
    '--max-class-methods': 'number', '--max-exports-per-file': 'number', '--report-only': 'flag',
    '--baseline': 'string', '--update-baseline': 'flag',
  },
  defaults: {
    src: cfgMod.src ?? 'src',
    maxFileLines: cfgMod.maxFileLines ?? 500,
    maxFunctionLines: cfgMod.maxFunctionLines ?? 80,
    maxClassMethods: cfgMod.maxClassMethods ?? 10,
    maxExportsPerFile: cfgMod.maxExportsPerFile ?? 20,
  },
  allowPositionals: true,
});
const paths = positionals;

function analyze(source, limits, softFactor) {
  const hits = [];
  const stripped = stripNoise(source);
  const totalLines = source.split('\n').length;

  if (totalLines > Math.floor(limits.maxFileLines * softFactor)) {
    hits.push({
      limit: 'file-lines', kind: 'file', line: 1,
      value: totalLines, hard: limits.maxFileLines, detail: `${totalLines} lines`,
    });
  }

  // Brace matching; record regions opened by a function-like `{`.
  // isFunctionBody covers params, typed return annotations and arrows.
  const stack = []; // { depth, start, isFn }
  let depth = 0;
  const regions = []; // { startIdx, endIdx, isFn }
  const classes = []; // { startIdx, endIdx, name, depth }
  let classStart = null; // { name, depth, braceDepth|null, methods }

  for (let i = 0; i < stripped.length; i++) {
    const c = stripped[i];
    if (c === '{') {
      // detect `class X ... {`
      const head = stripped.slice(Math.max(0, i - 200), i);
      const cm = /(?:^|[\s;}])class\s+([A-Za-z0-9_$]+)[^{}]*$/.exec(head);
      // `if (x) {` / `for (...) {` are control flow; `run(): Promise<T> {` is a
      // function body even though the brace follows the return type.
      const isFn = isFunctionBody(stripped, i);
      if (cm && classStart === null) {
        classStart = { name: cm[1], declIdx: i, braceDepth: depth, methods: 0 };
      } else if (classStart && classStart.braceDepth !== null && depth === classStart.braceDepth + 1 && isFn) {
        classStart.methods++;
      }
      stack.push({ depth, start: i, isFn, classStart });
      depth++;
    } else if (c === '}') {
      depth--;
      const open = stack.pop();
      if (open) {
        if (open.isFn) regions.push({ startIdx: open.start, endIdx: i });
        if (classStart && open.depth === classStart.braceDepth) {
          classes.push({ ...classStart, endIdx: i });
          classStart = null;
        }
      }
    }
  }

  for (const r of regions) {
    const startLine = lineOf(stripped, r.startIdx);
    const endLine = lineOf(stripped, r.endIdx);
    const len = endLine - startLine + 1;
    if (len > Math.floor(limits.maxFunctionLines * softFactor)) {
      hits.push({
        limit: 'function-lines', kind: 'function', line: startLine,
        value: len, hard: limits.maxFunctionLines, detail: `${len} lines`,
      });
    }
  }
  for (const c of classes) {
    if (c.methods > Math.floor(limits.maxClassMethods * softFactor)) {
      hits.push({
        limit: 'class-methods', kind: 'class', line: lineOf(stripped, c.declIdx),
        value: c.methods, hard: limits.maxClassMethods,
        detail: `class ${c.name}: ${c.methods} methods`,
      });
    }
  }

  // Declared exports only: `export { x } from` re-exports belong to barrels
  // and cannot hide a junk drawer (the declarations are counted where they live).
  const exportCount = extractExports(source).length;
  if (exportCount > Math.floor(limits.maxExportsPerFile * softFactor)) {
    hits.push({
      limit: 'exports', kind: 'exports', line: 1,
      value: exportCount, hard: limits.maxExportsPerFile,
      detail: `${exportCount} declared exports`,
    });
  }

  return { totalLines, hits };
}

// --- run ---------------------------------------------------------------------
// modularity.ignorePaths exempts declarative/framework files from size
// budgets, matching the drift principle (shape, not logic).
const modIgnore = Array.isArray(cfgMod.ignorePaths) ? cfgMod.ignorePaths : [];
if (modIgnore.length > 0) {
  console.log(
    `[note] ${modIgnore.length} glob(s) exempt from size budgets via modularity.ignorePaths - ` +
    'the budget cannot see matching files. Exempt declarative/framework files only; ' +
    'a source file here needs decomposition, not an exemption.',
  );
}
const files = applyIgnorePaths(
  toScanRelative(
    positionals.length > 0
      ? collectPathFiles(positionals, { extensions: scanExtensions(loadConfig()) })
      : resolveScanTarget(args.src, { extensions: scanExtensions(loadConfig()) }),
    args.src,
  ),
  modIgnore,
  { label: 'modularity.ignorePaths', src: args.src },
);

const limits = {
  maxFileLines: args.maxFileLines,
  maxFunctionLines: args.maxFunctionLines,
  maxClassMethods: args.maxClassMethods,
  maxExportsPerFile: args.maxExportsPerFile,
};

// Soft band: pressure without failure. Default 80% of the (possibly raised)
// hard cap. An in-file exception raises the hard cap for that limit only, so a
// file-lines exception can never excuse a 150-method class.
const SOFT_FACTOR =
  typeof cfgMod.softFactor === 'number' && cfgMod.softFactor > 0 && cfgMod.softFactor <= 1
    ? cfgMod.softFactor : 0.8;
const MAX_EXCEPTIONS =
  Number.isInteger(cfgMod.maxExceptions) && cfgMod.maxExceptions >= 0
    ? cfgMod.maxExceptions : 3;

let violations = 0;
let exceptionCount = 0;
let badExceptions = 0;
const perFileKinds = {};
const fileLines = {};
const softNotes = [];

/** Pick the exception that applies to a hit, marking it used. */
function pickException(exceptions, hit) {
  const scoped = exceptions.filter((e) => e.limit === hit.limit && !e.used);
  if (scoped.length === 0) return null;
  if (hit.limit === 'file-lines' || hit.limit === 'exports') {
    scoped[0].used = true;
    return scoped[0];
  }
  const placed = scoped.find((e) => e.line >= hit.line - 5 && e.line < hit.line);
  if (placed) placed.used = true;
  return placed ?? null;
}

for (const file of files) {
  const source = readFileSync(file.full, 'utf8');
  const { totalLines, hits } = analyze(source, limits, SOFT_FACTOR);
  fileLines[file.rel] = totalLines;

  const { exceptions, invalid } = parseLimitExceptions(source);
  exceptionCount += exceptions.length;
  for (const bad of invalid) {
    console.error(`[x] ${file.rel}:${bad.line}: invalid anti-slop directive - ${bad.why}`);
    badExceptions++;
  }

  const fileViolations = [];
  const kinds = {};
  for (const hit of hits) {
    const ex = pickException(exceptions, hit);
    const hard = ex ? Math.max(hit.hard, ex.value) : hit.hard;
    const soft = Math.floor(hard * SOFT_FACTOR);
    if (hit.value > hard) {
      fileViolations.push({ ...hit, detail: `${hit.detail} (> ${hard}${ex ? `, declared ${ex.value}` : ''})` });
      kinds[hit.kind] = (kinds[hit.kind] ?? 0) + 1;
    } else if (hit.value > soft) {
      softNotes.push({ rel: file.rel, ...hit, hard, soft });
    }
  }

  for (const ex of exceptions) {
    if (ex.used) {
      console.log(`[note] ${file.rel}:${ex.line}: declared ${ex.limit} ${ex.value} - "${ex.reason}"`);
    } else if (ex.limit === 'function-lines' || ex.limit === 'class-methods') {
      if (hits.some((h) => h.limit === ex.limit)) {
        console.error(`[x] ${file.rel}:${ex.line}: a ${ex.limit} exception must sit within 5 lines above the member it exempts`);
        badExceptions++;
      }
    }
  }

  if (fileViolations.length > 0) {
    console.log(`${file.rel} (${totalLines} lines):`);
    for (const v of fileViolations) console.log(`  [${v.kind}] line ${v.line}: ${v.detail}`);
    violations += fileViolations.length;
    perFileKinds[file.rel] = kinds;
  }
}

if (exceptionCount > MAX_EXCEPTIONS) {
  console.error(
    `[x] ${exceptionCount} anti-slop limit exceptions declared (max ${MAX_EXCEPTIONS} per repo). ` +
    'That is a pattern, not an exception - decompose the code instead of exempting it.',
  );
  badExceptions++;
}

if (softNotes.length > 0) {
  console.log(`[note] ${softNotes.length} finding(s) in the soft band (approaching the hard cap):`);
  for (const n of softNotes.slice(0, 5)) {
    console.log(`    ${n.rel}: ${n.kind} ${n.value} (soft ${n.soft} / hard ${n.hard})`);
  }
  if (softNotes.length > 5) console.log(`    ...and ${softNotes.length - 5} more`);
}

if (badExceptions > 0) process.exit(1);

if (files.length === 0 && positionals.length > 0) {
  console.log(
    `[note] ${positionals.length} path(s) given, but none are checkable - test files, ` +
    'generated files and ignorePaths are excluded. Nothing was enforced by this run.',
  );
}

if (violations === 0) {
  console.log(`[ok] Modularity check passed (${files.length} files within budgets).`);
  process.exit(0);
}

// --- baseline (ratchet) mode ---------------------------------------------------
const decision = baselineGate({
  args,
  section: 'modularity',
  current: perFileKinds,
  kindCounts: true,
  unit: 'violation(s)',
  showKind: true,
  fixLine: 'Fix: split by responsibility (see the modular-architecture skill).',
});
if (decision === 'ok') process.exit(0);
if (decision === 'fail') process.exit(1);

console.log(`\n${violations} size-budget violation(s) in ${files.length} file(s).`);
console.error(
  '[x] Modularity check FAILED.\n' +
  '    Fix: split by responsibility (see the modular-architecture skill) — transport/service/domain/data,\n' +
  '    smaller functions, smaller public surfaces. Do NOT compress code, raise budgets, or disable the check.\n' +
  '    Adopting a repo with legacy violations? Snapshot them once:\n' +
  '    node scripts/anti-slop/check-modularity.mjs --update-baseline — the gate then fails only on NEW ones.'
);
process.exit(args.reportOnly ? 0 : 1);
