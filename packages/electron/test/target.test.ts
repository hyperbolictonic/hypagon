import test from 'node:test';
import assert from 'node:assert/strict';
import type { WebContents } from 'electron';

import { ElectronTarget } from '../src/target.ts';

type Call = [string, ...unknown[]];

function fakeWebContents(): {
  wc: WebContents;
  calls: Call[];
  listeners: Map<string, Array<(...args: any[]) => void>>;
} {
  const calls: Call[] = [];
  const listeners = new Map<string, Array<(...args: any[]) => void>>();
  const wc = {
    id: 42,
    loadURL: async (url: string) => {
      calls.push(['loadURL', url]);
    },
    getURL: () => 'https://example.test/page',
    executeJavaScript: async (script: string, userGesture?: boolean) => {
      calls.push(['evaluate', script, userGesture]);
      return 'result';
    },
    capturePage: async () => ({
      toPNG: () => Buffer.from('png-bytes'),
      getSize: () => ({ width: 12, height: 34 }),
    }),
    debugger: {
      sendCommand: async (...args: unknown[]) => {
        calls.push(['cdp', ...args]);
        return { ok: true };
      },
      on: (event: string, handler: (...args: any[]) => void) => {
        listeners.set(event, [...(listeners.get(event) ?? []), handler]);
      },
      removeListener: (event: string, handler: (...args: any[]) => void) => {
        listeners.set(
          event,
          (listeners.get(event) ?? []).filter((entry) => entry !== handler),
        );
      },
    },
    session: {
      cookies: {
        get: async () => [
          {
            name: 'sid',
            value: 'v',
            domain: 'example.test',
            path: '/',
            secure: true,
            httpOnly: true,
            sameSite: 'lax',
            expirationDate: 123,
          },
          { name: 'pref', value: 'x', domain: 'example.test', path: '/', secure: false, httpOnly: false, sameSite: 'no_restriction' },
          { name: 'odd', value: 'y', domain: 'example.test', path: '/', secure: false, httpOnly: false, sameSite: 'unspecified' },
        ],
      },
    },
  };
  return { wc: wc as unknown as WebContents, calls, listeners };
}

test('identifies the target and reports the current url', () => {
  const { wc } = fakeWebContents();
  const target = new ElectronTarget(wc);
  assert.equal(target.id, 'electron:42');
  assert.equal(target.kind, 'electron');
  assert.equal(target.url(), 'https://example.test/page');
  assert.equal(new ElectronTarget(wc, { id: 'tab-1' }).id, 'tab-1');
});

test('navigate and evaluate forward to the webContents', async () => {
  const { wc, calls } = fakeWebContents();
  const target = new ElectronTarget(wc);
  await target.navigate('https://example.test/next');
  assert.equal(await target.evaluate('1+1', { userGesture: true }), 'result');
  assert.deepEqual(calls[0], ['loadURL', 'https://example.test/next']);
  assert.deepEqual(calls[1], ['evaluate', '1+1', true]);
});

test('screenshot returns the png and its size', async () => {
  const shot = await new ElectronTarget(fakeWebContents().wc).screenshot();
  assert.equal(shot.width, 12);
  assert.equal(shot.height, 34);
  assert.equal(Buffer.from(shot.png).toString(), 'png-bytes');
});

test('sendCommand is the CDP passthrough', async () => {
  const { wc, calls } = fakeWebContents();
  const result = await new ElectronTarget(wc).sendCommand('Page.enable', { a: 1 }, 'session-1');
  assert.deepEqual(result, { ok: true });
  assert.deepEqual(calls[0], ['cdp', 'Page.enable', { a: 1 }, 'session-1']);
});

test('input maps to CDP mouse and key events', async () => {
  const { wc, calls } = fakeWebContents();
  const target = new ElectronTarget(wc);
  await target.input({ type: 'mouse', action: 'down', x: 10, y: 20 });
  await target.input({ type: 'key', action: 'char', key: 'a', text: 'a' });
  assert.deepEqual(calls[0], [
    'cdp',
    'Input.dispatchMouseEvent',
    { type: 'mousePressed', x: 10, y: 20, button: 'left', clickCount: 1, modifiers: 0 },
  ]);
  assert.deepEqual(calls[1], [
    'cdp',
    'Input.dispatchKeyEvent',
    { type: 'char', key: 'a', text: 'a', modifiers: 0 },
  ]);
});

test('cookies are mapped to the portable shape', async () => {
  const cookies = await new ElectronTarget(fakeWebContents().wc).cookies();
  assert.equal(cookies.length, 3);
  assert.deepEqual(cookies[0], {
    name: 'sid',
    value: 'v',
    domain: 'example.test',
    path: '/',
    secure: true,
    httpOnly: true,
    sameSite: 'lax',
    expires: 123,
  });
  assert.equal(cookies[1]?.sameSite, 'none');
  assert.equal(cookies[2]?.sameSite, undefined);
});

test('onCdpEvent subscribes, delivers and unsubscribes', () => {
  const { wc, listeners } = fakeWebContents();
  const target = new ElectronTarget(wc);
  const seen: Array<{ method: string; params: Record<string, unknown>; sessionId?: string }> = [];
  const off = target.onCdpEvent((event) => seen.push(event));
  const handler = (listeners.get('message') ?? [])[0];
  assert.ok(handler);
  handler!({}, 'Network.requestWillBeSent', { requestId: 'r1' }, 's1');
  assert.deepEqual(seen, [
    { method: 'Network.requestWillBeSent', params: { requestId: 'r1' }, sessionId: 's1' },
  ]);
  off();
  assert.equal((listeners.get('message') ?? []).length, 0);
});

test('close is a no-op owned by the host', async () => {
  await new ElectronTarget(fakeWebContents().wc).close();
});
