import test from 'node:test';
import assert from 'node:assert/strict';

import { generateChaosTrajectory, type ChaosKinematicsOptions } from '../src/movement/chaos-kinematics.ts';
import { generateOrganicTrajectory } from '../src/movement/bezier.ts';

const START = { x: 10, y: 20 };
const TARGET = { x: 410, y: 220 };

const OPTIONS: ChaosKinematicsOptions = {
  steps: 40,
  enablePinkNoise: false,
  enableAsymmetricVelocity: false,
  enableTwoThirdsLaw: false,
  enableOvershoot: false,
  enableChaoticAttractor: false,
};

test('a glide starts near the start, ends on the target and paces every step', () => {
  const path = generateChaosTrajectory(START, TARGET, OPTIONS);
  assert.ok(path.length >= 2);
  assert.ok(Math.abs(path[0]!.x - START.x) < 5 && Math.abs(path[0]!.y - START.y) < 5);
  assert.ok(Math.abs(path[path.length - 1]!.x - TARGET.x) < 0.5);
  assert.ok(Math.abs(path[path.length - 1]!.y - TARGET.y) < 0.5);
  for (const step of path) {
    assert.ok(Number.isFinite(step.x) && Number.isFinite(step.y));
    assert.ok(step.delayMs >= 0);
    assert.ok(step.velocity >= 0);
  }
});

test('the full chaos profile still lands on the target', () => {
  const path = generateChaosTrajectory(START, TARGET, { steps: 60 });
  assert.ok(path.length > 20);
  assert.ok(Math.abs(path[path.length - 1]!.x - TARGET.x) < 0.5);
  assert.ok(Math.abs(path[path.length - 1]!.y - TARGET.y) < 0.5);
  assert.ok(path.some((step) => step.isCorrective === true));
});

test('a zero-distance glide is handled without a divide-by-zero', () => {
  const path = generateChaosTrajectory(START, { ...START }, OPTIONS);
  assert.ok(path.length >= 1);
  for (const step of path) assert.ok(Number.isFinite(step.x) && Number.isFinite(step.y));
});

test('generateOrganicTrajectory is the same engine', () => {
  const path = generateOrganicTrajectory(START, TARGET, OPTIONS);
  assert.ok(Math.abs(path[path.length - 1]!.x - TARGET.x) < 0.5);
  assert.ok(Math.abs(path[path.length - 1]!.y - TARGET.y) < 0.5);
});
