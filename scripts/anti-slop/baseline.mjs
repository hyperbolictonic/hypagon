/**
 * baseline.mjs — the ratchet: gates fail only on violations NEWER than the
 * committed `anti-slop.baseline.json` snapshot, so adopting a repo with legacy
 * debt does not require a big-bang cleanup. Counts must only go down; growing
 * a file's count beyond its baseline (or introducing a new file with debt) is
 * a failure. Shrinking is always allowed, with a hint to re-snapshot.
 *
 * Zero dependencies (Node >= 18, ESM). Used by check-duplicates (per-file
 * duplicated-line counts), check-modularity (per-file/per-kind violation
 * counts), check-docs (per-file undocumented-export counts), and
 * check-imports (cycle identity sets — deny-rule violations are never
 * baselined, since rules are declared deliberately).
 */

import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import path from 'node:path';

/** Default baseline path: gates auto-ratchet when this file exists at the repo root. */
export const BASELINE_FILE = 'anti-slop.baseline.json';
const BASELINE_COMMENT =
  'Ratchet baseline: gates fail only on violations newer than this snapshot. ' +
  'Shrink it after cleanup with <gate> --update-baseline; do not grow it to absorb new debt.';

/** Load a baseline snapshot; null when the file is absent, warn+null when unparsable. */
export function loadBaseline(file = BASELINE_FILE) {
  const abs = path.resolve(file);
  if (!existsSync(abs)) return null;
  try {
    return JSON.parse(readFileSync(abs, 'utf8'));
  } catch (err) {
    console.error(`[warn] Could not parse baseline ${file} (${err.message}); running without baseline.`);
    return null;
  }
}

/** Write a baseline snapshot with sorted keys so diffs stay stable. Merges with
 * an existing file per top-level section, so each gate's --update-baseline
 * only refreshes its own section instead of clobbering the others. */
export function saveBaseline(file, snapshot) {
  const abs = path.resolve(file);
  let existing = {};
  if (existsSync(abs)) {
    try {
      existing = JSON.parse(readFileSync(abs, 'utf8')) ?? {};
    } catch {
      existing = {}; // unparsable baseline gets replaced wholesale
    }
  }
  const merged = sortDeep({ ...existing, ...sortDeep(snapshot), _comment: BASELINE_COMMENT });
  const out = `${JSON.stringify(merged, null, 2)}\n`;
  writeFileSync(abs, out);
}

function sortDeep(value) {
  if (Array.isArray(value)) return value.map(sortDeep);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => [k, sortDeep(v)]),
    );
  }
  return value;
}

/** Compare per-file counts against a baseline { rel: count }. New = file unseen or count grew. */
export function compareCounts(current, baselineFiles) {
  const base = baselineFiles ?? {};
  const newDebt = [];
  const improved = [];
  for (const [rel, count] of Object.entries(current)) {
    const accepted = base[rel];
    if (accepted === undefined) {
      if (count > 0) newDebt.push({ rel, count, accepted: 0 });
      continue;
    }
    if (count > accepted) newDebt.push({ rel, count, accepted });
    else if (count < accepted) improved.push({ rel, count, accepted });
  }
  return { newDebt, improved };
}

/** Compare per-file/per-kind counts against a baseline { rel: { kind: count } }. */
export function compareKindCounts(current, baselineFiles) {
  const base = baselineFiles ?? {};
  const newDebt = [];
  const improved = [];
  for (const [rel, kinds] of Object.entries(current)) {
    const accepted = base[rel] ?? {};
    for (const [kind, count] of Object.entries(kinds)) {
      if (count > (accepted[kind] ?? 0)) newDebt.push({ rel, kind, count, accepted: accepted[kind] ?? 0 });
      else if (count < (accepted[kind] ?? 0)) improved.push({ rel, kind, count, accepted: accepted[kind] ?? 0 });
    }
  }
  return { newDebt, improved };
}

/** Compare an identity set (e.g. cycle keys) against a baseline array. */
export function compareSets(current, baselineItems) {
  const base = new Set(baselineItems ?? []);
  const added = current.filter((k) => !base.has(k));
  const removed = (baselineItems ?? []).filter((k) => !current.includes(k));
  return { added, removed };
}

/** Total of a per-file map: numbers, or per-kind objects when kindCounts. */
function sectionTotal(files, kindCounts) {
  return Object.values(files ?? {}).reduce(
    (n, v) => n + (kindCounts ? Object.values(v ?? {}).reduce((a, b) => a + b, 0) : v),
    0,
  );
}

/**
 * Shared ratchet flow for count-based gates (duplicates/docs/modularity).
 *
 * - `--update-baseline`: writes `{ [section]: { files: current, ...extra } }`
 *   and returns 'ok' (exit 0 in the gate). It refuses to grow the total
 *   (`total` may only fall or stay level) unless `--force` is passed, and warns
 *   when the total is unchanged but the file set moved — that is relocated
 *   debt, not a cleanup.
 * - baseline file exists: fails only on NEW debt (unseen file or grown count)
 *   and returns 'fail'; otherwise 'ok' with an --update-baseline hint when
 *   files improved.
 * - no baseline: returns 'none' so the gate falls through to its own gate logic.
 *
 * `kindCounts` compares `{ rel: { kind: count } }` instead of `{ rel: count }`.
 */
export function baselineGate({ args, section, current, kindCounts = false, extra = {}, unit, showKind = false, fixLine }) {
  if (args.updateBaseline) {
    const file = args.baseline ?? BASELINE_FILE;
    const total = sectionTotal(current, kindCounts);
    const previous = loadBaseline(args.baseline)?.[section];

    if (previous?.files) {
      const oldTotal = sectionTotal(previous.files, kindCounts);
      const moved =
        Object.keys(previous.files).sort().join('\n') !== Object.keys(current).sort().join('\n');

      if (total > oldTotal) {
        if (!args.force) {
          console.error(
            `[x] Refusing to update the baseline: ${section} would grow ${oldTotal} -> ${total} ${unit}.\n` +
            '    The baseline records accepted debt; it must not absorb new debt.\n' +
            '    Fix the new debt first. To accept it deliberately, re-run with --force.'
          );
          return 'fail';
        }
        console.error(`[warn] Baseline grows ${oldTotal} -> ${total} ${unit} (--force accepted).`);
      } else if (total === oldTotal && moved) {
        console.error(
          `[warn] ${section} total unchanged (${total} ${unit}) but the files changed - ` +
          'this looks like relocated debt (A -> B). The debt still exists; fix the move, not the baseline.'
        );
      }
    }

    saveBaseline(file, { [section]: { files: current, ...extra } });
    console.log(`[ok] Baseline written to ${file} (${total} ${unit} across ${Object.keys(current).length} file(s)).`);
    console.log('    Commit it. The gate now fails only on NEW debt; shrink the baseline as you clean up.');
    return 'ok';
  }
  const baseline = loadBaseline(args.baseline);
  if (!baseline?.[section]) return 'none';
  const { newDebt, improved } = kindCounts
    ? compareKindCounts(current, baseline[section].files)
    : compareCounts(current, baseline[section].files);
  if (newDebt.length === 0) {
    console.log(`[ok] ${section} check passed within baseline (0 new${improved.length > 0 ? ' — consider --update-baseline to lock in the cleanup' : ''}).`);
    return 'ok';
  }
  console.error(`[x] NEW ${unit} beyond baseline (${newDebt.length} file(s)):`);
  for (const d of newDebt.slice(0, 20)) {
    console.error(showKind
      ? `    ${d.rel}: [${d.kind}] count ${d.count} (accepted: ${d.accepted})`
      : `    ${d.rel}: ${d.count} ${unit} (accepted: ${d.accepted})`);
  }
  console.error(
    `    ${fixLine}\n` +
    '    The baseline records accepted debt — do NOT update it to absorb new debt.'
  );
  return 'fail';
}
