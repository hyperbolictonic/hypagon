/**
 * Integration tests for check-modularity's ignorePaths notice: an exemption
 * the gate does not name is a silently unenforced file, and this kit does not
 * allow silent passes.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
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
