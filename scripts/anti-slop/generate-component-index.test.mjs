/**
 * Tests for the two-tier index: the full inventory keeps the "when to use"
 * descriptions, and the digest (one line per module, capped) is what gets
 * loaded into every session. The cap is the point - an unbounded generated
 * file in `instructions` taxes sessions that never touch shared code.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const GATE = fileURLToPath(new URL('./generate-component-index.mjs', import.meta.url));

/** Temp repo with `n` modules, `k` documented exports each. */
function fixture(n, k = 1) {
  const dir = mkdtempSync(path.join(tmpdir(), 'antislop-index-'));
  mkdirSync(path.join(dir, 'src'), { recursive: true });
  for (let i = 0; i < n; i++) {
    const exports = Array.from(
      { length: k },
      (_, j) => `/** Does thing ${i}.${j}; use it when you need thing ${i}.${j}. */\nexport function thing${i}_${j}() { return ${i}; }`,
    ).join('\n');
    writeFileSync(path.join(dir, 'src', `mod${i}.ts`), `${exports}\n`);
  }
  return dir;
}

function generate(dir) {
  const run = spawnSync(process.execPath, [GATE, '--src', 'src'], { cwd: dir, encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr);
  const full = readFileSync(path.join(dir, 'docs', 'COMPONENT_INDEX.md'), 'utf8');
  const digest = readFileSync(path.join(dir, 'docs', 'COMPONENT_INDEX.digest.md'), 'utf8');
  return { full, digest, out: run.stdout };
}

test('index: the digest lists modules and export names, and is far smaller than the full index', () => {
  // 3 modules x 8 exports: the full index has 24 description rows, the digest
  // has 3 module rows. Digest size follows MODULE count, not export count.
  const dir = fixture(3, 8);
  const { full, digest } = generate(dir);
  assert.match(digest, /`mod0\.ts` \| 8: thing0_0, thing0_1/);
  assert.match(full, /Does thing 0\.0; use it when you need thing 0\.0\./);
  assert.ok(digest.length < full.length / 2, 'digest should be a fraction of the full index');
  rmSync(dir, { recursive: true, force: true });
});

test('index: the digest is capped and says how many modules were omitted', () => {
  const dir = fixture(125); // cap is 120
  const { digest } = generate(dir);
  const rows = digest.split('\n').filter((l) => l.startsWith('| `'));
  assert.equal(rows.length, 120);
  assert.match(digest, /and 5 more module\(s\)/);
  rmSync(dir, { recursive: true, force: true });
});

test('index: --check verifies both files', () => {
  const dir = fixture(3);
  generate(dir);
  const ok = spawnSync(process.execPath, [GATE, '--src', 'src', '--check'], { cwd: dir, encoding: 'utf8' });
  assert.equal(ok.status, 0, ok.stderr);

  writeFileSync(path.join(dir, 'docs', 'COMPONENT_INDEX.digest.md'), 'stale\n');
  const stale = spawnSync(process.execPath, [GATE, '--src', 'src', '--check'], { cwd: dir, encoding: 'utf8' });
  assert.equal(stale.status, 1);
  assert.match(stale.stderr, /COMPONENT_INDEX\.digest\.md is stale/);
  rmSync(dir, { recursive: true, force: true });
});
