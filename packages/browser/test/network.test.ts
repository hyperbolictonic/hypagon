import test from 'node:test';
import assert from 'node:assert/strict';

import type { BrowserTarget, CdpEventListener } from '../src/target.ts';
import { TrafficBuffer } from '../src/network/traffic-buffer.ts';
import { StreamMessages } from '../src/network/stream-messages.ts';
import { StreamRegistry } from '../src/network/stream-registry.ts';
import { NetworkEvents } from '../src/network/cdp-events.ts';
import { NetworkInterceptor } from '../src/network/network-interceptor.ts';

test('TrafficBuffer records a request lifecycle, filters and exposes the payload', () => {
  const traffic = new TrafficBuffer();
  traffic.start('r1', { url: 'https://example.test/api', method: 'GET', headers: { accept: '*/*' } }, 'Fetch');
  traffic.responded('r1', { status: 200, statusText: 'OK', mimeType: 'application/json', headers: {} });
  traffic.keepBody('r1', '{"ok":true}', false);

  assert.equal(traffic.has('r1'), true);
  assert.equal(traffic.get('r1')?.status, 200);
  assert.equal(traffic.list({ urlPattern: 'api' }).length, 1);
  assert.equal(traffic.list({ method: 'post' }).length, 0);
  assert.deepEqual(traffic.payload('r1').data, { ok: true });
  assert.equal(traffic.payload('r1').isJson, true);
});

test('TrafficBuffer prunes the oldest request together with its payload', () => {
  const traffic = new TrafficBuffer();
  for (let i = 0; i < 252; i += 1) {
    traffic.start(`r${i}`, { url: `https://example.test/${i}`, method: 'GET' }, 'XHR');
    traffic.keepBody(`r${i}`, String(i), false);
  }
  assert.equal(traffic.has('r0'), false);
  assert.equal(traffic.has('r251'), true);
  assert.throws(() => traffic.payload('r0'));
});

test('StreamRegistry tracks a websocket lifecycle and frame counts', () => {
  const streams = new StreamRegistry();
  streams.openWebSocket('ws1', 'wss://example.test/socket');
  streams.bump('ws1', 'sent');
  streams.bump('ws1', 'received');
  const open = streams.list({ activeOnly: true })[0];
  assert.equal(open?.framesSentCount, 1);
  assert.equal(open?.framesReceivedCount, 1);
  streams.close('ws1');
  assert.equal(streams.list({ activeOnly: true }).length, 0);
  assert.equal(streams.list()[0]?.status, 'closed');
});

test('StreamMessages parses JSON frames and keeps the tail', () => {
  const messages = new StreamMessages();
  messages.record({ streamId: 'ws1', streamType: 'websocket', direction: 'received', data: '{"x":1}' });
  messages.record({ streamId: 'ws1', streamType: 'websocket', direction: 'sent', data: 'plain' });
  const received = messages.list({ direction: 'received' });
  assert.equal(received.length, 1);
  assert.equal(received[0]?.isJson, true);
  assert.deepEqual(received[0]?.jsonData, { x: 1 });
});

test('NetworkEvents routes request, response, body and stream events', async () => {
  const traffic = new TrafficBuffer();
  const streams = new StreamRegistry();
  const messages = new StreamMessages();
  const events = new NetworkEvents({ traffic, streams, messages });
  const target = {
    sendCommand: async (method: string) => (method === 'Network.getResponseBody' ? { body: '{"ok":true}' } : {}),
  } as unknown as BrowserTarget;

  await events.handle(target, 'Network.requestWillBeSent', {
    requestId: 'r1',
    request: { url: 'https://example.test/api', method: 'GET', headers: {} },
    type: 'Fetch',
  });
  await events.handle(target, 'Network.responseReceived', {
    requestId: 'r1',
    response: { status: 200, statusText: 'OK', mimeType: 'application/json', headers: {} },
  });
  await events.handle(target, 'Network.loadingFinished', { requestId: 'r1' });

  assert.equal(traffic.get('r1')?.bodyPreview, '{"ok":true}');
  assert.deepEqual(traffic.payload('r1').data, { ok: true });

  await events.handle(target, 'Network.webSocketCreated', { requestId: 'ws1', url: 'wss://example.test/s' });
  await events.handle(target, 'Network.webSocketFrameReceived', {
    requestId: 'ws1',
    response: { payloadData: '{"tick":1}', opcode: 1 },
  });
  assert.equal(streams.list()[0]?.framesReceivedCount, 1);
  assert.equal(messages.list({ streamId: 'ws1' }).length, 1);

  await events.handle(target, 'Network.eventSourceMessageReceived', {
    requestId: 'sse1',
    eventName: 'update',
    data: 'hello',
  });
  assert.equal(streams.list({ type: 'sse' }).length, 1);
  assert.equal(messages.list({ type: 'sse' })[0]?.eventName, 'update');
});

function fakeTarget(): {
  target: BrowserTarget;
  calls: string[];
  emit: CdpEventListener;
  state: { offEvents: number; offDetach: number; attached: boolean };
} {
  const calls: string[] = [];
  const state = { offEvents: 0, offDetach: 0, attached: false };
  let listener: CdpEventListener = () => undefined;
  const target = {
    id: 'tab-1',
    kind: 'chrome-cdp',
    ensureAttached: () => {
      state.attached = true;
    },
    sendCommand: async (method: string) => {
      calls.push(method);
      return {};
    },
    onCdpEvent: (next: CdpEventListener) => {
      listener = next;
      return () => {
        state.offEvents += 1;
      };
    },
    onDetach: () => () => {
      state.offDetach += 1;
    },
  } as unknown as BrowserTarget;
  return { target, calls, emit: (event) => listener(event), state };
}

test('NetworkInterceptor attaches once per target identity and detaches cleanly', async () => {
  const interceptor = new NetworkInterceptor();
  const first = fakeTarget();

  interceptor.attach(first.target);
  interceptor.attach(first.target);
  assert.equal(first.state.attached, true);
  assert.deepEqual(first.calls, ['Network.enable']);

  first.emit({ method: 'Network.requestWillBeSent', params: { requestId: 'r1', request: { url: 'u', method: 'GET' }, type: 'XHR' } });
  await Promise.resolve();
  assert.equal(interceptor.getTraffic().length, 1);

  interceptor.detach(first.target);
  assert.equal(first.state.offEvents, 1);
  assert.equal(first.state.offDetach, 1);

  // A new adapter object with the same kind:id is still the same target.
  const second = fakeTarget();
  interceptor.attach(second.target);
  interceptor.attach({ ...second.target, id: 'tab-1' });
  assert.deepEqual(second.calls, ['Network.enable']);
});

test('NetworkInterceptor ignores non-network CDP events', async () => {
  const interceptor = new NetworkInterceptor();
  const { target, emit } = fakeTarget();
  interceptor.attach(target);
  emit({ method: 'Page.frameNavigated', params: {} });
  await Promise.resolve();
  assert.equal(interceptor.getTraffic().length, 0);
});
