/**
 * Integration tests for check-modularity's ignorePaths notice: an exemption
 * the gate does not name is a silently unenforced file, and this kit does not
 * allow silent passes.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const GATE = fileURLToPath(new URL('./check-modularity.mjs', import.meta.url));

/** Temp repo with an over-budget src/big.ts and the given config. */
function fixture(config) {
  const dir = mkdtempSync(path.join(tmpdir(), 'antislop-mod-'));
  mkdirSync(path.join(dir, 'src'), { recursive: true });
  writeFileSync(path.join(dir, 'anti-slop.config.json'), JSON.stringify(config));
  const lines = Array.from({ length: 520 }, (_, i) => `const v${i} = ${i};`).join('\n');
  writeFileSync(path.join(dir, 'src', 'big.ts'), `${lines}\n`);
  return dir;
}

function run(dir) {
  return spawnSync(process.execPath, [GATE], { cwd: dir, encoding: 'utf8' });
}

function runArgs(dir, args) {
  return spawnSync(process.execPath, [GATE, ...args], { cwd: dir, encoding: 'utf8' });
}

test('modularity: an over-budget file fails the gate', () => {
  const dir = fixture({ modularity: { src: 'src' } });
  const r = run(dir);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /\[file\]/);
  assert.doesNotMatch(r.stdout, /\[note\]/);
  rmSync(dir, { recursive: true, force: true });
});

test('modularity: ignorePaths exempts the file AND prints a notice naming the exemption', () => {
  const dir = fixture({ modularity: { src: 'src', ignorePaths: ['big.ts'] } });
  const r = run(dir);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /\[note\] 1 glob\(s\) exempt from size budgets via modularity\.ignorePaths/);
  assert.match(r.stdout, /needs decomposition, not an exemption/);
  rmSync(dir, { recursive: true, force: true });
});

test('modularity: typed method signatures are measured (regression: `): Type {`)', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'antislop-typed-'));
  mkdirSync(path.join(dir, 'src'), { recursive: true });
  const body = Array.from({ length: 90 }, (_, i) => `    const v${i} = ${i};`).join('\n');
  writeFileSync(
    path.join(dir, 'src', 'svc.ts'),
    `export class Svc {\n  public run(): Promise<void> {\n${body}\n  }\n}\n`,
  );
  const r = run(dir);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /\[function\]/);
  rmSync(dir, { recursive: true, force: true });
});

test('modularity: per-file baseline keys match the full run (staged mode)', () => {
  const dir = fixture({ modularity: { src: 'src' } }); // src/big.ts over budget
  const update = runArgs(dir, ['--update-baseline']);
  assert.equal(update.status, 0, update.stderr);

  const baseline = JSON.parse(readFileSync(path.join(dir, 'anti-slop.baseline.json'), 'utf8'));
  assert.deepEqual(Object.keys(baseline.modularity.files), ['big.ts'], 'baseline must be scan-relative');

  const perFile = runArgs(dir, ['src/big.ts']);
  assert.equal(perFile.status, 0, perFile.stderr);
  rmSync(dir, { recursive: true, force: true });
});

// --- soft band, exceptions, exports budget ----------------------------------

/** Temp repo with one file of `lines` simple statements. */
function fileRepo(lines, content = null) {
  const dir = mkdtempSync(path.join(tmpdir(), 'antislop-band-'));
  mkdirSync(path.join(dir, 'src'), { recursive: true });
  const body = content ?? Array.from({ length: lines }, (_, i) => `const v${i} = ${i};`).join('\n');
  writeFileSync(path.join(dir, 'src', 'x.ts'), `${body}\n`);
  return dir;
}

test('modularity: the soft band prints a note and still passes', () => {
  const dir = fileRepo(420); // soft 400 / hard 500
  const r = run(dir);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /soft band/);
  assert.match(r.stdout, /x\.ts: file 42\d \(soft 400 \/ hard 500\)/);
  rmSync(dir, { recursive: true, force: true });
});

test('modularity: a declared exception raises only that limit, and is printed', () => {
  const dir = fileRepo(0, [
    '// anti-slop: file-lines 620 — generated parse table, one artifact',
    ...Array.from({ length: 600 }, (_, i) => `const v${i} = ${i};`),
  ].join('\n'));
  const r = run(dir);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /declared file-lines 620/);
  rmSync(dir, { recursive: true, force: true });
});

test('modularity: growing beyond a declared exception fails again', () => {
  const dir = fileRepo(0, [
    '// anti-slop: file-lines 620 — generated parse table, one artifact',
    ...Array.from({ length: 660 }, (_, i) => `const v${i} = ${i};`),
  ].join('\n'));
  const r = run(dir);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /\(> 620, declared 620\)/);
  rmSync(dir, { recursive: true, force: true });
});

test('modularity: an exception without a reason fails', () => {
  const dir = fileRepo(0, [
    '// anti-slop: file-lines 620',
    ...Array.from({ length: 600 }, (_, i) => `const v${i} = ${i};`),
  ].join('\n'));
  const r = run(dir);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /invalid anti-slop directive/);
  assert.match(r.stderr, /reason.*required/i);
  rmSync(dir, { recursive: true, force: true });
});

test('modularity: more exceptions than the cap is a pattern, not an exception', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'antislop-cap-'));
  mkdirSync(path.join(dir, 'src'), { recursive: true });
  const body = Array.from({ length: 600 }, (_, i) => `const v${i} = ${i};`).join('\n');
  for (let i = 0; i < 4; i++) {
    writeFileSync(
      path.join(dir, 'src', `m${i}.ts`),
      `// anti-slop: file-lines 620 — generated table ${i} for the parser\n${body}\n`,
    );
  }
  const r = run(dir);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /4 anti-slop limit exceptions declared \(max 3 per repo\)/);
  rmSync(dir, { recursive: true, force: true });
});

test('modularity: too many declared exports fails, and re-exports do not count', () => {
  const exports = Array.from({ length: 21 }, (_, i) => `export const v${i} = ${i};`).join('\n');
  const dir = fileRepo(0, exports);
  const r = run(dir);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /\[exports\] line 1: 21 declared exports/);
  rmSync(dir, { recursive: true, force: true });

  const barrel = fileRepo(0, Array.from({ length: 40 }, (_, i) => `export { v${i} } from './m${i}';`).join('\n'));
  const ok = run(barrel);
  assert.equal(ok.status, 0, ok.stderr);
  rmSync(barrel, { recursive: true, force: true });
});
