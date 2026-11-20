/**
 * Unit tests for the import-boundary gate's graph logic (check-imports.mjs).
 * The script guards its CLI behind an isMain check so these can import it.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { buildImportGraph, findCycles, resolveSpecifier } from './check-imports.mjs';

function fixture(files) {
  const root = mkdtempSync(path.join(tmpdir(), 'antislop-imports-'));
  for (const [rel, content] of Object.entries(files)) {
    const full = path.join(root, rel);
    mkdirSync(path.dirname(full), { recursive: true });
    writeFileSync(full, content);
  }
  return root;
}

test('resolveSpecifier: probes extensions and index files', () => {
  const root = fixture({
    'lib/date.ts': 'export const d = 1;',
    'lib/util.ts': 'export const u = 1;',
    'lib/legacy.mjs': 'export const l = 1;',
    'lib/store/index.ts': 'export const s = 1;',
  });
  const from = path.join(root, 'lib', 'date.ts');
  assert.equal(resolveSpecifier(from, './util', root), 'lib/util.ts');
  // TS convention: a .js specifier may point at a .ts file
  assert.equal(resolveSpecifier(from, './util.js', root), 'lib/util.ts');
  assert.equal(resolveSpecifier(from, './legacy.mjs', root), 'lib/legacy.mjs');
  assert.equal(resolveSpecifier(from, './store', root), 'lib/store/index.ts');
  assert.equal(resolveSpecifier(from, 'react', root), null);
  assert.equal(resolveSpecifier(from, './missing', root), null);
  assert.equal(resolveSpecifier(from, './missing.js', root), null);
  rmSync(root, { recursive: true, force: true });
});

test('buildImportGraph: edges from import/export-from/require/dynamic', () => {
  const root = fixture({
    'src/a.ts': [
      "import { b } from './b';",
      "export * from './c.js';",
      "const d = require('./d');",
      "async () => { const e = await import('./e'); };",
    ].join('\n'),
    'src/b.ts': "import { c } from './c';",
    'src/c.ts': 'export const c = 1;',
    'src/d.ts': 'export const d = 1;',
    'src/e.ts': 'export const e = 1;',
  });
  const files = [
    'src/a.ts', 'src/b.ts', 'src/c.ts', 'src/d.ts', 'src/e.ts',
  ].map((rel) => ({ full: path.join(root, rel), rel }));
  const graph = buildImportGraph(files, root);
  assert.deepEqual([...graph.get('src/a.ts')].sort(), ['src/b.ts', 'src/c.ts', 'src/d.ts', 'src/e.ts']);
  assert.deepEqual([...graph.get('src/b.ts')], ['src/c.ts']);
  rmSync(root, { recursive: true, force: true });
});

test('buildImportGraph: imports inside comments and strings are ignored', () => {
  const root = fixture({
    'src/a.ts': [
      "// import { ghost } from './ghost';",
      '/* import { ghost2 } from "./ghost2"; */',
      "const tip = \"import x from './ghost3';\";",
      "import { b } from './b';",
    ].join('\n'),
    'src/b.ts': 'export const b = 1;',
    'src/ghost.ts': 'export const g = 1;',
    'src/ghost2.ts': 'export const g2 = 1;',
    'src/ghost3.ts': 'export const g3 = 1;',
  });
  const files = ['src/a.ts', 'src/b.ts', 'src/ghost.ts', 'src/ghost2.ts', 'src/ghost3.ts']
    .map((rel) => ({ full: path.join(root, rel), rel }));
  const graph = buildImportGraph(files, root);
  assert.deepEqual([...graph.get('src/a.ts')], ['src/b.ts']);
  rmSync(root, { recursive: true, force: true });
});

test('findCycles: two-node cycle found once', () => {
  const graph = new Map([
    ['a.ts', new Set(['b.ts'])],
    ['b.ts', new Set(['a.ts'])],
    ['c.ts', new Set(['a.ts'])],
  ]);
  const cycles = findCycles(graph);
  assert.equal(cycles.length, 1);
  const chain = cycles[0];
  assert.equal(chain[0], chain[chain.length - 1]);
  assert.deepEqual([...chain.slice(0, -1)].sort(), ['a.ts', 'b.ts']);
});

test('findCycles: three-node cycle and self-import', () => {
  const graph = new Map([
    ['a.ts', new Set(['b.ts'])],
    ['b.ts', new Set(['c.ts'])],
    ['c.ts', new Set(['a.ts'])],
    ['d.ts', new Set(['d.ts'])],
  ]);
  const cycles = findCycles(graph);
  assert.equal(cycles.length, 2);
  const three = cycles.find((c) => c.length === 4);
  assert.deepEqual(three, ['a.ts', 'b.ts', 'c.ts', 'a.ts']);
  const self = cycles.find((c) => c.length === 2);
  assert.deepEqual(self, ['d.ts', 'd.ts']);
});

test('findCycles: acyclic graph -> no cycles', () => {
  const graph = new Map([
    ['a.ts', new Set(['b.ts', 'c.ts'])],
    ['b.ts', new Set(['c.ts'])],
    ['c.ts', new Set([])],
  ]);
  assert.deepEqual(findCycles(graph), []);
});

test('findCycles: deep cycle through many nodes does not blow the stack guard', () => {
  const graph = new Map();
  for (let i = 0; i < 200; i++) graph.set(`f${i}.ts`, new Set([`f${(i + 1) % 200}.ts`]));
  const cycles = findCycles(graph);
  assert.equal(cycles.length, 1);
  assert.equal(cycles[0].length, 201);
});
