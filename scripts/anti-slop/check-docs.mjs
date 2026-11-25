#!/usr/bin/env node
/**
 * check-docs.mjs
 *
 * Documentation gate for shared exports. Fails (exit 1) when exported
 * declarations in the checked files lack a one-line `/** When to use ... *\/`
 * JSDoc above them. Keeps docs/COMPONENT_INDEX.md (generated from the same
 * JSDoc) a maintained, trustworthy inventory instead of a stale artifact.
 *
 * Zero dependencies.
 *
 * Usage:
 *   node scripts/anti-slop/check-docs.mjs [paths...] [--src src] [--report-only]
 *
 * With no path arguments it scans --src (default `src`). With path arguments
 * it checks exactly those files — used by git hooks to check only staged
 * files, so legacy undocumented code never blocks commits.
 */

import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { extractExports } from './lib.mjs';
import { gateArgs, collectPathFiles, resolveScanTarget, applyIgnorePaths, toScanRelative } from './cli.mjs';
import { loadConfig, scanExtensions } from './config.mjs';
import { baselineGate } from './baseline.mjs';

// Defaults < anti-slop.config.json < CLI flags.
const cfgDocs = loadConfig().docs ?? {};
const { args, positionals } = gateArgs({
  argv: process.argv.slice(2),
  usage: 'Usage: node check-docs.mjs [paths...] [--src src] [--report-only] [--baseline file] [--update-baseline]\n' +
         'Config: anti-slop.config.json "docs" section (src, ignorePaths, ignoreExports).\n' +
         'With path arguments, checks exactly those files (git-hook staged mode).\n' +
         'With a baseline file (default anti-slop.baseline.json) the gate fails only on NEW undocumented exports.',
  spec: { '--src': 'string', '--report-only': 'flag', '--baseline': 'string', '--update-baseline': 'flag' },
  defaults: { src: cfgDocs.src ?? 'src' },
  allowPositionals: true,
});

// Framework-owned exports that are configuration, not shared surface.
// Defaulted on when a Next.js config is present (segment config exports).
const NEXTJS_EXPORTS = [
  'metadata', 'generateMetadata', 'viewport', 'generateViewport', 'dynamic',
  'revalidate', 'runtime', 'dynamicParams', 'fetchCache', 'maxDuration',
  'preferredRegion', 'generateStaticParams', 'generateImageMetadata',
];
const hasNextConfig = existsSync(path.join(process.cwd(), 'next.config.js')) ||
  existsSync(path.join(process.cwd(), 'next.config.mjs')) ||
  existsSync(path.join(process.cwd(), 'next.config.ts'));
const ignoreExports = Array.isArray(cfgDocs.ignoreExports)
  ? cfgDocs.ignoreExports
  : (hasNextConfig ? NEXTJS_EXPORTS : []);
const ignorePaths = Array.isArray(cfgDocs.ignorePaths) ? cfgDocs.ignorePaths : [];

const allFiles = toScanRelative(
  positionals.length > 0
    ? collectPathFiles(positionals, { extensions: scanExtensions(loadConfig()) })
    : resolveScanTarget(args.src, { extensions: scanExtensions(loadConfig()) }),
  args.src,
);
// ignorePaths applies in both modes (per-file/staged and whole-tree), so the
// hook never rejects files the config says to ignore.
const files = applyIgnorePaths(allFiles, ignorePaths, { label: 'docs.ignorePaths', src: args.src });

let missing = 0;
const detail = [];
const perFileDocs = {};
let filesWithExports = 0;
for (const file of files) {
  let exports;
  try {
    exports = extractExports(readFileSync(file.full, 'utf8'));
  } catch {
    continue;
  }
  if (exports.length > 0) filesWithExports++;
  // Default exports are entry points (route files, pages) consumed by the
  // framework, not shared surface; exempt them the way the index count does.
  const undocumented = exports.filter(
    (e) => !e.desc && !e.isDefault && !ignoreExports.includes(e.name),
  );
  if (undocumented.length === 0) continue;
  perFileDocs[file.rel] = undocumented.length;
  missing += undocumented.length;
  detail.push({ rel: file.rel, names: undocumented.map((e) => e.name) });
}

// Vacuous-green guard: this gate parses JS/TS export syntax. If a real
// codebase produced zero parsed exports, the gate is inert for that language
// (e.g. a Python/C++ preset) — say so instead of passing silently.
if (files.length > 0 && filesWithExports === 0) {
  console.error(
    `[warn] No exports found in ${files.length} file(s) — the docs gate parses JS/TS\n` +
    'export syntax and is likely INERT for this language. A green result here is\n' +
    'not architectural enforcement.'
  );
}

// --- baseline (ratchet) mode ---------------------------------------------------
const decision = baselineGate({
  args,
  section: 'docs',
  current: perFileDocs,
  unit: 'undocumented export(s)',
  fixLine: 'Fix: add the one-line "/** When to use ... */" JSDoc — it feeds the component index.',
});
if (decision === 'ok') process.exit(0);
if (decision === 'fail') process.exit(args.reportOnly ? 0 : 1);

if (files.length === 0 && positionals.length > 0) {
  console.log(
    `[note] ${positionals.length} path(s) given, but none are checkable - test files, ` +
    'generated files and ignorePaths are excluded. Nothing was enforced by this run.',
  );
}

if (missing === 0) {
  console.log(`[ok] Docs check passed (${files.length} file(s), every export documented).`);
  process.exit(0);
}

console.log(`${missing} undocumented export(s) in ${detail.length} file(s):`);
for (const d of detail.slice(0, 20)) {
  console.log(`  ${d.rel}: ${d.names.join(', ')}`);
}
if (detail.length > 20) console.log(`  ... and ${detail.length - 20} more file(s)`);

console.error(
  '\n[x] Docs check FAILED.\n' +
  '    Fix: add a one-line "/** When to use ... */" JSDoc above each export —\n' +
  '    this is what feeds docs/COMPONENT_INDEX.md, the inventory the\n' +
  '    reuse-before-create pre-flight depends on. Do NOT delete the check or\n' +
  '    leave the doc as a bare restatement of the name.'
);
process.exit(args.reportOnly ? 0 : 1);
