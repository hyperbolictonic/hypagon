import test from 'node:test';
import assert from 'node:assert/strict';

import { StateController } from '../src/primitives/state-controller.ts';
import type { PrimitivesHost } from '../src/primitives/contracts.ts';

const dom = {
  url: 'https://example.test/page',
  title: 'Example',
  nodeCount: 12,
  height: 1000,
  scrollY: 0,
  textLen: 50,
  textHash: 7,
};

function host(): PrimitivesHost {
  return {
    evaluate: async () => dom,
    getPageInfo: () => ({ url: 'https://example.test/page', title: 'Example', isLoading: false }),
    revision: () => 3,
    getMarks: () => [],
  } as unknown as PrimitivesHost;
}

test('pageState records the evaluated signature and host facts', async () => {
  const state = await new StateController(host()).pageState();
  assert.equal(state.revision, 3);
  assert.equal(state.url, 'https://example.test/page');
  assert.equal(state.nodeCount, 12);
  assert.equal(state.marks, 0);
  assert.equal(state.isLoading, false);
});

test('diff compares against the recorded revision', async () => {
  const controller = new StateController(host());
  await controller.pageState();
  const diff = await controller.diff(3);
  assert.equal(diff.from?.revision, 3);
  assert.equal(diff.changed, false);
});

test('diff without a baseline reports a change and a note', async () => {
  const diff = await new StateController(host()).diff(1);
  assert.equal(diff.changed, true);
  assert.match(diff.note, /no baseline/);
});
