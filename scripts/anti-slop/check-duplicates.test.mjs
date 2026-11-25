/**
 * Integration tests for the duplicates gate's absolute guards.
 *
 * `threshold` is a RATIO across the scanned tree, so adding a large clean file
 * lowers the percentage without removing a single clone. `maxDuplicatedLines`
 * (config) and the baseline's stored `totalDuplicatedLines` are absolute, and
 * must fail regardless of what the ratio says.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const GATE = fileURLToPath(new URL('./check-duplicates.mjs', import.meta.url));

/** A 30-line block that is byte-identical in both files (well over 50 tokens). */
const SHARED = Array.from({ length: 30 }, (_, i) => `  const v${i} = ${i};`).join('\n');

/** Two files sharing SHARED; only the function names differ. */
function fixture(duplicates = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), 'antislop-dup-'));
  mkdirSync(path.join(dir, 'src'), { recursive: true });
  writeFileSync(
    path.join(dir, 'anti-slop.config.json'),
    JSON.stringify({
      duplicates: { src: 'src', minTokens: 50, threshold: 100, ...duplicates },
    }),
  );
  writeFileSync(path.join(dir, 'src', 'a.ts'), `export function alpha() {\n${SHARED}\n  return v0;\n}\n`);
  writeFileSync(path.join(dir, 'src', 'b.ts'), `export function beta() {\n${SHARED}\n  return v0;\n}\n`);
  return dir;
}

function run(dir, args = []) {
  return spawnSync(process.execPath, [GATE, ...args], { cwd: dir, encoding: 'utf8' });
}

test('duplicates: the ratio alone can pass while real duplication exists', () => {
  const dir = fixture();
  const r = run(dir);
  assert.equal(r.status, 0, r.stderr);
  rmSync(dir, { recursive: true, force: true });
});

test('duplicates: maxDuplicatedLines fails regardless of the ratio', () => {
  const dir = fixture({ maxDuplicatedLines: 5 });
  const r = run(dir);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /absolute budget: \d+ duplicated lines > maxDuplicatedLines 5/);
  rmSync(dir, { recursive: true, force: true });
});

test('duplicates: a baseline total lower than current fails even with no new per-file debt', () => {
  const dir = fixture();
  const written = run(dir, ['--update-baseline']);
  assert.equal(written.status, 0, written.stderr);

  const file = path.join(dir, 'anti-slop.baseline.json');
  const snapshot = JSON.parse(readFileSync(file, 'utf8'));
  snapshot.duplicates.totalDuplicatedLines = 1; // stale/tampered: per-file counts unchanged
  writeFileSync(file, `${JSON.stringify(snapshot, null, 2)}\n`);

  const r = run(dir);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /baseline total: \d+ duplicated lines > accepted 1/);
  rmSync(dir, { recursive: true, force: true });
});

test('duplicates: a baseline total at or above current passes', () => {
  const dir = fixture();
  const written = run(dir, ['--update-baseline']);
  assert.equal(written.status, 0, written.stderr);

  const file = path.join(dir, 'anti-slop.baseline.json');
  const snapshot = JSON.parse(readFileSync(file, 'utf8'));
  snapshot.duplicates.totalDuplicatedLines = 9999;
  writeFileSync(file, `${JSON.stringify(snapshot, null, 2)}\n`);

  const r = run(dir);
  assert.equal(r.status, 0, r.stderr);
  rmSync(dir, { recursive: true, force: true });
});
