import test from 'node:test';
import assert from 'node:assert/strict';

import { keyDescriptor, keyEventParams } from '../src/input/keys.ts';
import { VISUAL_CURSOR_SCRIPT } from '../src/input/cursor-overlay.ts';

test('keyDescriptor maps letters, digits, named keys and punctuation', () => {
  assert.deepEqual(keyDescriptor('A'), { key: 'A', code: 'KeyA', vk: 65 });
  assert.deepEqual(keyDescriptor('7'), { key: '7', code: 'Digit7', vk: 55 });
  assert.deepEqual(keyDescriptor('Enter'), { key: 'Enter', code: 'Enter', vk: 13 });
  // '.' must use the physical Period virtual key, not ASCII 46 (VK_DELETE).
  assert.deepEqual(keyDescriptor('.'), { key: '.', code: 'Period', vk: 190 });
  assert.deepEqual(keyDescriptor("'"), { key: "'", code: 'Quote', vk: 222 });
  assert.deepEqual(keyDescriptor('€'), { key: '€', code: '', vk: 0 });
});

test('keyEventParams carries the virtual key on both down and up', () => {
  const down = keyEventParams(keyDescriptor('a'), 'down', { text: 'a' });
  assert.equal(down.type, 'keyDown');
  assert.equal(down.key, 'a');
  assert.equal(down.windowsVirtualKeyCode, 65);
  assert.equal(down.nativeVirtualKeyCode, 65);
  assert.equal(down.text, 'a');

  const up = keyEventParams(keyDescriptor('Tab'), 'up');
  assert.equal(up.type, 'keyUp');
  assert.equal(up.code, 'Tab');
});

test('the ghost cursor script is a self-contained page expression', () => {
  assert.match(VISUAL_CURSOR_SCRIPT, /__kuangMoveCursor/);
  assert.match(VISUAL_CURSOR_SCRIPT, /__kuangClickCursor/);
});
