import test from 'node:test';
import assert from 'node:assert/strict';

import type { BrowserTarget } from '../src/target.ts';
import { captureComposedDom } from '../src/harvester/dom-serializer.ts';
import { ConstructHarvester } from '../src/harvester/markdown.ts';

const ARTICLE = `<!doctype html>
<html><head><title>Fallback title</title></head>
<body><article><h1>Ticket prices</h1><p>${'The fare is fixed. '.repeat(40)}</p>
<p><a href="/next">Continue</a></p></article></body></html>`;

test('harvest converts article HTML into a construct with a resolved base', () => {
  const construct = new ConstructHarvester().harvest(ARTICLE, 'https://example.test/fares', 'Fallback title');
  assert.equal(construct.url, 'https://example.test/fares');
  assert.ok(construct.title.length > 0);
  assert.match(construct.content, /Ticket prices/);
  assert.match(construct.content, /The fare is fixed/);
  assert.ok(construct.estimatedTokens > 0);
  assert.equal(construct.shadowRoots, 0);
});

test('harvest reports the shadow-root count it was given', () => {
  const construct = new ConstructHarvester().harvest(ARTICLE, 'https://example.test/', 'T', { shadowRoots: 3 });
  assert.equal(construct.shadowRoots, 3);
});

test('captureComposedDom evaluates the composed-DOM script through the target', async () => {
  const scripts: string[] = [];
  const target = {
    evaluate: async (script: string) => {
      scripts.push(script);
      return { html: '<body><p>hi</p></body>', shadowRoots: '2' };
    },
  } as unknown as BrowserTarget;

  assert.deepEqual(await captureComposedDom(target), { html: '<body><p>hi</p></body>', shadowRoots: 2 });
  assert.equal(scripts.length, 1);
});

test('captureComposedDom falls back to outerHTML when the composed script fails', async () => {
  let call = 0;
  const target = {
    evaluate: async () => {
      call += 1;
      if (call === 1) throw new Error('script blocked');
      return '<html><body>plain</body></html>';
    },
  } as unknown as BrowserTarget;

  assert.deepEqual(await captureComposedDom(target), {
    html: '<html><body>plain</body></html>',
    shadowRoots: 0,
  });
});
