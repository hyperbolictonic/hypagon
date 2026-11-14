import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { AnchorStore } from '../src/main/research/anchor-store.ts';

const FINGERPRINT = {
  tag: 'p',
  attributes: { class: 'gear' },
  text: 'budget gear',
  path: ['html', 'body', 'p'],
};

function tempStore() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hypagon-anchors-'));
  return { dir, store: new AnchorStore(path.join(dir, 'research-anchors.json')) };
}

test('upserts, dedupes by URL+text and persists checks', () => {
  const { store } = tempStore();
  const url = 'https://example.test/a';

  store.upsert(url, [{ text: 'budget gear', score: 2, path: '/html/body/p[1]', fingerprint: FINGERPRINT }]);
  assert.equal(store.list().length, 1);
  assert.equal(store.list()[0].path, '/html/body/p[1]');

  // Re-anchoring the same text updates in place instead of duplicating.
  store.upsert(url, [{ text: 'budget gear', score: 3, path: '/html/body/p[2]', fingerprint: FINGERPRINT }]);
  assert.equal(store.list().length, 1);
  assert.equal(store.list()[0].path, '/html/body/p[2]');

  store.applyChecks(url, [
    { found: true, score: 73.75, path: '/html/body/p[2]', text: 'budget gear', candidates: [] },
  ]);

  const reloaded = new AnchorStore(store.file);
  assert.equal(reloaded.list().length, 1);
  assert.equal(reloaded.list()[0].lastFound, true);
  assert.equal(reloaded.list()[0].lastScore, 73.75);
  assert.deepEqual(reloaded.stats(), { anchors: 1, urls: 1, checked: 1, found: 1 });
});

test('keeps anchors scoped per URL', () => {
  const { store } = tempStore();
  store.upsert('https://a.test/x', [{ text: 'alpha block', score: 1, path: '/a', fingerprint: FINGERPRINT }]);
  store.upsert('https://b.test/y', [{ text: 'beta block', score: 1, path: '/b', fingerprint: FINGERPRINT }]);

  assert.equal(store.list().length, 2);
  assert.equal(store.list('https://a.test/x').length, 1);
  assert.deepEqual(store.urls().sort(), ['https://a.test/x', 'https://b.test/y']);
});
