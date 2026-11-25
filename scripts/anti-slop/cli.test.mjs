/**
 * Unit tests for CLI/config plumbing (cli.mjs). Zero dependencies — runs with
 * `node --test`. bootstrapGate's flag-to-key camelCasing and the
 * defaults < config < flags merge are contract tests: the gates' hooks call
 * the scripts bare, so the config file must govern them without flags.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

import {
  bootstrapGate, globToRegex, matchesAnyGlob, parseFlags, gateArgs, applyIgnorePaths,
} from './cli.mjs';
import {
  baselineGate, compareCounts, compareKindCounts, compareSets, loadBaseline, saveBaseline,
} from './baseline.mjs';

// --- parseFlags ----------------------------------------------------------------

test('parseFlags: string, number, and flag types', () => {
  const { values, positionals } = parseFlags(
    ['--src', 'lib', '--min-tokens', '30', '--report-only'],
    { '--src': 'string', '--min-tokens': 'number', '--report-only': 'flag' },
  );
  assert.equal(values['--src'], 'lib');
  assert.equal(values['--min-tokens'], 30);
  assert.equal(values['--report-only'], true);
  assert.deepEqual(positionals, []);
});

test('parseFlags: bare words land in positionals', () => {
  const { values, positionals } = parseFlags(['src/a.ts', 'src/b.ts'], {});
  assert.deepEqual(values, {});
  assert.deepEqual(positionals, ['src/a.ts', 'src/b.ts']);
});

test('parseFlags: missing value throws', () => {
  assert.throws(() => parseFlags(['--src'], { '--src': 'string' }), /Missing value/);
});

test('parseFlags: non-numeric number throws', () => {
  assert.throws(
    () => parseFlags(['--max-file-lines', 'abc'], { '--max-file-lines': 'number' }),
    /expects a number/,
  );
});

// --- bootstrapGate ----------------------------------------------------------------

const SPEC = {
  '--src': 'string', '--min-tokens': 'number', '--threshold': 'number',
  '--report-only': 'flag',
};

test('bootstrapGate: flags override defaults, keys camelCased', () => {
  const { args, positionals } = bootstrapGate(
    ['--min-tokens', '20'],
    {
      usage: 'usage',
      spec: SPEC,
      defaults: { src: 'src', minTokens: 50, threshold: 3, reportOnly: false },
    },
  );
  assert.equal(args.src, 'src');
  assert.equal(args.minTokens, 20);
  assert.equal(args.threshold, 3);
  assert.equal(args.reportOnly, false);
  assert.deepEqual(positionals, []);
});

test('bootstrapGate: config defaults flow through unchanged', () => {
  const { args } = bootstrapGate([], {
    usage: 'usage',
    spec: SPEC,
    defaults: { src: 'app', minTokens: 80, threshold: 5 },
  });
  assert.deepEqual(args, { src: 'app', minTokens: 80, threshold: 5, reportOnly: false });
});

test('bootstrapGate: --report-only becomes boolean true', () => {
  const { args } = bootstrapGate(['--report-only'], {
    usage: 'usage', spec: SPEC, defaults: { src: 'src', reportOnly: false },
  });
  assert.equal(args.reportOnly, true);
});

// --- glob matching -----------------------------------------------------------------

test('globToRegex: ** crosses directories, * stays within one', () => {
  assert.ok(globToRegex('collections/**').test('collections/AccessGrants.ts'));
  assert.ok(globToRegex('collections/**').test('collections/nested/Clients.ts'));
  assert.ok(!globToRegex('collections/**').test('src/collections/Clients.ts'));
  assert.ok(globToRegex('app/(payload)/**').test('app/(payload)/admin/page.tsx'));
  assert.ok(globToRegex('lib/*.ts').test('lib/date.ts'));
  assert.ok(!globToRegex('lib/*.ts').test('lib/deep/date.ts'));
  assert.ok(globToRegex('use?.ts').test('useA.ts'));
  assert.ok(!globToRegex('use?.ts').test('useAB.ts'));
  assert.ok(globToRegex('a.b.ts').test('a.b.ts'));
  assert.ok(!globToRegex('a.b.ts').test('axbts'));
});

test('matchesAnyGlob: empty list never matches', () => {
  assert.equal(matchesAnyGlob('anything.ts', []), false);
});

test('matchesAnyGlob: any of several globs', () => {
  assert.ok(matchesAnyGlob('x/y.ts', ['nothing/**', 'x/**']));
});

// --- applyIgnorePaths -----------------------------------------------------------

test('applyIgnorePaths: scan-root-relative globs match repo-relative staged files', async () => {
  // Regression for #18: git-hook staged mode passes repo-relative paths
  // (src/app/...); a config glob written scan-root-relative (app/...) must
  // still match, because tree-wide mode matches it that way.
  const dir = mkdtempSync(path.join(tmpdir(), 'antislop-ignore-'));
  try {
    const repo = path.join(dir, 'repo');
    const nested = path.join(repo, 'src', 'app', '(payload)');
    mkdirSync(nested, { recursive: true });
    const full = path.join(nested, 'importMap.js');
    writeFileSync(full, 'export default 1;');
    const files = [{ full, rel: 'src/app/payload/importMap.js' }];
    const kept = applyIgnorePaths(files, ['app/(payload)/**'], { src: path.join(repo, 'src') });
    assert.equal(kept.length, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('applyIgnorePaths: repo-relative globs match scan-root-relative rels', () => {
  // full path under the repo's src/, rel produced by a tree-wide walk
  const files = [{ full: 'src/collections/Users.ts', rel: 'collections/Users.ts' }];
  const kept = applyIgnorePaths(files, ['src/collections/**'], { src: 'src' });
  assert.equal(kept.length, 0);
});

test('applyIgnorePaths: no globs keeps everything silently', () => {
  const files = [{ full: 'a.ts', rel: 'a.ts' }];
  assert.equal(applyIgnorePaths(files, []).length, 1);
});

// --- baseline ratchet ------------------------------------------------------------

test('compareCounts: unseen file with duplication is new debt', () => {
  const { newDebt, improved } = compareCounts({ 'a.ts': 5 }, { 'b.ts': 3 });
  assert.deepEqual(newDebt, [{ rel: 'a.ts', count: 5, accepted: 0 }]);
  assert.deepEqual(improved, []);
});

test('compareCounts: growth beyond accepted is new; shrink is improvement', () => {
  const { newDebt, improved } = compareCounts(
    { 'a.ts': 8, 'b.ts': 1 },
    { 'a.ts': 5, 'b.ts': 3 },
  );
  assert.deepEqual(newDebt, [{ rel: 'a.ts', count: 8, accepted: 5 }]);
  assert.deepEqual(improved, [{ rel: 'b.ts', count: 1, accepted: 3 }]);
});

test('compareCounts: equal counts are neither', () => {
  const { newDebt, improved } = compareCounts({ 'a.ts': 5 }, { 'a.ts': 5 });
  assert.deepEqual(newDebt, []);
  assert.deepEqual(improved, []);
});

test('compareKindCounts: new kind on a baselined file is new debt', () => {
  const { newDebt } = compareKindCounts(
    { 'big.ts': { file: 1, function: 2 } },
    { 'big.ts': { file: 1, function: 0 } },
  );
  assert.deepEqual(newDebt, [{ rel: 'big.ts', kind: 'function', count: 2, accepted: 0 }]);
});

test('compareKindCounts: unseen file with any violation is new debt', () => {
  const { newDebt } = compareKindCounts({ 'new.ts': { file: 1 } }, {});
  assert.deepEqual(newDebt, [{ rel: 'new.ts', kind: 'file', count: 1, accepted: 0 }]);
});

test('compareSets: added and removed', () => {
  const { added, removed } = compareSets(['a~b', 'c~d'], ['a~b', 'e~f']);
  assert.deepEqual(added, ['c~d']);
  assert.deepEqual(removed, ['e~f']);
});

test('saveBaseline/loadBaseline: roundtrip with sorted keys', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'antislop-baseline-'));
  try {
    const file = path.join(dir, 'baseline.json');
    saveBaseline(file, { duplicates: { files: { 'b.ts': 2, 'a.ts': 1 }, totalDuplicatedLines: 3 } });
    const loaded = loadBaseline(file);
    assert.equal(loaded.duplicates.totalDuplicatedLines, 3);
    assert.deepEqual(Object.keys(loaded.duplicates.files), ['a.ts', 'b.ts']);
    const raw = readFileSync(file, 'utf8');
    assert.ok(raw.includes('_comment'));
    assert.ok(raw.includes('Ratchet baseline'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

const CLI_URL = new URL('./config.mjs', import.meta.url).href;

/** Run loadConfig() in a temp repo with the given config; return its stderr. */
function configWarning(config) {
  const dir = mkdtempSync(path.join(tmpdir(), 'antislop-cfg-'));
  writeFileSync(path.join(dir, 'anti-slop.config.json'), JSON.stringify(config));
  try {
    const run = spawnSync(
      process.execPath,
      ['--input-type=module', '-e', `import { loadConfig } from ${JSON.stringify(CLI_URL)}; loadConfig();`],
      { cwd: dir, encoding: 'utf8' },
    );
    return run.stderr;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('config: per-file budget overrides are rejected by name, not ignored silently', () => {
  const stderr = configWarning({ modularity: { fileLineOverrides: { 'src/chassis.ts': 4300 } } });
  assert.match(stderr, /modularity\.fileLineOverrides is not supported and is IGNORED/);
  assert.match(stderr, /the limit still applies to every file/);
  assert.match(stderr, /Decompose the file by responsibility/);
});

test('config: unknown keys inside a section warn (typo guard)', () => {
  const stderr = configWarning({ modularity: { maxFileLine: 400 } });
  assert.match(stderr, /unknown key "modularity\.maxFileLine"/);
});

test('config: known keys produce no warning', () => {
  const stderr = configWarning({
    modularity: { maxFileLines: 500, ignorePaths: ['src/generated/**'] },
  });
  assert.equal(stderr.trim(), '');
});

// --- baseline --update-baseline guard (relocated debt) -----------------------

function captureErrors(fn) {
  const original = console.error;
  const lines = [];
  console.error = (...args) => lines.push(args.join(' '));
  try {
    return { result: fn(), stderr: lines.join('\n') };
  } finally {
    console.error = original;
  }
}

/** Run a duplicates-style --update-baseline and report what landed on disk. */
function updateCase(snapshot, current, extraArgs = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), 'antislop-ratchet-'));
  const file = path.join(dir, 'anti-slop.baseline.json');
  if (snapshot) saveBaseline(file, snapshot);
  const { result, stderr } = captureErrors(() => baselineGate({
    args: { updateBaseline: true, baseline: file, ...extraArgs },
    section: 'duplicates',
    current,
    unit: 'duplicated line(s)',
  }));
  const written = loadBaseline(file);
  rmSync(dir, { recursive: true, force: true });
  return { decision: result, stderr, files: written?.duplicates?.files };
}

test('baseline: --update-baseline refuses to grow the total', () => {
  const { decision, stderr, files } = updateCase(
    { duplicates: { files: { 'a.ts': 10 } } },
    { 'a.ts': 12 },
  );
  assert.equal(decision, 'fail');
  assert.match(stderr, /Refusing to update the baseline/);
  assert.equal(files['a.ts'], 10, 'the baseline must not absorb new debt');
});

test('baseline: unchanged total with different files warns about relocation', () => {
  const { decision, stderr, files } = updateCase(
    { duplicates: { files: { 'a.ts': 10 } } },
    { 'b.ts': 10 },
  );
  assert.equal(decision, 'ok');
  assert.match(stderr, /total unchanged .* files changed/);
  assert.match(stderr, /relocated debt/);
  assert.equal(files['b.ts'], 10);
});

test('baseline: --force accepts growth deliberately', () => {
  const { decision, stderr, files } = updateCase(
    { duplicates: { files: { 'a.ts': 10 } } },
    { 'a.ts': 12 },
    { force: true },
  );
  assert.equal(decision, 'ok');
  assert.match(stderr, /Baseline grows 10 -> 12/);
  assert.equal(files['a.ts'], 12);
});

test('baseline: a genuine cleanup updates silently', () => {
  const { decision, stderr, files } = updateCase(
    { duplicates: { files: { 'a.ts': 10 } } },
    { 'a.ts': 6 },
  );
  assert.equal(decision, 'ok');
  assert.equal(stderr.trim(), '');
  assert.equal(files['a.ts'], 6);
});

test('baseline: first-time adoption writes without --force', () => {
  const { decision, stderr, files } = updateCase(null, { 'a.ts': 40 });
  assert.equal(decision, 'ok');
  assert.equal(stderr.trim(), '');
  assert.equal(files['a.ts'], 40);
});
