import test from 'node:test';
import assert from 'node:assert/strict';

import type { BrowserTarget } from '../../../packages/browser/src/target.ts';
import { CdpInput } from '../src/input/cdp-input.ts';
import { HumanizedInput } from '../src/input/driver.ts';
import { HumanKeyboard } from '../src/input/keyboard.ts';
import { InputState } from '../src/input/context.ts';

type Call = { method: string; params: Record<string, any> };

function fakeTarget(handler: (method: string, params: Record<string, any>) => unknown = () => ({})): {
  target: BrowserTarget;
  calls: Call[];
} {
  const calls: Call[] = [];
  const target = {
    id: 't1',
    kind: 'chrome-cdp',
    sendCommand: async (method: string, params: Record<string, any> = {}) => {
      calls.push({ method, params });
      return handler(method, params);
    },
    evaluate: async () => undefined,
  } as unknown as BrowserTarget;
  return { target, calls };
}

test('CdpInput.send reports CDP availability without throwing', async () => {
  const cdp = new CdpInput(new InputState());
  const ok = fakeTarget();
  assert.equal(await cdp.send(ok.target, 'Input.dispatchKeyEvent', { key: 'a' }), true);

  const failing = fakeTarget(() => {
    throw new Error('no debugger');
  });
  assert.equal(await cdp.send(failing.target, 'Input.dispatchKeyEvent', { key: 'a' }), false);
});

test('dispatch refuses input during a human takeover and marks synthetic events', async () => {
  const state = new InputState();
  const cdp = new CdpInput(state);
  const { target } = fakeTarget();

  state.humanGate = () => true;
  await assert.rejects(
    () => cdp.dispatch(target, 'Input.dispatchMouseEvent', {}, () => undefined),
    /HUMAN_IN_PROGRESS/,
  );

  state.humanGate = () => false;
  let marked = 0;
  state.syntheticMarker = () => {
    marked += 1;
  };
  await cdp.dispatch(target, 'Input.dispatchMouseEvent', {}, () => undefined);
  assert.equal(marked, 1);
  assert.equal(state.lastInputTransport, 'cdp');
});

test('dispatch uses the native fallback and records the transport', async () => {
  const state = new InputState();
  const cdp = new CdpInput(state);
  const failing = fakeTarget(() => {
    throw new Error('no debugger');
  });
  let fellBack = 0;
  await cdp.dispatch(failing.target, 'Input.dispatchMouseEvent', {}, () => {
    fellBack += 1;
  });
  assert.equal(fellBack, 1);
  assert.equal(state.lastInputTransport, 'native');
});

test('ensureTarget takes the native path immediately when CDP is not attached', () => {
  const state = new InputState();
  let focused = 0;
  state.native = {
    focus: () => {
      focused += 1;
    },
  };
  const { target, calls } = fakeTarget();
  (target as any).isAttached = () => false;
  new CdpInput(state).ensureTarget(target);
  assert.equal(focused, 1);
  assert.equal(calls.length, 0);
});

test('typeText sends a down/up pair per character through CDP', async () => {
  const state = new InputState();
  state.profile.typingWpm = 600;
  const keyboard = new HumanKeyboard(state, new CdpInput(state));
  const { target, calls } = fakeTarget();
  await keyboard.typeText(target, 'ab');

  const keyCalls = calls.filter((call) => call.method === 'Input.dispatchKeyEvent');
  assert.equal(keyCalls.length, 4);
  assert.equal(keyCalls[0]?.params.type, 'keyDown');
  assert.equal(keyCalls[0]?.params.text, 'a');
  assert.equal(keyCalls[1]?.params.type, 'keyUp');
  assert.equal(state.lastInputTransport, 'cdp');
});

test('typeText uses the native key port when CDP fails', async () => {
  const state = new InputState();
  state.profile.typingWpm = 600;
  const phases: string[] = [];
  state.native = {
    key: (_target, phase) => {
      phases.push(phase);
    },
  };
  const keyboard = new HumanKeyboard(state, new CdpInput(state));
  const failing = fakeTarget(() => {
    throw new Error('no debugger');
  });
  await keyboard.typeText(failing.target, 'a');
  assert.deepEqual(phases, ['down', 'char', 'up']);
  assert.equal(state.lastInputTransport, 'native');
});

test('pressKey keeps the Shift modifier and the Enter text payload', async () => {
  const state = new InputState();
  const keyboard = new HumanKeyboard(state, new CdpInput(state));
  const { target, calls } = fakeTarget();

  await keyboard.pressKey(target, 'Shift+Tab');
  const shiftDown = calls.filter((call) => call.method === 'Input.dispatchKeyEvent')[0];
  assert.equal(shiftDown?.params.modifiers, 8);
  assert.equal(shiftDown?.params.key, 'Tab');

  calls.length = 0;
  await keyboard.pressKey(target, 'Enter');
  const enterDown = calls.filter((call) => call.method === 'Input.dispatchKeyEvent')[0];
  assert.equal(enterDown?.params.text, '\r');
});

test('pasteText writes the clipboard, pastes natively and restores the previous value', async () => {
  const state = new InputState();
  const writes: string[] = [];
  let pasted = 0;
  state.clipboard = {
    readText: () => 'previous',
    writeText: (text) => {
      writes.push(text);
    },
  };
  state.native = {
    paste: () => {
      pasted += 1;
    },
    focus: () => undefined,
  };
  const keyboard = new HumanKeyboard(state, new CdpInput(state));
  const { target } = fakeTarget();

  assert.equal(await keyboard.pasteText(target, 'secret'), true);
  assert.deepEqual(writes, ['secret', 'previous']);
  assert.equal(pasted, 1);
  assert.equal(state.lastInputTransport, 'native');
});

test('the driver applies a profile, keeps the cursor and maps viewport scale', () => {
  const driver = new HumanizedInput({ profile: { typingWpm: 300, clickDwellMs: Number.NaN } });
  assert.equal((driver as any).state.profile.typingWpm, 300);
  assert.equal((driver as any).state.profile.clickDwellMs, 55);

  const { target } = fakeTarget();
  driver.setViewportScale(target, 2);
  assert.deepEqual(driver.cdp.toViewPoint(target, { x: 10, y: 5 }), { x: 20, y: 10 });
  driver.setViewportScale(target, 1);
  assert.deepEqual(driver.cdp.toViewPoint(target, { x: 10, y: 5 }), { x: 10, y: 5 });
  assert.deepEqual(driver.getCursorPosition(), { x: 100, y: 100 });
});
