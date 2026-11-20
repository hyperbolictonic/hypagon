/**
 * Unit tests for run-project-checks.mjs helpers: package-manager detection
 * from lockfiles and the per-manager tsc fallback command (regression for
 * #19, where the npx-only --no-install flag was passed to pnpm/yarn).
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { detectPackageManager, typecheckCommand } from './run-project-checks.mjs';

function repoWith(lockfile) {
  const dir = mkdtempSync(path.join(tmpdir(), 'antislop-pm-'));
  if (lockfile) writeFileSync(path.join(dir, lockfile), '');
  return dir;
}

test('detectPackageManager: lockfile decides', () => {
  const pnpm = repoWith('pnpm-lock.yaml');
  const yarn = repoWith('yarn.lock');
  const bun = repoWith('bun.lockb');
  const npm = repoWith(null);
  try {
    assert.equal(detectPackageManager(pnpm), 'pnpm');
    assert.equal(detectPackageManager(yarn), 'yarn');
    assert.equal(detectPackageManager(bun), 'bun');
    assert.equal(detectPackageManager(npm), 'npm');
  } finally {
    for (const d of [pnpm, yarn, bun, npm]) rmSync(d, { recursive: true, force: true });
  }
});

test('detectPackageManager: bun.lock (text) also detected', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'antislop-pm-'));
  try {
    writeFileSync(path.join(dir, 'bun.lock'), '');
    assert.equal(detectPackageManager(dir), 'bun');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('typecheckCommand: per-manager invocation, no foreign flags', () => {
  assert.deepEqual(typecheckCommand('npm'), ['npx', ['--no-install', 'tsc', '--noEmit']]);
  assert.deepEqual(typecheckCommand('pnpm'), ['pnpm', ['exec', 'tsc', '--noEmit']]);
  assert.deepEqual(typecheckCommand('yarn'), ['yarn', ['tsc', '--noEmit']]);
  assert.deepEqual(typecheckCommand('bun'), ['bunx', ['tsc', '--noEmit']]);
});

test('typecheckCommand: --no-install never reaches pnpm/yarn/bun', () => {
  for (const pm of ['pnpm', 'yarn', 'bun']) {
    const [cmd, args] = typecheckCommand(pm);
    const all = [cmd, ...args].join(' ');
    assert.ok(!all.includes('--no-install'), `${pm} got the npx-only flag: ${all}`);
  }
});

test('detectPackageManager: prefers the lockfile that exists', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'antislop-pm-'));
  try {
    // package-lock present first, pnpm added second — pnpm wins (most specific
    // local manager choice; matches documented detection order).
    writeFileSync(path.join(dir, 'package-lock.json'), '');
    writeFileSync(path.join(dir, 'pnpm-lock.yaml'), '');
    assert.equal(detectPackageManager(dir), 'pnpm');
    assert.ok(existsSync(path.join(dir, 'package-lock.json')));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('repoWith helper sanity: fixture dirs exist', () => {
  const dir = repoWith(null);
  try {
    assert.ok(existsSync(dir));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
