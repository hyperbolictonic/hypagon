// Research event contract: the agent must see tier escalations, not just the UI.
//
// Run: node --test scripts/test-research-events.mjs
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { Researcher } from '../src/main/research/researcher.ts';

function fakeResearcher(events) {
  return new Researcher({
    search: async () => ({
      engine: 'test',
      results: [
        { rank: 1, title: 'A', url: 'https://a.test/1', snippet: 's1' },
        { rank: 2, title: 'B', url: 'https://b.test/2', snippet: 's2' },
      ],
      attempts: [],
      blocked: false,
    }),
    crawl: async (opts) => {
      const escalated = opts.startUrl.includes('a.test');
      return {
        startUrl: opts.startUrl,
        pages: [
          {
            url: opts.startUrl,
            title: 'T',
            depth: 0,
            via: escalated ? 'render' : 'static',
            bytes: 100,
            links: 0,
            indexed: true,
            escalation: escalated
              ? { from: 'static', to: 'render', reason: 'challenge page (403)' }
              : undefined,
            excerpt:
              'Widget content with enough words to score a highlight. '.repeat(4),
          },
        ],
        pageCount: 1,
        depthReached: 0,
        cortexIndexed: 1,
        sameOrigin: true,
        truncated: false,
        notes: [],
      };
    },
    events: (event) => events.push(event),
    log: () => {},
  });
}

test('emits the run lifecycle in order', async () => {
  const events = [];
  const outcome = await fakeResearcher(events).research({ query: 'widget', maxSources: 2 });

  assert.deepEqual(
    events.map((event) => event.type),
    [
      'run-start',
      'search-done',
      'source-start',
      'source-done',
      'source-start',
      'source-done',
      'run-done',
    ],
  );

  assert.equal(outcome.runId.length > 0, true);
  assert.equal(outcome.sourceCount, 2);
  assert.equal(outcome.cortexIndexed, 2);
});

test('escalation is visible to the agent, not just in the log', async () => {
  const events = [];
  const outcome = await fakeResearcher(events).research({ query: 'widget', maxSources: 2 });

  assert.equal(outcome.escalations, 1);
  const escalated = outcome.sources.find((source) => source.escalation);
  assert.ok(escalated, 'outcome carries the escalation');
  assert.equal(escalated.escalation.from, 'static');
  assert.equal(escalated.escalation.to, 'render');
  assert.match(escalated.escalation.reason, /challenge/);
  assert.equal(escalated.via, 'render');

  assert.ok(
    outcome.notes.some((note) => /rendered after a cheaper tier failed/.test(note)),
    'notes warn the caller about rendered sources',
  );

  const event = events.find((entry) => entry.type === 'source-done' && entry.escalation);
  assert.ok(event, 'source-done event carries the escalation');

  const done = events.find((entry) => entry.type === 'run-done');
  assert.equal(done.escalations, 1);
});
