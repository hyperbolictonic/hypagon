import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_INPUT_PROFILE,
  clampInputProfileValue,
  mergeInputProfile,
} from '../src/input/profile.ts';

test('clampInputProfileValue enforces the documented bounds and rounds', () => {
  assert.equal(clampInputProfileValue('mouseSpeedPxPerSec', 50), 200);
  assert.equal(clampInputProfileValue('mouseSpeedPxPerSec', 999999), 6000);
  assert.equal(clampInputProfileValue('typingWpm', 160.4), 160);
  assert.equal(clampInputProfileValue('clickDwellMs', -5), 0);
  assert.equal(clampInputProfileValue('clickDwellMs', 55.6), 56);
});

test('mergeInputProfile applies a clamped patch and keeps untouched fields', () => {
  const merged = mergeInputProfile(DEFAULT_INPUT_PROFILE, { typingWpm: 5000, clickDwellMs: 10 });
  assert.equal(merged.errors.length, 0);
  assert.equal(merged.profile.typingWpm, 600);
  assert.equal(merged.profile.clickDwellMs, 10);
  assert.equal(merged.profile.mouseSpeedPxPerSec, DEFAULT_INPUT_PROFILE.mouseSpeedPxPerSec);
});

test('mergeInputProfile rejects non-finite values per field', () => {
  const merged = mergeInputProfile(DEFAULT_INPUT_PROFILE, {
    mouseSpeedPxPerSec: Number.NaN,
    typingWpm: 120,
  });
  assert.deepEqual(merged.errors, ['mouseSpeedPxPerSec must be a number']);
  assert.equal(merged.profile.typingWpm, 120);
  assert.equal(merged.profile.mouseSpeedPxPerSec, DEFAULT_INPUT_PROFILE.mouseSpeedPxPerSec);
});
