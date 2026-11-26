import test from 'node:test';
import assert from 'node:assert/strict';

import type { BrowserTarget } from '../../browser/src/target.ts';
import { ShieldBreaker } from '../src/shield/breaker.ts';

type Match = {
  found: boolean;
  x?: number;
  y?: number;
  frameCount?: number;
  wallPresent?: boolean;
  framework?: string;
  intent?: 'reject' | 'accept';
  text?: string;
  selector?: string;
};

function fakeTarget(evaluate: (script: string) => unknown): BrowserTarget {
  return {
    id: 'tab',
    kind: 'chrome-cdp',
    evaluate: async (script: string) => evaluate(script),
    sendCommand: async () => ({}),
  } as unknown as BrowserTarget;
}

const isScan = (script: string) => script.includes('const rules =');

test('a top-document match is clicked once and reported', async () => {
  const clicks: Array<{ x: number; y: number }> = [];
  const target = fakeTarget((script) =>
    isScan(script)
      ? { found: true, x: 120, y: 340, framework: 'OneTrust', intent: 'reject', text: 'Reject all' }
      : undefined,
  );
  const breaker = new ShieldBreaker({
    clickAt: async (_target, point) => {
      clicks.push(point);
    },
  });

  const result = await breaker.dismissConsent(target);
  assert.equal(result.dismissed, true);
  assert.equal(result.frame, 'main');
  assert.equal(result.delivery, 'cdp');
  assert.equal(result.framework, 'OneTrust');
  assert.deepEqual(clicks, [{ x: 120, y: 340 }]);
});

test('a page without a wall reports no barrier', async () => {
  const target = fakeTarget(() => ({ found: false, wallPresent: false, frameCount: 0 }));
  const result = await new ShieldBreaker({ clickAt: async () => undefined }).dismissConsent(target);
  assert.equal(result.dismissed, false);
  assert.equal(result.blocked, false);
});

test('a wall with no control is left for a human', async () => {
  const target = fakeTarget(() => ({ found: false, wallPresent: true, frameCount: 0 }));
  const result = await new ShieldBreaker({ clickAt: async () => undefined }).dismissConsent(target);
  assert.equal(result.dismissed, false);
  assert.equal(result.blocked, true);
  assert.match(result.message, /left for a human/);
});

test('forceRemove hides a matched wall only when asked', async () => {
  const scripts: string[] = [];
  const target = fakeTarget((script) => {
    scripts.push(script);
    if (isScan(script)) return { found: false, wallPresent: true, frameCount: 0 };
    return undefined;
  });
  const result = await new ShieldBreaker({ clickAt: async () => undefined }).dismissConsent(target, {
    forceRemove: true,
  });
  assert.equal(result.dismissed, true);
  assert.equal(result.framework, 'forced removal');
  assert.ok(scripts.some((script) => script.includes("display', 'none'")));
});

test('a child-frame match uses the iframe offset for the click', async () => {
  const clicks: Array<{ x: number; y: number }> = [];
  const target = fakeTarget((script) => {
    if (isScan(script)) return { found: false, wallPresent: false, frameCount: 1 };
    if (script.includes('const want =')) return { x: 100, y: 200 };
    return undefined;
  });
  const breaker = new ShieldBreaker({
    clickAt: async (_target, point) => {
      clicks.push(point);
    },
    evaluateInFrames: async () => [
      {
        ok: true,
        url: 'https://cmp.test/frame',
        value: { found: true, x: 10, y: 20, framework: 'Sourcepoint', intent: 'reject', text: 'Reject' },
      },
    ],
  });

  const result = await breaker.dismissConsent(target);
  assert.equal(result.dismissed, true);
  assert.equal(result.frame, 'child');
  assert.deepEqual(clicks, [{ x: 110, y: 220 }]);
});

test('without a frame evaluator the child path is skipped', async () => {
  const target = fakeTarget(() => ({ found: false, wallPresent: true, frameCount: 3 }));
  const result = await new ShieldBreaker({ clickAt: async () => undefined }).dismissConsent(target);
  assert.equal(result.dismissed, false);
  assert.equal(result.blocked, true);
});

test('accept policy tries accept before reject', async () => {
  const scanCalls: string[] = [];
  const target = fakeTarget((script) => {
    if (isScan(script)) {
      scanCalls.push(script);
      return { found: false, wallPresent: false, frameCount: 0 };
    }
    return undefined;
  });
  await new ShieldBreaker({ clickAt: async () => undefined }).dismissConsent(target, { policy: 'accept' });
  assert.equal(scanCalls.length, 1);
  assert.match(scanCalls[0]!, /\["accept","reject"\]/);
});
