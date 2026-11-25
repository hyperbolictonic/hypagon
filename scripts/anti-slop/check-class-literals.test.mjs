/**
 * Tests for the design-system drift gate: normalisation, interpolation
 * stripping, thresholds, allow globs, report-only and the baseline ratchet.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { normaliseClassList, extractClassLiterals } from './check-class-literals.mjs';

const GATE = fileURLToPath(new URL('./check-class-literals.mjs', import.meta.url));

test('normaliseClassList: token order and whitespace do not matter', () => {
  assert.equal(normaliseClassList('card  card-border'), normaliseClassList('card-border card'));
  assert.equal(normaliseClassList(' a\tb\nc '), 'a b c');
});

test('normaliseClassList: template interpolations are stripped', () => {
  assert.equal(normaliseClassList('card ${active ? "on" : "off"} shadow'), 'card shadow');
});

test('extractClassLiterals: plain, braced and template forms; single tokens ignored', () => {
  const src = [
    'const a = <div className="card card-border" />',
    "const b = <div className='block font-bold' />",
    'const c = <div className={"badge badge-sm"} />',
    'const d = <div className={`card ${x} card-border`} />',
    'const e = <div className="flex" />', // one token: not a skeleton
  ].join('\n');
  const found = extractClassLiterals(src);
  assert.deepEqual(found.map((f) => f.value), [
    'card card-border',
    'block font-bold',
    'badge badge-sm',
    'card card-border',
  ]);
});

/** Temp repo with `count` files repeating one literal. */
function fixture(count, literal = 'card card-border', dir = 'src/components') {
  const root = mkdtempSync(path.join(tmpdir(), 'antislop-class-'));
  mkdirSync(path.join(root, dir), { recursive: true });
  for (let i = 0; i < count; i++) {
    writeFileSync(
      path.join(root, dir, `C${i}.tsx`),
      `export const C${i} = () => <div className="${literal}" />\n`,
    );
  }
  return root;
}

function run(root, args = []) {
  return spawnSync(process.execPath, [GATE, ...args], { cwd: root, encoding: 'utf8' });
}

test('gate: four repetitions fail, three pass', () => {
  const four = fixture(4);
  const fail = run(four);
  assert.equal(fail.status, 1, fail.stderr);
  assert.match(fail.stdout, /4x {2}card card-border/);
  rmSync(four, { recursive: true, force: true });

  const three = fixture(3);
  const pass = run(three);
  assert.equal(pass.status, 0, pass.stderr);
  assert.match(pass.stdout, /\[ok\] No className literal repeats/);
  rmSync(three, { recursive: true, force: true });
});

test('gate: token order does not let a literal hide', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'antislop-class-'));
  mkdirSync(path.join(root, 'src'), { recursive: true });
  const spellings = ['card card-border', 'card-border card', 'card  card-border', 'card-border  card'];
  spellings.forEach((literal, i) => {
    writeFileSync(path.join(root, 'src', `C${i}.tsx`), `<div className="${literal}" />\n`);
  });
  const r = run(root);
  assert.equal(r.status, 1, r.stderr);
  assert.match(r.stdout, /4x {2}card card-border/);
  rmSync(root, { recursive: true, force: true });
});

test('gate: allow globs exempt the modules that own the literal', () => {
  const root = fixture(4, 'card card-border', 'src/components/ui');
  writeFileSync(
    path.join(root, 'anti-slop.config.json'),
    JSON.stringify({ classLiterals: { allow: ['components/ui/**'] } }),
  );
  const r = run(root);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /classLiterals\.allow/);
  rmSync(root, { recursive: true, force: true });
});

test('gate: --report-only prints but exits 0', () => {
  const root = fixture(4);
  const r = run(root, ['--report-only']);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /4x {2}card card-border/);
  rmSync(root, { recursive: true, force: true });
});

test('gate: a repo with no JSX sources is inert, not a crash', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'antislop-class-'));
  const r = run(root);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /INERT/);
  rmSync(root, { recursive: true, force: true });
});

test('gate: baseline ratchet fails on new repetition and ignores a shrink', () => {
  const root = fixture(4);
  assert.equal(run(root, ['--update-baseline']).status, 0);

  writeFileSync(path.join(root, 'src', 'components', 'Extra.tsx'), '<div className="card card-border" />\n');
  const grown = run(root);
  assert.equal(grown.status, 1);
  assert.match(grown.stderr, /NEW occurrence\(s\) beyond baseline/);
  rmSync(path.join(root, 'src', 'components', 'Extra.tsx'));

  const shrunk = run(root);
  assert.equal(shrunk.status, 0, shrunk.stderr);
  rmSync(root, { recursive: true, force: true });
});
