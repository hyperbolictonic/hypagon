#!/usr/bin/env node
/**
 * install-hooks.mjs — wire the anti-slop gates into git hooks of a repo.
 *
 *   pre-commit : checks ONLY staged JS/TS files with check-modularity
 *                (blocking) + reports duplicates (non-blocking). Fast, and
 *                never blocked by legacy code.
 *   pre-push   : full duplicates + imports + encoding + docs-link gates
 *                (blocking) + lint/typecheck/test via `npm run <script>
 *                --if-present`.
 *
 * Run from the target repo root:  node scripts/anti-slop/install-hooks.mjs [--force]
 * Existing hooks are never overwritten without --force.
 */

import { existsSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';

const force = process.argv.includes('--force');
const preCommitOnly = process.argv.includes('--pre-commit-only');
if (process.argv.includes('-h') || process.argv.includes('--help')) {
  console.log('Usage: node scripts/anti-slop/install-hooks.mjs [--force] [--pre-commit-only]');
  console.log('  --pre-commit-only: skip the pre-push gate. Use when legacy duplication or');
  console.log('  size violations exist repo-wide — pre-push would block every push until');
  console.log('  the cleanup lands. Install the full pair once the gates pass.');
  process.exit(0);
}

const cwd = process.cwd();
const gitDir = existsSync(path.join(cwd, '.git')) ? path.join(cwd, '.git') : null;

if (!gitDir) {
  console.error('No .git directory here. Run from the root of a git repository.');
  process.exit(1);
}

const hooksDir = path.join(gitDir, 'hooks');
mkdirSync(hooksDir, { recursive: true });

const PRE_COMMIT = `#!/bin/sh
# anti-slop pre-commit gate (installed by scripts/anti-slop/install-hooks.mjs)
staged=$(git diff --cached --name-only --diff-filter=ACMR | grep -E '\\.(ts|tsx|js|jsx|mjs|mts)$' | grep -v '^scripts/anti-slop/')
[ -z "$staged" ] && exit 0

echo "[anti-slop] modularity check on staged files..."
# shellcheck disable=SC2086
node scripts/anti-slop/check-modularity.mjs $staged || exit 1

echo "[anti-slop] docs check on staged files..."
# shellcheck disable=SC2086
node scripts/anti-slop/check-docs.mjs $staged || exit 1

echo "[anti-slop] import-boundary report (non-blocking; cycles are tree-wide)..."
node scripts/anti-slop/check-imports.mjs --report-only || true

echo "[anti-slop] duplicate-code report (non-blocking; sensitivity from anti-slop.config.json):"
node scripts/anti-slop/check-duplicates.mjs --threshold 0 --summary || true

exit 0
`;

const PRE_PUSH = `#!/bin/sh
# anti-slop pre-push gate (installed by scripts/anti-slop/install-hooks.mjs)
echo "[anti-slop] duplicate-code gate..."
node scripts/anti-slop/check-duplicates.mjs || exit 1

echo "[anti-slop] import-boundary gate..."
node scripts/anti-slop/check-imports.mjs || exit 1

echo "[anti-slop] encoding gate (mojibake / BOM / corrupt markers)..."
node scripts/anti-slop/check-encoding.mjs || exit 1

echo "[anti-slop] docs link gate (broken links, anchors, local-disk references)..."
node scripts/anti-slop/check-docs-links.mjs || exit 1

echo "[anti-slop] class-literal drift gate (re-spelled layout skeletons)..."
node scripts/anti-slop/check-class-literals.mjs || exit 1

echo "[anti-slop] project checks (lint/typecheck/test; skips are printed, not hidden)..."
node scripts/anti-slop/run-project-checks.mjs || exit 1

exit 0
`;

const writeHook = (name, body) => {
  const dest = path.join(hooksDir, name);
  if (existsSync(dest) && !force) {
    console.error(`[skip] ${name} already exists (use --force to overwrite)`);
    return;
  }
  writeFileSync(dest, body, { mode: 0o755 });
  console.log(`[ok] wrote ${path.relative(cwd, dest)}`);
};

writeHook('pre-commit', PRE_COMMIT);
if (preCommitOnly) {
  console.log('[skip] pre-push (--pre-commit-only)');
} else {
  writeHook('pre-push', PRE_PUSH);
}

console.log(`
Notes:
- Hooks require core.hooksPath to be unset (default). Verify: git config core.hooksPath
- Pre-commit only checks staged files, so pre-existing violations elsewhere do not block.
- To bypass once in an emergency: git commit --no-verify (use sparingly; it defeats the gate).
`);
