/**
 * Release guard: everything the installer loads at runtime must be in the
 * published tarball. `files` in package.json is an allowlist, and a missing
 * entry fails only after publish — v0.1.7 through v0.1.12 shipped without
 * `presets/`, so `npx opencode-anti-slop` died on
 * `import './presets/resolve.mjs'` for every consumer while every local test
 * passed.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../..', import.meta.url)).replace(/[\\/]$/, '');
const pkg = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8'));

/** Paths install.mjs (and the presets it resolves) must find after install. */
const RUNTIME_FILES = [
  'install.mjs',
  'presets/resolve.mjs',
  'presets/default/manifest.json',
  'templates/anti-slop-ci.yml',
  '.opencode/skills/modular-architecture/SKILL.md',
  'scripts/anti-slop/config.mjs',
];

/** True when a `files` entry ships the given repo-relative path. */
function shipped(rel) {
  return (pkg.files ?? []).some((entry) => {
    const norm = entry.replace(/\\/g, '/').replace(/\/$/, '');
    return rel === norm || rel.startsWith(`${norm}/`);
  });
}

test('package files: every runtime dependency of the installer is shipped', () => {
  for (const rel of RUNTIME_FILES) {
    assert.ok(existsSync(path.join(ROOT, rel)), `${rel} does not exist`);
    assert.ok(shipped(rel), `${rel} exists but is NOT in package.json "files" — npx install would crash`);
  }
});

test('package files: the installer itself and the bin are shipped', () => {
  assert.equal(pkg.bin, 'install.mjs');
  assert.ok(shipped(pkg.bin), 'bin target is not shipped');
});

test('installer: --help exits 0 (a missing import must not reach users)', () => {
  const run = spawnSync(process.execPath, [path.join(ROOT, 'install.mjs'), '--help'], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stdout, /Usage: npx/);
  assert.match(run.stdout, /available: default/);
});
