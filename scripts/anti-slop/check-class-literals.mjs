#!/usr/bin/env node
/**
 * check-class-literals.mjs
 *
 * Design-system drift gate. The duplicate detector cannot see repeated
 * `className` literals: a class string is a handful of tokens, far below the
 * clone window, and the JSX around it differs per call site. So the same panel
 * chrome or layout skeleton can be re-spelled in ten components while every
 * other gate stays green.
 *
 * Counts normalised className literals (whitespace-split, sorted, joined) and
 * flags any that appear `minOccurrences` times or more. Ordering and duplicate
 * whitespace do not matter; `${...}` interpolations are stripped, so a template
 * literal matches its equivalent plain string.
 *
 * Zero dependencies. Only runs when executed directly.
 *
 * Usage: node check-class-literals.mjs [--src src] [--min-occurrences 4]
 *        [--report-only] [--baseline file] [--update-baseline]
 * Config: anti-slop.config.json "classLiterals" section (src, minOccurrences,
 *         allow globs).
 */

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { walk } from './lib.mjs';
import { gateArgs, applyIgnorePaths } from './cli.mjs';
import { loadConfig } from './config.mjs';
import { baselineGate } from './baseline.mjs';

/** Extensions that can carry JSX className literals. */
const JSX_EXT = ['.tsx', '.jsx'];

/** className="...", className='...', className={"..."} or a template literal. */
const CLASS_NAME_RE =
  /className\s*=\s*(?:"([^"]*)"|'([^']*)'|\{\s*"([^"]*)"\s*\}|\{\s*'([^']*)'\s*\}|\{\s*`([^`]*)`\s*\})/g;

/** Sort tokens so `a b` and `b a` are the same literal; drop interpolations. */
export function normaliseClassList(raw) {
  return raw
    .replace(/\$\{[^}]*\}/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .sort()
    .join(' ');
}

/**
 * Normalised className literals in one source: [{ value, line }].
 * Only literals with two or more tokens are considered (a single utility class
 * is not a skeleton).
 */
export function extractClassLiterals(source) {
  const found = [];
  source.split(/\r?\n/).forEach((line, i) => {
    for (const m of line.matchAll(CLASS_NAME_RE)) {
      const raw = m[1] ?? m[2] ?? m[3] ?? m[4] ?? m[5] ?? '';
      const value = normaliseClassList(raw);
      if (value.split(' ').length < 2) continue;
      found.push({ value, line: i + 1 });
    }
  });
  return found;
}

function main() {
  const cfg = loadConfig().classLiterals ?? {};
  const { args } = gateArgs({
    argv: process.argv.slice(2),
    usage:
      'Usage: node check-class-literals.mjs [--src src] [--min-occurrences 4] [--report-only] [--baseline file] [--update-baseline]\n' +
      'Config: anti-slop.config.json "classLiterals" section (src, minOccurrences, allow globs).\n' +
      'Flags normalised className literals repeated across components - the design-system drift the clone detector cannot see.\n' +
      'With a baseline file (default anti-slop.baseline.json) the gate fails only on NEW repetition.',
    spec: {
      '--src': 'string',
      '--min-occurrences': 'number',
      '--report-only': 'flag',
      '--baseline': 'string',
      '--update-baseline': 'flag',
    },
    defaults: {
      src: cfg.src ?? 'src',
      minOccurrences: cfg.minOccurrences ?? 4,
    },
  });

  const allow = Array.isArray(cfg.allow) ? cfg.allow : [];
  const srcAbs = path.resolve(args.src);
  if (!existsSync(srcAbs)) {
    console.log(
      `[ok] No JSX sources under ${args.src} - the class-literal gate is INERT for this repo.\n` +
      '    Point classLiterals.src at your components directory to enable it.',
    );
    process.exit(0);
  }
  const scanned = applyIgnorePaths(
    walk(srcAbs, srcAbs, { extensions: JSX_EXT }),
    allow,
    { label: 'classLiterals.allow', src: args.src },
  );

  /** normalised literal -> occurrences [{ rel, line }] */
  const occurrences = new Map();
  for (const file of scanned) {
    for (const hit of extractClassLiterals(readFileSync(file.full, 'utf8'))) {
      if (!occurrences.has(hit.value)) occurrences.set(hit.value, []);
      occurrences.get(hit.value).push({ rel: file.rel, line: hit.line });
    }
  }

  const flagged = [...occurrences.entries()]
    .filter(([, hits]) => hits.length >= args.minOccurrences)
    .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));

  if (flagged.length === 0) {
    console.log(
      `[ok] No className literal repeats ${args.minOccurrences}+ times ` +
      `(${scanned.length} file(s), ${occurrences.size} distinct literal(s)).`,
    );
    process.exit(0);
  }

  const current = Object.fromEntries(flagged.map(([value, hits]) => [value, hits.length]));
  const total = flagged.reduce((n, [, hits]) => n + hits.length, 0);

  console.log(
    `${flagged.length} className literal(s) repeated ${args.minOccurrences}+ times ` +
    `(${total} occurrence(s) across ${scanned.length} file(s)):\n`,
  );
  for (const [value, hits] of flagged) {
    console.log(`  ${hits.length}x  ${value}`);
    const shown = hits.slice(0, 4).map((h) => `${h.rel}:${h.line}`).join('  ');
    console.log(`      ${shown}${hits.length > 4 ? `  … (+${hits.length - 4})` : ''}`);
  }
  console.log(
    '\n  Hint: use the existing component/utility or extract one; a repeated literal is\n' +
    '  the layout skeleton re-spelled. See the layout-composition skill.',
  );

  if (args.reportOnly) process.exit(0);

  const decision = baselineGate({
    args,
    section: 'classLiterals',
    current,
    unit: 'occurrence(s)',
    fixLine: 'Fix: extract the component or move the literal into the design-system module.',
  });
  if (decision === 'ok') process.exit(0);
  if (decision === 'fail') process.exit(1);

  console.error(
    `\n[x] Class-literal check FAILED (${flagged.length} literal(s) at ${args.minOccurrences}+ repetitions).\n` +
    '    Do NOT raise minOccurrences or add ignore globs to pass; extract the component.\n' +
    '    Adopting a repo with existing drift? Snapshot it once:\n' +
    '    node scripts/anti-slop/check-class-literals.mjs --update-baseline',
  );
  process.exit(1);
}

const isMain =
  process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) main();
