import test from 'node:test';
import assert from 'node:assert/strict';

import type { PrimitivesHost, SensitiveGateDetection } from '../src/primitives/contracts.ts';
import { ActVerdicts } from '../src/primitives/act-verdicts.ts';
import { Primitives } from '../src/primitives/primitives.ts';

function host(overrides: Partial<PrimitivesHost> = {}): PrimitivesHost {
  return {
    evaluate: async () => '',
    getPageInfo: () => ({ url: 'https://example.test/', title: 'Example', isLoading: false }),
    getMarks: () => [],
    revision: () => 1,
    ...overrides,
  } as unknown as PrimitivesHost;
}

test('verdict reports a silent no-op when no trusted events reached the page', () => {
  const outcome = new ActVerdicts(host()).verdict(
    { beforeLength: 0, afterLength: 0, changed: false, keydowns: 0, beforeinputs: 0, inputs: 0 },
    5,
    false,
  );
  assert.equal(outcome?.landed, false);
  assert.deepEqual(outcome?.attempted, ['keys']);
  assert.match(new ActVerdicts(host()).hint(outcome!), /No trusted key events/);
});

test('verdict cannot judge a control that was re-rendered mid-type', () => {
  const outcome = new ActVerdicts(host()).verdict(
    { beforeLength: 2, afterLength: null, changed: null, keydowns: 3, beforeinputs: 1, inputs: 1, detached: true },
    4,
    false,
  );
  assert.equal(outcome?.landed, null);
  assert.equal(outcome?.detached, true);
});

test('verdict marks a closed-shadow target unobservable rather than failed', () => {
  const outcome = new ActVerdicts(host()).verdict(
    { beforeLength: 0, afterLength: 0, changed: false, keydowns: 3, beforeinputs: 1, inputs: 1, observable: false },
    3,
    false,
  );
  assert.equal(outcome?.landed, null);
  assert.equal(outcome?.unobservable, true);
});

test('verdict accepts a clear-first retype of the same length', () => {
  const outcome = new ActVerdicts(host()).verdict(
    { beforeLength: 4, afterLength: 4, changed: false, keydowns: 4, beforeinputs: 4, inputs: 4 },
    4,
    true,
  );
  assert.equal(outcome?.landed, true);
});

test('gateWarningFor only reads the page for gate-like labels and uses the host policy', async () => {
  const calls: string[] = [];
  const detection: SensitiveGateDetection = { kind: 'age_verification', evidence: ['verify your age'], reason: 'age wall' };
  const verdicts = new ActVerdicts(
    host({
      evaluate: async (script: string) => {
        calls.push(script);
        return 'verify your age to continue';
      },
      detectSensitiveGate: () => detection,
    }),
  );

  assert.equal(await verdicts.gateWarningFor('Docs'), undefined);
  assert.equal(calls.length, 0);

  const warning = await verdicts.gateWarningFor('Continue');
  assert.equal(calls.length, 1);
  assert.match(warning!, /age-verification wall/);
  assert.match(warning!, /request_human_intervention/);
});

test('gateWarningFor stays quiet when the host has no gate policy', async () => {
  const verdicts = new ActVerdicts(host({ evaluate: async () => 'verify your age' }));
  assert.equal(await verdicts.gateWarningFor('Continue'), undefined);
});

test('the Primitives facade wires every controller', async () => {
  const primitives = new Primitives(
    host({
      evaluate: async () => ({ url: 'https://example.test/', title: 'Example', nodeCount: 3, height: 10, scrollY: 0, textLen: 1, textHash: 1 }),
      getNetworkTraffic: () => [],
      appIdentity: () => ({ name: 'Host Deck', version: '1.0.0' }),
    }),
  );
  assert.ok(primitives.state);
  assert.ok(primitives.wait);
  assert.ok(primitives.view);
  assert.ok(primitives.read);
  assert.ok(primitives.finder);
  assert.ok(primitives.net);
  assert.equal((await primitives.pageState()).nodeCount, 3);
  assert.deepEqual(primitives.net.exportHar().log.creator, { name: 'Host Deck', version: '1.0.0' });
});
