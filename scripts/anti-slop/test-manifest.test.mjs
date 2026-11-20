/**
 * Guards the `npm test` manifest itself. A *.test.mjs file that exists on disk
 * but is missing from package.json's test script is a silently skipped suite -
 * it passed review, it never ran. (Exactly this happened: check-encoding's
 * tests were orphaned for two releases because a script edit quietly did not
 * match.)
 *
 * Adopter repos receive these tests as reference but may not wire them into
 * their own `npm test`; there the guard skips instead of failing.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../..', import.meta.url)).replace(/[\\/]$/, '');

/** Test files in a scan dir, as repo-relative POSIX paths. */
function testFilesIn(dir) {
  return readdirSync(path.join(ROOT, dir))
    .filter((f) => f.endsWith('.test.mjs'))
    .map((f) => `${dir}/${f}`)
    .sort();
}

test('npm test runs every test file (no orphaned suites)', (t) => {
  const pkg = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  const declared = new Set(
    pkg.scripts.test.split(/\s+/).filter((part) => part.endsWith('.test.mjs')),
  );
  const onDisk = [...testFilesIn('scripts/anti-slop'), ...testFilesIn('presets')];

  if (declared.size === 0) {
    t.skip('this package does not run the gate suites in scripts.test');
    return;
  }

  const notRun = onDisk.filter((f) => !declared.has(f));
  assert.deepEqual(notRun, [], `test file(s) exist but are not in scripts.test: ${notRun.join(', ')}`);

  const missing = [...declared].filter((f) => !onDisk.includes(f));
  assert.deepEqual(missing, [], `scripts.test names file(s) that do not exist: ${missing.join(', ')}`);
});
