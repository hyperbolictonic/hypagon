#!/usr/bin/env node
/**
 * run-project-checks.mjs — pre-push project checks, without silent skips.
 *
 * Runs the repo's own lint/typecheck/test scripts with the package manager
 * detected from the lockfile, and:
 *   - prints every check as present or skipped, so "nothing ran" is visible;
 *   - falls back to `tsc --noEmit` when there is no typecheck script but a
 *     tsconfig.json exists (a TypeScript repo must not pass untypechecked);
 *   - works with npm, pnpm, yarn and bun.
 *
 * Zero dependencies. Exits non-zero on the first failing check.
 */

import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

/** Detect the package manager from the lockfile present in `dir`. */
export function detectPackageManager(dir = process.cwd()) {
  if (existsSync(path.join(dir, 'pnpm-lock.yaml'))) return 'pnpm';
  if (existsSync(path.join(dir, 'yarn.lock'))) return 'yarn';
  if (existsSync(path.join(dir, 'bun.lockb')) || existsSync(path.join(dir, 'bun.lock'))) return 'bun';
  return 'npm';
}

/**
 * The local-binary execution for `tsc --noEmit`, per package manager.
 * `--no-install` is npx-only — passing it to pnpm/yarn fails the run
 * (regression for #19), so each manager gets its own invocation:
 *   npm  -> npx --no-install tsc --noEmit
 *   pnpm -> pnpm exec tsc --noEmit
 *   yarn -> yarn tsc --noEmit
 *   bun  -> bunx tsc --noEmit
 */
export function typecheckCommand(pm) {
  switch (pm) {
    case 'pnpm': return ['pnpm', ['exec', 'tsc', '--noEmit']];
    case 'yarn': return ['yarn', ['tsc', '--noEmit']];
    case 'bun': return ['bunx', ['tsc', '--noEmit']];
    case 'npm':
    default: return ['npx', ['--no-install', 'tsc', '--noEmit']];
  }
}

const cwd = process.cwd();
const pkg = JSON.parse(readFileSync(path.join(cwd, 'package.json'), 'utf8'));
const scripts = pkg.scripts ?? {};
const pm = detectPackageManager();
const run = (cmd, args) => spawnSync(cmd, args, { stdio: 'inherit', shell: process.platform === 'win32' });

/** Run `<pm> run <script>` when it exists. Returns 'ran' | 'skipped'. */
function runScript(name) {
  if (!scripts[name]) {
    console.log(`[skip] ${name}: no "${name}" script in package.json`);
    return 'skipped';
  }
  console.log(`[run] ${name} (${pm} run ${name})`);
  const res = run(pm, ['run', name]);
  if (res.status !== 0) {
    console.error(`\n[x] "${name}" failed (exit ${res.status ?? 'signal'}).`);
    process.exit(res.status ?? 1);
  }
  return 'ran';
}

/** tsc --noEmit fallback for TypeScript repos without a typecheck script. */
function runTypecheck() {
  if (scripts.typecheck) return runScript('typecheck');

  const hasTs = existsSync(path.join(cwd, 'tsconfig.json')) ||
    scripts.typescript !== undefined ||
    (pkg.devDependencies && pkg.devDependencies.typescript);
  if (!hasTs) {
    console.log('[skip] typecheck: no typecheck script and no TypeScript setup detected');
    return 'skipped';
  }
  const [cmd, tscArgs] = typecheckCommand(pm);
  console.log(`[run] typecheck (fallback: ${cmd} ${tscArgs.join(' ')} — no "typecheck" script was found)`);
  const res = run(cmd, tscArgs);
  if (res.status !== 0) {
    console.error(`\n[x] typecheck failed (exit ${res.status ?? 'signal'}).`);
    process.exit(res.status ?? 1);
  }
  return 'ran';
}

/** Run all project checks; called only when the script is the entrypoint. */
function main() {
  console.log(`[anti-slop] project checks via ${pm}`);
  runScript('lint');
  runTypecheck();
  runScript('test');
  console.log('[ok] project checks done.');
}

const isMain =
  process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) main();
