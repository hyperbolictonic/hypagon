import test from 'node:test';
import assert from 'node:assert/strict';

import { PrimitiveError, type PrimitivesHost } from '../src/primitives/contracts.ts';
import { NetController } from '../src/primitives/net-controller.ts';
import { PageReadFunnel } from '../src/primitives/read-funnel.ts';

function host(overrides: Partial<PrimitivesHost> = {}): PrimitivesHost {
  return {
    evaluate: async () => ({}),
    getPageInfo: () => ({ url: 'https://example.test/', title: 'Example', isLoading: false }),
    getNetworkTraffic: () => [],
    ...overrides,
  } as unknown as PrimitivesHost;
}

test('exportHar records the host identity and maps requests', () => {
  const net = new NetController(
    host({
      appIdentity: () => ({ name: 'Host Deck', version: '9.9.9' }),
      getNetworkTraffic: () => [
        {
          requestTime: 1000,
          method: 'GET',
          url: 'https://example.test/api',
          status: 200,
          responseHeaders: { 'content-type': 'application/json' },
          requestHeaders: { accept: '*/*' },
          mimeType: 'application/json',
          bodyPreview: '{"ok":true}',
        },
      ],
    }),
  );
  const har = net.exportHar();
  assert.deepEqual(har.log.creator, { name: 'Host Deck', version: '9.9.9' });
  assert.equal(har.log.entries.length, 1);
  assert.equal(har.log.entries[0].request.method, 'GET');
  assert.equal(har.log.entries[0].response.status, 200);
  assert.equal(har.log.entries[0].response.content.text, '{"ok":true}');
});

test('exportHar falls back to a neutral creator when the host gives none', () => {
  const har = new NetController(host()).exportHar();
  assert.deepEqual(har.log.creator, { name: 'Hypagon Browser', version: '0.0.0' });
});

test('trafficSince filters by request time and clamps the limit', () => {
  const net = new NetController(
    host({
      getNetworkTraffic: () => [
        { requestTime: 5, url: 'a' },
        { requestTime: 10, url: 'b' },
        { requestTime: 15, url: 'c' },
      ],
    }),
  );
  assert.deepEqual(net.trafficSince(10).map((r) => r.url), ['b', 'c']);
  assert.deepEqual(net.trafficSince(0, undefined, 2).map((r) => r.url), ['a', 'b']);
});

test('precheck refuses a blocked read with JEV_REQUIRED and the refusal detail', async () => {
  const funnel = new PageReadFunnel(
    host({
      precheckPageRead: async () => ({ blocked: true, refusal: { page: { url: 'u', tokens: 9000, sections: 3 } } }),
    }),
  );
  await assert.rejects(
    () => funnel.precheck('text', {}),
    (error: unknown) => {
      assert.ok(error instanceof PrimitiveError);
      assert.equal(error.code, 'JEV_REQUIRED');
      assert.deepEqual(error.detail, { page: { url: 'u', tokens: 9000, sections: 3 } });
      return true;
    },
  );
});

test('check returns the released-read note and refuses a denied read', () => {
  const note = new PageReadFunnel(
    host({ guardPageRead: () => ({ allowed: true, reason: 'repeat', note: 'released once' }) }),
  ).check('markdown', { url: 'u', title: 't' }, 'body', {});
  assert.equal(note, 'released once');

  const refusing = new PageReadFunnel(
    host({ guardPageRead: () => ({ allowed: false, reason: 'too big', refusal: { page: { url: 'u', tokens: 1, sections: 1 } } }) }),
  );
  assert.throws(
    () => refusing.check('text', { url: 'u', title: 't' }, 'body', {}),
    (error: unknown) => error instanceof PrimitiveError && error.code === 'JEV_REQUIRED',
  );
});

test('check is a no-op when the host has no guard', () => {
  assert.equal(new PageReadFunnel(host()).check('text', { url: 'u', title: 't' }, 'body', {}), undefined);
});
