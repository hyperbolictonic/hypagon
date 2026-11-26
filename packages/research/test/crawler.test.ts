import test from 'node:test';
import assert from 'node:assert/strict';

import {
  Crawler,
  linksFromMarkdown,
  matchesAnyPattern,
  normalizeUrl,
  type CrawlerDeps,
} from '../src/crawl/crawler.ts';

test('normalizeUrl drops the fragment and keeps the rest', () => {
  assert.equal(normalizeUrl('https://example.test/a?x=1#frag'), 'https://example.test/a?x=1');
  assert.equal(normalizeUrl('not a url'), 'not a url');
});

test('matchesAnyPattern supports globs, full URLs and /regex/', () => {
  assert.equal(matchesAnyPattern('https://example.test/docs/a', ['/docs/*']), true);
  assert.equal(matchesAnyPattern('https://example.test/blog/a', ['/docs/*']), false);
  assert.equal(matchesAnyPattern('https://example.test/blog/a', ['https://example.test/blog/**']), true);
  assert.equal(matchesAnyPattern('https://example.test/blog/a', ['/\\/blog\\//']), true);
  assert.equal(matchesAnyPattern('https://example.test/', []), true);
});

test('linksFromMarkdown resolves, dedupes and skips non-http links', () => {
  const markdown = [
    '[A](/a)',
    '[A again](/a#x)',
    '[B](https://other.test/b)',
    '[Mail](mailto:x@y.test)',
    '[Script](javascript:void(0))',
  ].join('\n');
  assert.deepEqual(linksFromMarkdown(markdown, 'https://example.test/start'), [
    'https://example.test/a',
    'https://other.test/b',
  ]);
});

test('the crawler follows same-origin links breadth-first and respects depth', async () => {
  const seen: string[] = [];
  const deps: CrawlerDeps = {
    renderPage: async (url) => {
      seen.push(url);
      if (url === 'https://example.test/') {
        return {
          title: 'Home',
          markdown: '[A](/a) [B](/b) [Other](https://other.test/x)',
          links: ['https://example.test/a', 'https://example.test/b', 'https://other.test/x'],
          status: 200,
        };
      }
      return { title: url, markdown: 'leaf', links: [], status: 200 };
    },
  };

  const outcome = await new Crawler(deps).crawl({
    startUrl: 'https://example.test/',
    maxDepth: 1,
    maxPages: 5,
    preferLlm: false,
    preferStatic: false,
    delayMs: 0,
  });

  assert.equal(outcome.pageCount, 3);
  assert.equal(outcome.depthReached, 1);
  assert.deepEqual(
    outcome.pages.map((page) => page.url),
    ['https://example.test/', 'https://example.test/a', 'https://example.test/b'],
  );
  assert.equal(seen.length, 3);
});

test('the page budget truncates with a note', async () => {
  const deps: CrawlerDeps = {
    renderPage: async (url) => ({
      title: url,
      markdown: '',
      links: url === 'https://example.test/' ? ['https://example.test/a', 'https://example.test/b'] : [],
      status: 200,
    }),
  };
  const outcome = await new Crawler(deps).crawl({
    startUrl: 'https://example.test/',
    maxDepth: 2,
    maxPages: 1,
    preferLlm: false,
    preferStatic: false,
    delayMs: 0,
  });
  assert.equal(outcome.pageCount, 1);
  assert.equal(outcome.truncated, true);
  assert.match(outcome.notes.join(' '), /page budget/);
});

test('a non-http start URL is BAD_REQUEST', async () => {
  await assert.rejects(
    () => new Crawler({ renderPage: async () => ({ title: '', markdown: '', links: [], status: 200 }) }).crawl({ startUrl: 'file:///x' }),
    (error: any) => error.code === 'BAD_REQUEST',
  );
});
