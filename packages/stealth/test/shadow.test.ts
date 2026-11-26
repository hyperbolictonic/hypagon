import test from 'node:test';
import assert from 'node:assert/strict';

import type { BrowserTarget } from '../../browser/src/target.ts';
import { axProperty, axRole, contentRect } from '../src/shadow/cdp.ts';
import { SealedRateLimitError, SealedScanGate } from '../src/shadow/sealed-gate.ts';
import { findSealedControls } from '../src/shadow/ax-controls.ts';
import { issueSealedToken, resolveSealedToken, clearSealedTokens } from '../src/shadow/sealed-targets.ts';

function fakeTarget(handler: (method: string, params: Record<string, any>) => unknown = () => ({})): BrowserTarget {
  return {
    id: 'sealed',
    kind: 'chrome-cdp',
    isAttached: () => true,
    sendCommand: async (method: string, params: Record<string, any> = {}) => handler(method, params),
    evaluate: async () => undefined,
  } as unknown as BrowserTarget;
}

test('CDP helpers read AX properties, roles and box models', () => {
  const node = {
    role: { value: 'Button' },
    properties: [
      { name: 'focusable', value: { value: true } },
      { name: 'disabled', value: { value: false } },
    ],
  };
  assert.equal(axProperty(node, 'focusable'), true);
  assert.equal(axProperty(node, 'missing'), undefined);
  assert.equal(axRole(node), 'button');

  assert.deepEqual(
    contentRect({ model: { content: [10, 20, 30, 20, 30, 40, 10, 40] } }),
    { x: 10, y: 20, width: 20, height: 20 },
  );
  assert.equal(contentRect({ model: { content: [1, 2] } }), null);
});

test('the gate caches by target and rate-limits full scans', () => {
  const target = fakeTarget();
  const gate = new SealedScanGate();
  const entry = { key: 'k', at: Date.now(), identities: [], notes: [], frames: 1 };

  assert.equal(gate.cached(target, 'k'), null);
  gate.store(target, entry);
  assert.deepEqual(gate.cached(target, 'k'), entry);
  assert.equal(gate.cached(target, 'other'), null);

  for (let i = 0; i < 6; i += 1) gate.admit(target);
  assert.throws(() => gate.admit(target), SealedRateLimitError);
});

test('sealed discovery reports a detached target and refuses selectors', async () => {
  const detached = { isAttached: () => false } as unknown as BrowserTarget;
  const empty = await findSealedControls(detached);
  assert.equal(empty.controls.length, 0);
  assert.match(empty.notes[0]!, /not attached/);

  const attached = fakeTarget();
  await assert.rejects(
    () => findSealedControls(attached, { selector: '#x' }),
    (error: any) => error.code === 'NOT_SUPPORTED',
  );
});

test('sealed discovery reports a missing frame tree', async () => {
  const target = fakeTarget((method) => {
    if (method === 'Page.getFrameTree') return {};
    return {};
  });
  const result = await findSealedControls(target);
  assert.equal(result.controls.length, 0);
  assert.match(result.notes[0]!, /No frame tree/);
});

test('a sealed token resolves to a live centre and an unknown token is null', async () => {
  const target = fakeTarget((method) => {
    if (method === 'Page.getFrameTree') {
      return { frameTree: { frame: { id: 'main', url: 'https://example.test/', name: '' } } };
    }
    if (method === 'Target.getTargets') return { targetInfos: [] };
    if (method === 'Page.getLayoutMetrics') {
      return { cssLayoutViewport: { clientWidth: 800, clientHeight: 600 } };
    }
    if (method === 'DOM.getBoxModel') {
      return { model: { content: [10, 20, 30, 20, 30, 40, 10, 40] } };
    }
    return {};
  });

  clearSealedTokens(target);
  const token = issueSealedToken(target, 123, 'main');
  assert.match(token, /^st_/);

  const hit = await resolveSealedToken(target, token);
  assert.deepEqual(hit?.rect, { x: 10, y: 20, width: 20, height: 20 });
  assert.deepEqual(hit?.center, { x: 20, y: 30 });
  assert.equal(hit?.frameId, 'main');

  assert.equal(await resolveSealedToken(target, 'st_nope'), null);
  clearSealedTokens(target);
  assert.equal(await resolveSealedToken(target, token), null);
});
