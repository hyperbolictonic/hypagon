/**
 * Unit tests for the shared scanning helpers (lib.mjs). Zero dependencies —
 * runs with `node --test`. The jsdocBefore cases are regression tests for a
 * real failure: a `$`-anchored lazy regex attached the file's FIRST docblock
 * to every export, and the gate could not notice (it only required a non-null
 * first line). If you "simplify" jsdocBackfore back into a one-line regex,
 * these tests are the ones that will catch it.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  extractExports,
  isGenerated,
  jsdocBefore,
  lineOf,
  stripNoise,
  tokenize,
  walk,
} from './lib.mjs';

// --- jsdocBefore -------------------------------------------------------------

test('jsdocBefore: attached block supplies its first line', () => {
  const src = '/** Formats dates for tables. */\nexport function f() {}';
  const idx = src.indexOf('export');
  assert.equal(jsdocBefore(src, idx), 'Formats dates for tables.');
});

test('jsdocBefore: multi-line block, first meaningful line wins', () => {
  const src = [
    '/**',
    ' * Renders the standard page shell.',
    ' * @param props - ignored',
    ' */',
    'export function f() {}',
  ].join('\n');
  const idx = src.indexOf('export');
  assert.equal(jsdocBefore(src, idx), 'Renders the standard page shell.');
});

test('jsdocBefore: one-line block must not leak its terminator', () => {
  const src = '/** doc */ export const x = 1';
  const idx = src.indexOf('export');
  const desc = jsdocBefore(src, idx);
  assert.ok(!desc.includes('*/'), `terminator leaked: ${desc}`);
});

test('jsdocBefore: nearest of several blocks wins (regression: first-block bug)', () => {
  const src = [
    '/** Module header. */',
    'export const a = 1;',
    '/** Second helper. */',
    'export const b = 2;',
  ].join('\n');
  const idxA = src.indexOf('export const a');
  const idxB = src.indexOf('export const b');
  assert.equal(jsdocBefore(src, idxA), 'Module header.');
  assert.equal(jsdocBefore(src, idxB), 'Second helper.');
});

test('jsdocBefore: code between block and export means undocumented', () => {
  const src = '/** Module header. */\nconst internal = 1;\nexport function f() {}';
  const idx = src.indexOf('export');
  assert.equal(jsdocBefore(src, idx), null);
});

test('jsdocBefore: blank lines between block and export are allowed', () => {
  const src = '/** Doc. */\n\n\nexport const x = 1';
  const idx = src.indexOf('export');
  assert.equal(jsdocBefore(src, idx), 'Doc.');
});

test('jsdocBefore: tag-only block is not a usage doc', () => {
  const src = '/** @internal */\nexport const x = 1';
  const idx = src.indexOf('export');
  assert.equal(jsdocBefore(src, idx), null);
});

test('jsdocBefore: no block at all -> null', () => {
  assert.equal(jsdocBefore('export const x = 1', 0), null);
});

// --- extractExports -----------------------------------------------------------

test('extractExports: classifies functions, consts, classes, types, default', () => {
  const src = [
    'export async function doThing() {}',
    'export const handler = () => 1;',
    'export const LIMIT = 3;',
    'export class Repo {}',
    'export type Shape = { a: number };',
    'export interface Person { id: number }',
    'export default config;',
  ].join('\n');
  const byName = new Map(extractExports(src).map((e) => [e.name, e]));
  assert.equal(byName.get('doThing').kind, 'function');
  assert.equal(byName.get('handler').kind, 'function');
  assert.equal(byName.get('LIMIT').kind, 'value');
  assert.equal(byName.get('Repo').kind, 'class');
  assert.equal(byName.get('Shape').kind, 'type');
  assert.equal(byName.get('Person').kind, 'type');
  assert.equal(byName.get('default').kind, 'default');
});

test('extractExports: attached docs flow through', () => {
  const src = '/** Doubles a value. */\nexport function double(x: number) { return x * 2; }';
  const [e] = extractExports(src);
  assert.equal(e.desc, 'Doubles a value.');
});

// --- stripNoise / tokenize / lineOf -------------------------------------------

test('stripNoise: removes comments, blanks strings, preserves newlines', () => {
  const src = [
    '// line comment',
    'const a = "two', // inside string newline
    'words";',
    '/* block',
    'comment */',
    'const b = 1;',
  ].join('\n');
  const out = stripNoise(src);
  assert.ok(!out.includes('line comment'));
  assert.ok(!out.includes('block'));
  assert.equal(out.split('\n').length, src.split('\n').length);
  assert.ok(out.includes('const b = 1;'));
});

test('tokenize: strings and numbers normalized, lines tracked', () => {
  const stripped = 'const msg = "hello";\nconst n = 42;';
  const tokens = tokenize(stripped);
  const values = tokens.map((t) => t.t);
  assert.deepEqual(values, ['const', 'msg', '=', '<str>', ';', 'const', 'n', '=', '<num>', ';']);
  const numLine = tokens.find((t) => t.t === '<num>').line;
  assert.equal(numLine, 2);
});

test('lineOf: char index to 1-based line', () => {
  const s = 'one\ntwo\nthree';
  assert.equal(lineOf(s, 0), 1);
  assert.equal(lineOf(s, 5), 2);
  assert.equal(lineOf(s, 9), 3);
});

// --- walk / isGenerated ---------------------------------------------------------

test('walk: skips excluded dirs, tests, generated files, and is OS-stable (sorted)', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'antislop-walk-'));
  try {
    mkdirSync(path.join(root, 'components'), { recursive: true });
    mkdirSync(path.join(root, 'node_modules', 'pkg'), { recursive: true });
    mkdirSync(path.join(root, 'dist'), { recursive: true });
    mkdirSync(path.join(root, 'aardvark'), { recursive: true });
    // Written deliberately out of alphabetical order: walk() must sort, or
    // generated indexes differ between filesystems (regression for #20).
    writeFileSync(path.join(root, 'components', 'Zebra.tsx'), 'export const Zebra = 1;');
    writeFileSync(path.join(root, 'components', 'Apple.tsx'), 'export const Apple = 1;');
    writeFileSync(path.join(root, 'zz.ts'), 'export const zz = 1;');
    writeFileSync(path.join(root, 'aardvark', 'first.ts'), 'export const first = 1;');
    writeFileSync(path.join(root, 'components', 'Card.test.tsx'), 'export const t = 1;');
    writeFileSync(path.join(root, 'components', 'util.test.mjs'), 'export const u = 1;');
    writeFileSync(path.join(root, 'payload-types.ts'), 'export type X = 1;');
    writeFileSync(path.join(root, 'node_modules', 'pkg', 'index.js'), 'module.exports = 1;');
    writeFileSync(path.join(root, 'dist', 'out.js'), 'export const o = 1;');

    const rels = walk(root, root).map((f) => f.rel);
    assert.deepEqual(rels, [
      'aardvark/first.ts',
      'components/Apple.tsx',
      'components/Zebra.tsx',
      'zz.ts',
    ]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('isGenerated: payload-types and next-env, nothing else', () => {
  assert.ok(isGenerated('payload-types.ts'));
  assert.ok(isGenerated('src/app/payload-types.ts'));
  assert.ok(isGenerated('next-env.d.ts'));
  assert.ok(!isGenerated('src/lib/dbs.ts'));
  assert.ok(!isGenerated('types.ts'));
});
