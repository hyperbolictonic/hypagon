import test from 'node:test';
import assert from 'node:assert/strict';

import { DEFAULT_ENGINE_CHAIN, SearchHub, engineHost } from '../src/search/search-engine.ts';

test('engineHost resolves a known engine and a custom template', () => {
  assert.equal(engineHost('duckduckgo', ''), 'html.duckduckgo.com');
  assert.equal(engineHost('google', ''), 'www.google.com');
  assert.equal(engineHost('custom', 'https://searx.local/search?q={query}'), 'searx.local');
  assert.equal(engineHost('custom', ''), '');
  assert.equal(engineHost('nope', ''), '');
});

test('search ranks parsed rows and reports the chosen engine', async () => {
  const loads: string[] = [];
  const hub = new SearchHub({
    load: async (url) => {
      loads.push(url);
      return {
        result: {
          rows: [
            { title: 'First result', url: 'https://a.test/', snippet: 'one' },
            { title: 'Second result', url: 'https://b.test/', snippet: 'two' },
          ],
          blocked: false,
        },
        status: 200,
        contentType: 'text/html',
      };
    },
  });

  const outcome = await hub.search('test query', { engine: 'duckduckgo', max: 1 });
  assert.equal(outcome.engine, 'duckduckgo');
  assert.equal(outcome.results.length, 1);
  assert.deepEqual(outcome.results[0], { rank: 1, title: 'First result', url: 'https://a.test/', snippet: 'one' });
  assert.equal(outcome.attempts.length, 1);
  assert.equal(loads.length, 1);
  assert.ok(loads[0]!.startsWith('https://html.duckduckgo.com/html/?q='));
});

test('a blocked engine falls through to the next one', async () => {
  const tried: string[] = [];
  const hub = new SearchHub({
    load: async (url) => {
      tried.push(url);
      if (url.includes('duckduckgo')) {
        return { result: { rows: [], blocked: true }, status: 200, contentType: 'text/html' };
      }
      return {
        result: { rows: [{ title: 'Brave hit', url: 'https://brave.test/', snippet: 'ok' }], blocked: false },
        status: 200,
        contentType: 'text/html',
      };
    },
  });

  const outcome = await hub.search('q', { engines: ['duckduckgo', 'brave'] });
  assert.equal(outcome.engine, 'brave');
  assert.equal(outcome.blocked, false);
  assert.equal(outcome.results[0]?.title, 'Brave hit');
  assert.deepEqual(
    outcome.attempts.map((attempt) => [attempt.engine, attempt.ok, attempt.blocked]),
    [
      ['duckduckgo', false, true],
      ['brave', true, false],
    ],
  );
  assert.equal(tried.length, 2);
});

test('an unknown engine is reported, not thrown', async () => {
  const hub = new SearchHub({
    load: async () => ({ result: { rows: [], blocked: false }, status: 200, contentType: null }),
  });
  const outcome = await hub.search('q', { engine: 'nope' });
  assert.equal(outcome.engine, 'nope');
  assert.equal(outcome.results.length, 0);
  assert.equal(outcome.attempts[0]?.error, 'unknown engine');
});

test('an empty query and a missing custom template are BAD_REQUEST', async () => {
  const hub = new SearchHub({
    load: async () => ({ result: { rows: [], blocked: false }, status: 200, contentType: null }),
  });
  await assert.rejects(() => hub.search('   '), (error: any) => error.code === 'BAD_REQUEST');
  await assert.rejects(
    () => hub.search('q', { engine: 'custom' }),
    (error: any) => error.code === 'BAD_REQUEST',
  );
});

test('the default chain is the documented fallback order', () => {
  assert.deepEqual(DEFAULT_ENGINE_CHAIN, ['duckduckgo', 'brave', 'google']);
});
