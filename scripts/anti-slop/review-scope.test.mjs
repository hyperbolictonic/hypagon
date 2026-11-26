/**
 * Tests for the review trigger: the pure decision (size, renames, risk paths,
 * docs/test-only skips) and one real-git integration for the diff reader.
 *
 * The trigger is advice, never a gate — every case here asserts `needed`
 * plus the reasons a human would read, not an exit code.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { changedFiles, resolveBase, reviewDecision } from './review-scope.mjs';

/** Shorthand: a file list with one changed line each, overridable. */
function diff(paths, { lines = 10, renames = [] } = {}) {
  return {
    files: paths.map((p) => ({ path: p, added: lines, deleted: 0, binary: false })),
    lines: lines * paths.length,
    renames: new Set(renames),
  };
}

test('reviewDecision: small, ordinary diff needs no review', () => {
  const d = reviewDecision(diff(['src/lib/price.ts']));
  assert.equal(d.needed, false);
  assert.ok(d.reasons.every((r) => r.length > 0));
});

test('reviewDecision: no changes is a skip with a reason, not a silent pass', () => {
  const d = reviewDecision({ files: [], lines: 0, renames: new Set() });
  assert.equal(d.needed, false);
  assert.match(d.reasons[0], /no changes/);
});

test('reviewDecision: size thresholds use the config, not constants', () => {
  const files = Array.from({ length: 4 }, (_, i) => `src/a${i}.ts`);
  assert.equal(reviewDecision(diff(files, { lines: 10 }), { maxFiles: 5, maxLines: 200 }).needed, false);
  assert.match(
    reviewDecision(diff(files, { lines: 10 }), { maxFiles: 4 }).reasons.join(' '),
    /4 files \(threshold 4\)/,
  );
  assert.match(
    reviewDecision(diff(['src/a.ts'], { lines: 500 }), { maxLines: 200 }).reasons.join(' '),
    /500 changed lines \(threshold 200\)/,
  );
});

test('reviewDecision: a rename always counts — a refactor happened', () => {
  const d = reviewDecision(diff(['src/a.ts'], { renames: ['src/b.ts'] }));
  assert.equal(d.needed, true);
  assert.match(d.reasons.join(' '), /renamed\/moved/);
});

test('reviewDecision: a risk path needs review regardless of size', () => {
  const d = reviewDecision(diff(['src/billing/payments/charge.ts']), {
    riskPaths: ['src/**/payments/**'],
  });
  assert.equal(d.needed, true);
  assert.match(d.reasons.join(' '), /risk surface: src\/billing\/payments\/charge\.ts/);
});

test('reviewDecision: many risky files collapse into one reason with a remainder', () => {
  const files = ['a', 'b', 'c', 'd'].map((n) => `src/payments/${n}.ts`);
  const reason = reviewDecision(diff(files), { riskPaths: ['src/**/payments/**'] }).reasons.join(' ');
  assert.match(reason, /\(\+1\)/);
});

test('reviewDecision: docs-only and tests-only diffs skip unless a risk path hits', () => {
  assert.equal(reviewDecision(diff(['docs/a.md'], { lines: 500, renames: ['docs/b.md'] })).needed, false);
  assert.match(
    reviewDecision(diff(['docs/a.md'], { lines: 500 })).reasons.join(' '),
    /docs-only diff/,
  );
  assert.equal(
    reviewDecision(diff(['src/__tests__/a.test.ts'], { lines: 500 })).needed,
    false,
  );

  const risky = reviewDecision(diff(['.github/workflows/ci.yml']), {
    riskPaths: ['.github/workflows/**'],
  });
  assert.equal(risky.needed, true, 'a docs-only rule must not excuse CI configuration');
});

test('reviewDecision: mixed diffs are judged on the whole change', () => {
  const d = reviewDecision(diff(['docs/a.md', 'src/a.ts'], { lines: 200 }));
  assert.equal(d.needed, true);
});

/** Minimal git repo with two commits; returns the directory. */
function gitFixture(config = null) {
  const dir = mkdtempSync(path.join(tmpdir(), 'antislop-review-'));
  const git = (...args) =>
    spawnSync('git', ['-c', 'user.email=t@example.com', '-c', 'user.name=T', ...args], {
      cwd: dir,
      encoding: 'utf8',
    });
  assert.equal(git('init', '-q').status, 0);
  writeFileSync(path.join(dir, 'base.ts'), 'export const a = 1;\n');
  if (config) writeFileSync(path.join(dir, 'anti-slop.config.json'), JSON.stringify(config));
  assert.equal(git('add', '.').status, 0);
  assert.equal(git('commit', '-q', '-m', 'base').status, 0);

  writeFileSync(path.join(dir, 'base.ts'), 'export const a = 2;\n');
  writeFileSync(path.join(dir, 'added.ts'), 'export const b = 1;\n');
  assert.equal(git('add', '.').status, 0);
  assert.equal(git('commit', '-q', '-m', 'change').status, 0);
  return dir;
}

test('changedFiles: counts added/deleted lines from a real diff', () => {
  const dir = gitFixture();
  const original = process.cwd();
  try {
    process.chdir(dir);
    const parsed = changedFiles('HEAD~1');
    assert.deepEqual(parsed.files.map((f) => f.path).sort(), ['added.ts', 'base.ts']);
    // base.ts: 1 added + 1 deleted; added.ts: 1 added.
    assert.equal(parsed.lines, 3);
    assert.equal(parsed.renames.size, 0);
  } finally {
    process.chdir(original);
    rmSync(dir, { recursive: true, force: true });
  }
});

test('changedFiles: uncommitted work is part of the review scope', () => {
  const dir = gitFixture();
  const original = process.cwd();
  try {
    process.chdir(dir);
    writeFileSync(path.join(dir, 'uncommitted.ts'), 'export const c = 1;\n');
    const parsed = changedFiles('HEAD~1');
    assert.ok(
      parsed.files.some((f) => f.path === 'uncommitted.ts'),
      'a review that only sees pushed commits misses the work the agent just did',
    );
  } finally {
    process.chdir(original);
    rmSync(dir, { recursive: true, force: true });
  }
});

test('resolveBase: a local branch that is the current tip is not a base', () => {
  const dir = gitFixture();
  const original = process.cwd();
  try {
    process.chdir(dir);
    const head = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: dir, encoding: 'utf8' }).stdout.trim();
    const base = resolveBase(null);
    assert.notEqual(base, head, 'the repo default branch sitting at HEAD would diff to nothing');
    assert.match(base, /^[0-9a-f]{7,}$/);
  } finally {
    process.chdir(original);
    rmSync(dir, { recursive: true, force: true });
  }
});

test('resolveBase: explicit ref wins; an unusable repo falls back rather than throwing', () => {
  assert.equal(resolveBase('HEAD~3'), 'HEAD~3');
  const dir = mkdtempSync(path.join(tmpdir(), 'antislop-review-'));
  const original = process.cwd();
  try {
    process.chdir(dir); // no git repo at all, so no commits to diff against
    assert.equal(resolveBase(null), 'HEAD', 'an unborn repo yields an empty diff, not a crash');
  } finally {
    process.chdir(original);
    rmSync(dir, { recursive: true, force: true });
  }
});

const GATE = fileURLToPath(new URL('./review-scope.mjs', import.meta.url));

/** Run the CLI in `dir`; returns { status, stdout }. */
function runGate(dir) {
  const r = spawnSync(process.execPath, [GATE], { cwd: dir, encoding: 'utf8' });
  return { status: r.status, stdout: r.stdout, stderr: r.stderr };
}

test('review-scope: review.enabled false prints disabled and proposes nothing', () => {
  const dir = gitFixture({ review: { enabled: false, maxFiles: 2 } });
  try {
    const r = runGate(dir);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /\[review\] disabled/);
    assert.doesNotMatch(r.stdout, /\[review\] needed/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('review-scope: enabled with its own threshold proposes review with reasons', () => {
  const dir = gitFixture({ review: { maxFiles: 2 } });
  try {
    const r = runGate(dir);
    assert.equal(r.status, 0, 'the trigger never blocks');
    assert.match(r.stdout, /\[review\] needed/);
    assert.match(r.stdout, /2 files \(threshold 2\)/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
