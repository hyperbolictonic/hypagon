#!/usr/bin/env node
/**
 * review-scope.mjs
 *
 * Deterministic trigger for independent code review. Review costs tokens, so
 * "should we review?" must not be a vibe: this compares the diff against two
 * objective conditions and prints the reasons.
 *
 *   size    - >= review.maxFiles files or >= review.maxLines changed lines,
 *             or a file was moved/renamed (a refactor happened)
 *   risk    - any changed path matches review.riskPaths (access, payments,
 *             migrations, env/config, CI, ...). Size does not matter here.
 *
 * Scope is the working tree, not pushed commits: uncommitted edits and untracked
 * files count, because that is what the agent just wrote.
 *
 * Skips docs-only and test-only diffs unless they hit a risk path.
 *
 * It NEVER blocks: advice only, exit 0. The review itself is a human decision
 * (see the code-reviewer agent and /review).
 *
 * Usage: node review-scope.mjs [--base <ref>] [--json]
 * Config: anti-slop.config.json "review" section (enabled, maxFiles, maxLines,
 *         riskPaths, autonomy).
 */

import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { matchesAnyGlob } from './cli.mjs';
import { loadConfig } from './config.mjs';

const isTest = (rel) => /(^|\/)(__tests__|__mocks__)\//.test(rel) ||
  /\.(test|spec|stories)\.[mc]?[tj]sx?$/.test(rel);

const isDocs = (rel) => /\.(md|mdx|txt|rst)$/i.test(rel) || /(^|\/)docs\//.test(rel);

/** Run git, returning stdout (empty string on failure). */
function git(args) {
  const res = spawnSync('git', args, { encoding: 'utf8' });
  return res.status === 0 ? res.stdout : '';
}

/** The merge-base with the mainline, falling back to the parent commit. */
export function resolveBase(explicit) {
  if (explicit) return explicit;
  const head = git(['rev-parse', 'HEAD']).trim();
  for (const candidate of ['origin/main', 'origin/master', 'main', 'master']) {
    const base = git(['merge-base', candidate, 'HEAD']).trim();
    // A local branch that IS the current tip produces an empty diff; that is
    // not a base, it is the absence of one.
    if (base && base !== head) return base;
  }
  const parent = git(['rev-parse', 'HEAD~1']).trim();
  if (parent) return parent;
  // Single-commit repo: review what changed since the root commit.
  return git(['rev-list', '--max-parents=0', 'HEAD']).trim() || 'HEAD';
}

/**
 * Changed files and line counts between base and the working tree (so
 * uncommitted work is reviewed, not just pushed commits).
 * Returns { files: [{ path, added, deleted, binary }], lines, renames }.
 */
export function changedFiles(base) {
  const numstat = git(['diff', '--numstat', '--find-renames', base]);
  const names = git(['diff', '--name-status', '--find-renames', base]);
  const renamed = new Set(
    names
      .split('\n')
      .filter((l) => l.startsWith('R'))
      .map((l) => l.split('\t').pop()),
  );

  const files = [];
  let lines = 0;
  for (const line of numstat.split('\n')) {
    if (!line.trim()) continue;
    const [added, deleted, rel] = line.split('\t');
    const binary = added === '-' || deleted === '-';
    const n = binary ? 0 : Number(added) + Number(deleted);
    lines += n;
    files.push({ path: rel, added: Number(added) || 0, deleted: Number(deleted) || 0, binary });
  }

  // `git diff` ignores untracked files, and a new module is exactly what a
  // refactor produces. Count them as fully added so a split cannot look small.
  for (const rel of git(['ls-files', '--others', '--exclude-standard']).split('\n').filter(Boolean)) {
    let text;
    try {
      text = readFileSync(path.resolve(rel), 'utf8');
    } catch {
      continue;
    }
    const binary = text.includes('\0');
    const added = binary ? 0 : text.split('\n').length - (text.endsWith('\n') || text === '' ? 1 : 0);
    lines += added;
    files.push({ path: rel, added, deleted: 0, binary });
  }

  return { files, lines, renames: renamed };
}

/** Decide whether a review is warranted. Pure: no printing, no exit. */
export function reviewDecision({ files, lines, renames }, cfg = {}) {
  const maxFiles = cfg.maxFiles ?? 5;
  const maxLines = cfg.maxLines ?? 200;
  const riskPaths = Array.isArray(cfg.riskPaths) ? cfg.riskPaths : [];
  const reasons = [];

  if (files.length === 0) return { needed: false, reasons: ['no changes against the base'] };
  if (lines >= maxLines) reasons.push(`${lines} changed lines (threshold ${maxLines})`);
  if (files.length >= maxFiles) reasons.push(`${files.length} files (threshold ${maxFiles})`);
  if (renames.size > 0) reasons.push(`${renames.size} renamed/moved file(s) - a refactor happened`);

  const risky = files.filter((f) => matchesAnyGlob(f.path, riskPaths)).map((f) => f.path);
  if (risky.length > 0) reasons.push(`risk surface: ${risky.slice(0, 3).join(', ')}${risky.length > 3 ? ` (+${risky.length - 3})` : ''}`);

  const onlyDocs = files.every((f) => isDocs(f.path));
  const onlyTests = files.every((f) => isTest(f.path));
  if ((onlyDocs || onlyTests) && risky.length === 0) {
    return { needed: false, reasons: [`${onlyDocs ? 'docs-only' : 'tests-only'} diff, no risk path`] };
  }

  return { needed: reasons.length > 0, reasons };
}

function main() {
  const argv = process.argv.slice(2);
  const json = argv.includes('--json');
  const baseFlagIdx = argv.indexOf('--base');
  const explicitBase = baseFlagIdx === -1 ? null : argv[baseFlagIdx + 1];

  const cfg = loadConfig().review ?? {};
  const base = resolveBase(explicitBase);
  const diff = changedFiles(base);
  const decision = reviewDecision(diff, cfg);
  const autonomy = cfg.autonomy === 'auto' ? 'auto' : 'ask';

  if (json) {
    console.log(JSON.stringify({ base, files: diff.files.length, lines: diff.lines, autonomy, ...decision }));
    return;
  }

  const summary = `${diff.files.length} file(s), ${diff.lines} changed line(s), base ${base.slice(0, 8)}`;

  // Disabled is a decision, not a skip: the repo may already have its own
  // review system, so say who turned it off instead of reporting a threshold.
  if (cfg.enabled === false) {
    console.log(`[review] disabled - ${summary}`);
    console.log('    The optional reviewer is off (review.enabled: false); the gates still run.');
    return;
  }
  if (decision.needed) {
    console.log(`[review] needed - ${summary}`);
    for (const reason of decision.reasons) console.log(`    ${reason}`);
    console.log(
      autonomy === 'auto'
        ? '    Mode: auto - run /review at the agreed cadence without asking again; stop on Reject.'
        : '    Mode: ask - propose /review to the user; it costs tokens, so they decide.',
    );
  } else {
    console.log(`[review] skip - ${summary}`);
    for (const reason of decision.reasons) console.log(`    ${reason}`);
  }
}

const isMain =
  process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) main();
