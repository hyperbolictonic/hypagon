import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { AnchorStore } from '../src/anchor-store.ts';

function tempStore(): { store: AnchorStore; dir: string } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hypagon-anchors-'));
  return { store: new AnchorStore(path.join(dir, 'research-anchors.json')), dir };
}

test('AnchorStore persists anchors and reloads them', () => {
  const { store, dir } = tempStore();
  try {
    store.upsert('https://example.test/a', [
      { text: 'The anchored sentence', score: 2, path: '/html/body/p[1]', fingerprint: { root: 'x' } as any },
    ]);
    assert.equal(store.list('https://example.test/a').length, 1);
    assert.deepEqual(store.urls(), ['https://example.test/a']);
    assert.equal(store.stats().anchors, 1);

    const reloaded = new AnchorStore(store.file);
    assert.equal(reloaded.list().length, 1);
    assert.equal(reloaded.list()[0]?.text, 'The anchored sentence');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('anchor checks update the last outcome without losing the record', () => {
  const { store, dir } = tempStore();
  try {
    store.upsert('https://example.test/a', [
      { text: 'One', score: 1, path: '/p[1]', fingerprint: {} as any },
      { text: 'Two', score: 1, path: '/p[2]', fingerprint: {} as any },
    ]);
    store.applyChecks('https://example.test/a', [
      { found: true, score: 3, path: '/p[1]', text: 'One', candidates: [] },
      { found: false, score: 1, path: null, text: null, candidates: [] },
    ]);

    const rows = store.list('https://example.test/a');
    assert.equal(rows.length, 2);
    assert.equal(rows[0]?.lastFound, true);
    assert.equal(rows[1]?.lastFound, false);
    assert.equal(store.stats().checked, 2);
    assert.equal(store.stats().found, 1);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('upserting the same text refreshes the fingerprint and clears the old check', () => {
  const { store, dir } = tempStore();
  try {
    store.upsert('https://example.test/a', [{ text: 'One', score: 1, path: '/p', fingerprint: { v: 1 } as any }]);
    store.applyChecks('https://example.test/a', [{ found: true, score: 3, path: '/p', text: 'One', candidates: [] }]);
    store.upsert('https://example.test/a', [{ text: 'One', score: 1, path: '/p2', fingerprint: { v: 2 } as any }]);

    const row = store.list()[0]!;
    assert.equal(row.path, '/p2');
    assert.equal(row.lastFound, undefined);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
