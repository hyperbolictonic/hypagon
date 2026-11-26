import test from 'node:test';
import assert from 'node:assert/strict';

import { detectHostBrowserProfile } from '../src/host/fingerprint.ts';

test('the detected profile is internally coherent', () => {
  const profile = detectHostBrowserProfile();
  const version = process.versions.chrome || '131.0.6778.86';
  assert.equal(profile.version, version);
  assert.equal(profile.majorVersion, version.split('.')[0]);
  assert.ok(profile.userAgent.includes(`Chrome/${version}`));
  assert.ok(profile.userAgent.startsWith('Mozilla/5.0 ('));
  assert.ok(profile.userAgent.includes('AppleWebKit/537.36'));
  assert.ok(profile.secChUa.includes(`v="${profile.majorVersion}"`));
  assert.ok(['"Windows"', '"macOS"', '"Linux"'].includes(profile.secChUaPlatform));
  assert.ok(['Google Chrome', 'Chromium', 'Microsoft Edge', 'Brave Browser'].includes(profile.name));
});

test('an Edge profile appends its UA suffix and brand', () => {
  // Only assert the shape when the host actually has Edge installed; the fallback is Chrome.
  const profile = detectHostBrowserProfile();
  if (profile.name === 'Microsoft Edge') {
    assert.match(profile.userAgent, / Edg\/\d/);
    assert.match(profile.secChUa, /Microsoft Edge/);
  }
});
