import assert from 'node:assert/strict';
import test from 'node:test';

import {
  BUILTIN_PROFILES,
  MAX_VIEWPORT_DIMENSION,
  MIN_VIEWPORT_DIMENSION,
  fitViewport,
  normalizeDeviceProfile,
  normalizeViewportSpec,
  rotateSpec,
  specFromProfile,
} from '../src/shared/viewport.ts';

test('built-in devices are unique and valid', () => {
  const ids = new Set();
  for (const profile of BUILTIN_PROFILES) {
    assert.ok(profile.width >= MIN_VIEWPORT_DIMENSION && profile.width <= MAX_VIEWPORT_DIMENSION);
    assert.ok(profile.height >= MIN_VIEWPORT_DIMENSION && profile.height <= MAX_VIEWPORT_DIMENSION);
    assert.ok(profile.deviceScaleFactor >= 0.5 && profile.deviceScaleFactor <= 5);
    assert.equal(ids.has(profile.id), false, `duplicate preset id ${profile.id}`);
    ids.add(profile.id);
  }
});

test('custom dimensions are clamped to a usable range', () => {
  const tiny = normalizeViewportSpec({ width: 10, height: 999999, deviceScaleFactor: 99 });
  assert.equal(tiny.width, MIN_VIEWPORT_DIMENSION);
  assert.equal(tiny.height, MAX_VIEWPORT_DIMENSION);
  assert.equal(tiny.deviceScaleFactor, 5);
  assert.equal(tiny.profileId, 'custom');
});

test('rotation swaps dimensions and keeps the device scale', () => {
  const phone = specFromProfile(BUILTIN_PROFILES[0]);
  const landscape = rotateSpec(phone);
  assert.equal(landscape.width, phone.height);
  assert.equal(landscape.height, phone.width);
  assert.equal(landscape.deviceScaleFactor, phone.deviceScaleFactor);
});

test('a tall phone is scaled to fit a short browsing area', () => {
  const phone = specFromProfile(BUILTIN_PROFILES[0]);
  const { frame, scale } = fitViewport(phone, { width: 1200, height: 600 });
  assert.ok(scale < 1, `expected fit scale, got ${scale}`);
  assert.ok(frame.height <= 600 && frame.width <= 1200);
  assert.ok(Math.abs(frame.width / frame.height - phone.width / phone.height) < 0.02);
});

test('a small device stays at 100% and is centred', () => {
  const spec = normalizeViewportSpec({ width: 400, height: 500, deviceScaleFactor: 1 });
  const { frame, scale } = fitViewport(spec, { width: 1000, height: 800 });
  assert.equal(scale, 1);
  assert.equal(frame.width, 400);
  assert.equal(frame.height, 500);
  assert.equal(frame.x, 300);
  assert.equal(frame.y, 150);
});

test('saved profile shapes are validated and clamped', () => {
  const profile = normalizeDeviceProfile({
    id: 'custom-my-phone',
    name: '  My phone  ',
    width: 390,
    height: 844,
    deviceScaleFactor: 99,
    mobile: true,
  });
  assert.equal(profile?.name, 'My phone');
  assert.equal(profile?.deviceScaleFactor, 5);
  assert.equal(normalizeDeviceProfile({ id: 'x', name: '', width: 400, height: 800 }), null);
  assert.equal(normalizeDeviceProfile({ name: 'x', width: 400, height: 800 }), null);
  assert.equal(normalizeDeviceProfile({ id: 'x', name: 'x', width: 10, height: 10 })?.width, MIN_VIEWPORT_DIMENSION);
});
