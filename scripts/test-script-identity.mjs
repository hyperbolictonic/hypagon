import test from 'node:test';
import assert from 'node:assert/strict';

import { scriptId } from '../src/main/cortex/script-identity.ts';

test('ids are stable for the same exact name', () => {
  assert.equal(scriptId('sale alert'), scriptId('sale alert'));
});

test('names that sanitize alike get different ids', () => {
  assert.notEqual(scriptId('sale alert'), scriptId('sale-alert'));
  assert.notEqual(scriptId('a b'), scriptId('a_b'));
});

test('ids stay filesystem and filter friendly', () => {
  assert.match(scriptId('Sale Alert! / v2'), /^script_[a-z0-9_-]+_[0-9a-f]{8}$/);
});
