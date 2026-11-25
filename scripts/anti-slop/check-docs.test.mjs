/**
 * Integration tests for the docs gate's baseline keys.
 *
 * The full-tree run keys the baseline scan-relative (`x.ts`); the pre-commit
 * hook passes staged paths, which resolve repo-relative (`src/x.ts`). Without
 * normalisation every baselined file looked like new debt on commit, and the
 * only way to satisfy the gate was to write a key the full run never produces.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const GATE = fileURLToPath(new URL('./check-docs.mjs', import.meta.url));

function fixture() {
  const dir = mkdtempSync(path.join(tmpdir(), 'antislop-docs-'));
  mkdirSync(path.join(dir, 'src'), { recursive: true });
  writeFileSync(
    path.join(dir, 'anti-slop.config.json'),
    JSON.stringify({ docs: { src: 'src' } }),
  );
  writeFileSync(
    path.join(dir, 'src', 'x.ts'),
    '/** documented */\nexport const a = 1;\nexport const b = 2;\n',
  );
  return dir;
}

function run(dir, args = []) {
  return spawnSync(process.execPath, [GATE, ...args], { cwd: dir, encoding: 'utf8' });
}

test('docs: a baselined file passes in per-file (staged) mode', () => {
  const dir = fixture();
  const update = run(dir, ['--update-baseline']);
  assert.equal(update.status, 0, update.stderr);

  const baseline = JSON.parse(readFileSync(path.join(dir, 'anti-slop.baseline.json'), 'utf8'));
  assert.deepEqual(Object.keys(baseline.docs.files), ['x.ts'], 'baseline must be scan-relative');

  const perFile = run(dir, ['src/x.ts']);
  assert.equal(perFile.status, 0, perFile.stderr);
  rmSync(dir, { recursive: true, force: true });
});

test('docs: a genuinely new undocumented export still fails in per-file mode', () => {
  const dir = fixture();
  assert.equal(run(dir, ['--update-baseline']).status, 0);

  writeFileSync(
    path.join(dir, 'src', 'x.ts'),
    '/** documented */\nexport const a = 1;\nexport const b = 2;\nexport const c = 3;\n',
  );
  const perFile = run(dir, ['src/x.ts']);
  assert.equal(perFile.status, 1);
  assert.match(perFile.stdout + perFile.stderr, /NEW undocumented export/);
  rmSync(dir, { recursive: true, force: true });
});
