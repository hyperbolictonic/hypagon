import test from 'node:test';
import assert from 'node:assert/strict';

import type { BrowserTarget } from '../src/target.ts';
import { discoverFrames, setFrameCommandObserver } from '../src/frames/frame-tree.ts';
import { listFrames } from '../src/frames/frames.ts';
import { evaluateInFrames } from '../src/frames/frame-eval.ts';
import { clearFrameMarks, registerFrameMarks, resolveFrameMark } from '../src/frames/frame-marks.ts';

type Handler = (params: Record<string, any>) => unknown;

const FRAME_TREE = {
  frameTree: {
    frame: { id: 'main', url: 'https://a.test/', name: '' },
    childFrames: [{ frame: { id: 'child', parentId: 'main', url: 'https://b.test/widget', name: 'widget' } }],
  },
};

function cdpTarget(overrides: Record<string, Handler> = {}): { target: BrowserTarget; calls: string[] } {
  const calls: string[] = [];
  const handlers: Record<string, Handler> = {
    'Page.enable': () => ({}),
    'DOM.enable': () => ({}),
    'Target.getTargets': () => ({ targetInfos: [] }),
    'Page.getFrameTree': () => FRAME_TREE,
    'Page.getLayoutMetrics': () => ({ cssLayoutViewport: { clientWidth: 800, clientHeight: 600 } }),
    'DOM.getFrameOwner': () => ({ backendNodeId: 5 }),
    'DOM.resolveNode': () => ({ object: { objectId: 'obj-5' } }),
    'Runtime.callFunctionOn': () => ({ result: { value: { x: 10, y: 20, width: 100, height: 50, laidOut: true } } }),
    'Page.createIsolatedWorld': () => ({ executionContextId: 7 }),
    'Runtime.evaluate': () => ({ result: { value: 'ok' } }),
    ...overrides,
  };
  const target = {
    id: 'test',
    kind: 'chrome-cdp',
    sendCommand: async (method: string, params: Record<string, any> = {}) => {
      calls.push(method);
      const handler = handlers[method];
      if (!handler) throw new Error(`unexpected CDP command ${method}`);
      return handler(params);
    },
    evaluate: async () => null,
  } as unknown as BrowserTarget;
  return { target, calls };
}

test('discoverFrames merges the main tree and routes commands through the target', async () => {
  const { target, calls } = cdpTarget();
  const ctx = await discoverFrames(target, { maxFrames: 8 });
  assert.deepEqual(
    ctx.frames.map((frame) => frame.frameId),
    ['main', 'child'],
  );
  assert.equal(ctx.frames[1]?.depth, 1);
  assert.equal(ctx.sessionFor('child'), undefined);
  assert.ok(calls.includes('Page.getFrameTree'));
  await ctx.release();
});

test('listFrames measures child geometry through the parent document', async () => {
  const { target } = cdpTarget();
  const frames = await listFrames(target, { maxFrames: 8 });
  assert.equal(frames.length, 2);
  assert.deepEqual(frames[0]?.rect, { x: 0, y: 0, width: 800, height: 600 });
  assert.deepEqual(frames[1]?.rect, { x: 10, y: 20, width: 100, height: 50 });
  assert.equal(frames[1]?.oopif, false);
  assert.ok(frames[1]?.visibleRect);
});

test('evaluateInFrames runs the expression in each frame and reports values', async () => {
  const { target } = cdpTarget();
  const results = await evaluateInFrames(target, '1 + 1', { maxFrames: 8 });
  assert.equal(results.length, 2);
  assert.deepEqual(results.map((r) => r.ok), [true, true]);
  assert.deepEqual(results.map((r) => r.value), ['ok', 'ok']);
  assert.deepEqual(results.map((r) => r.depth), [0, 1]);
});

test('evaluateInFrames reports a frame exception as ok:false', async () => {
  const { target } = cdpTarget({
    'Runtime.evaluate': () => ({ exceptionDetails: { text: 'boom', exception: { description: 'Error: boom' } } }),
  });
  const results = await evaluateInFrames(target, 'throw new Error()', { maxFrames: 8 });
  assert.equal(results[0]?.ok, false);
  assert.match(String(results[0]?.error), /boom/);
});

test('frame marks resolve through the registered frame and its geometry', async () => {
  const { target } = cdpTarget({
    'Runtime.evaluate': () => ({
      result: { value: { x: 15, y: 25, width: 10, height: 10, tag: 'button', text: 'Go' } },
    }),
  });
  clearFrameMarks(target);
  registerFrameMarks(target, [{ id: 100, frameId: 'child' }]);

  const hit = await resolveFrameMark(target, 100);
  assert.equal(hit?.mark.id, 100);
  assert.equal(hit?.mark.frameId, 'child');
  assert.deepEqual(hit?.currentCenter, { x: 25, y: 45 });
  assert.equal(hit?.mark.tag, 'BUTTON');

  clearFrameMarks(target);
  assert.equal(await resolveFrameMark(target, 100), null);
});

test('setFrameCommandObserver counts every CDP command frame discovery sends', async () => {
  const { target } = cdpTarget();
  let count = 0;
  setFrameCommandObserver(() => {
    count += 1;
  });
  const ctx = await discoverFrames(target, { maxFrames: 8 });
  await ctx.release();
  setFrameCommandObserver(undefined);
  assert.ok(count >= 3);
});
