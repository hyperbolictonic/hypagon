#!/usr/bin/env node
/**
 * Decomposition audit — applies issue #10's checklist to every file added on this branch.
 *
 * Usage: node scripts/anti-slop/audit-decomposition.mjs [baseRef]
 *
 * Prints one row per added file and a verdict, so a human reviews exceptions instead of reading
 * every diff. Checks:
 *   1. fits its own budget (<= 300 lines)
 *   2. no text-slicing names (part-*, base.ts, *-1.ts)
 *   3. a class carries an explicit `…Deps` interface (or the module has no `this.`)
 *   4. no back-reference to the module it was extracted from
 *   5. no accepted duplicate debt of its own
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '../..');
const base = process.argv[2] || (() => {
  try {
    return execSync('git merge-base HEAD origin/main', { cwd: ROOT, encoding: 'utf8' }).trim();
  } catch {
    return execSync('git rev-list --max-parents=0 HEAD', { cwd: ROOT, encoding: 'utf8' }).trim().split('\n')[0];
  }
})();

const added = execSync(`git diff --name-only --diff-filter=A ${base} HEAD -- src`, { cwd: ROOT, encoding: 'utf8' })
  .split('\n')
  .map((line) => line.trim())
  .filter((line) => line.endsWith('.ts'));

const baseline = JSON.parse(fs.readFileSync(path.join(ROOT, 'anti-slop.baseline.json'), 'utf8'));
const dupFiles = baseline.duplicates?.files ?? {};
const relOf = (file) => file.replace(/^src\//, '');

const rows = [];
for (const file of added) {
  const text = fs.readFileSync(path.join(ROOT, file), 'utf8');
  const lines = text.split('\n').length;
  const name = path.basename(file);

  const classMatch = /export class (\w+)/.exec(text);
  const hasDeps = /export interface \w+Deps\b/.test(text);
  const usesThis = /\bthis\./.test(text);
  const backRef = /from '[^']*(browser-chassis|main\/index)/.test(text);
  const sliceName = /^(part-|-)|^base\.ts$|-\d+\.ts$/.test(name);
  const dupEntry = dupFiles[relOf(file)];
  const dupLines = typeof dupEntry === 'number' ? dupEntry : Object.values(dupEntry ?? {}).reduce((a, c) => a + c, 0);

  const failures = [];
  if (lines > 300) failures.push(`size ${lines}>300`);
  if (sliceName) failures.push('slice-style name');
  if (classMatch && usesThis && !hasDeps) failures.push('class without Deps');
  if (backRef) failures.push('back-reference');
  if (dupLines > 0) failures.push(`dup debt ${dupLines}`);

  rows.push({ file: relOf(file), lines, kind: classMatch ? 'class' : 'module', deps: hasDeps ? 'yes' : '—', dup: dupLines, failures });
}

const pass = rows.filter((r) => r.failures.length === 0);
const fail = rows.filter((r) => r.failures.length > 0);

const pad = (s, n) => String(s).padEnd(n);
console.log(`\nDecomposition audit — ${rows.length} files added since ${base.slice(0, 8)}\n`);
console.log(`${pad('file', 46)} ${pad('lines', 6)} ${pad('kind', 7)} ${pad('deps', 5)} ${pad('dup', 4)} verdict`);
for (const row of rows.sort((a, b) => a.file.localeCompare(b.file))) {
  console.log(
    `${pad(row.file, 46)} ${pad(row.lines, 6)} ${pad(row.kind, 7)} ${pad(row.deps, 5)} ${pad(row.dup, 4)} ${
      row.failures.length ? `FAIL — ${row.failures.join(', ')}` : 'PASS'
    }`,
  );
}

console.log(`\n${pass.length} pass · ${fail.length} fail`);
if (fail.length) {
  console.log('\nFailures to fix (see issue #10):');
  for (const row of fail) console.log(`  ${row.file}: ${row.failures.join(', ')}`);
  process.exit(1);
}
