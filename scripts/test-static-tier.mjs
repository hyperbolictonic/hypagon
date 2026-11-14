// Static tier regression: impersonating fetch, challenge detection, render escalation.
//
// Run: node scripts/test-static-tier.mjs
import assert from 'node:assert/strict';
import { createServer } from 'node:http';

import { Crawler } from '../src/main/crawl/crawler.ts';
import { fetchStatic, impersonateAvailable, isChallenge, hostPlatformHeaders } from '../src/main/network/impersonate.ts';

if (!impersonateAvailable()) {
  console.error('SKIP: curl-impersonate binary is not installed');
  process.exit(1);
}

const ARTICLE = 'Real content about widgets and their prices. '.repeat(20);
const routes = {
  '/static': {
    status: 200,
    body: `<html><head><title>Static</title></head><body><article><h1>Static page</h1><p>${ARTICLE}</p><a href="/next">next</a></article></body></html>`,
  },
  '/blocked': {
    status: 403,
    body: '<html><body>Just a moment... cf-chl challenge-platform</body></html>',
  },
  '/spa': {
    status: 200,
    body: '<html><body><div id="root"></div><script>app()</script></body></html>',
  },
};

const server = createServer((request, response) => {
  const route = routes[request.url] ?? { status: 404, body: 'not found' };
  response.writeHead(route.status, { 'content-type': 'text/html; charset=utf-8' });
  response.end(route.body);
});

await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;

let failures = 0;
const check = (name, condition, detail) => {
  if (condition) console.log(`PASS  ${name}`);
  else {
    failures++;
    console.log(`FAIL  ${name}${detail === undefined ? '' : ` — ${JSON.stringify(detail)}`}`);
  }
};

try {
  // 1. Transport level.
  const ok = await fetchStatic(`${base}/static`);
  check('static fetch returns 200', ok.kind === 'ok' && ok.result.status === 200, ok.kind);
  check('static fetch returns the HTML body', ok.kind === 'ok' && /Static page/.test(ok.result.body));

  const blocked = await fetchStatic(`${base}/blocked`);
  check('403 is treated as a challenge', blocked.kind === 'blocked', blocked);

  check(
    'cloudflare interstitial detected',
    isChallenge(200, { server: 'cloudflare' }, '<title>Just a moment...</title>'),
  );
  check(
    'a legit page mentioning captcha is not a challenge',
    !isChallenge(200, { server: 'nginx' }, 'This article explains how captcha works.'),
  );

  const hostHeaders = hostPlatformHeaders('152');
  const expectedPlatform =
    process.platform === 'win32'
      ? '"Windows"'
      : process.platform === 'darwin'
        ? '"macOS"'
        : '"Linux"';
  check(
    'host platform is reflected in the headers',
    hostHeaders['sec-ch-ua-platform'] === expectedPlatform,
    hostHeaders,
  );
  check(
    'user agent matches the host OS, not the profile platform',
    process.platform === 'win32'
      ? /Windows NT 10\.0/.test(hostHeaders['user-agent'])
      : process.platform === 'darwin'
        ? /Macintosh/.test(hostHeaders['user-agent'])
        : /X11; Linux/.test(hostHeaders['user-agent']),
    hostHeaders['user-agent'],
  );
  check(
    'user agent carries the profile Chrome major',
    hostHeaders['user-agent'].includes('Chrome/152.0.0.0'),
    hostHeaders['user-agent'],
  );

  // 2. Crawler tier: same policy the chassis applies.
  const crawler = new Crawler({
    fetchStatic: async (url) => {
      const outcome = await fetchStatic(url);
      if (outcome.kind !== 'ok' || outcome.result.status >= 400) {
        return { ok: false, reason: outcome.kind === 'ok' ? `HTTP ${outcome.result.status}` : outcome.reason };
      }
      const text = outcome.result.body.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      if (text.length < 200) return { ok: false, reason: 'content too thin (possible JS-only shell)' };
      return { ok: true, title: 'static', markdown: text, status: outcome.result.status };
    },
    renderPage: async () => ({
      title: 'rendered',
      markdown: 'rendered content '.repeat(30),
      links: [],
      status: 200,
    }),
    log: () => {},
  });

  const crawl = (path) =>
    crawler.crawl({
      startUrl: `${base}${path}`,
      maxDepth: 0,
      maxPages: 1,
      preferLlm: false,
      delayMs: 0,
      harvestToCortex: false,
    });

  const staticPage = await crawl('/static');
  check('simple page uses the static tier', staticPage.pages[0]?.via === 'static', staticPage.pages[0]);

  const blockedPage = await crawl('/blocked');
  check('challenge escalates to render', blockedPage.pages[0]?.via === 'render', blockedPage.pages[0]);

  const spaPage = await crawl('/spa');
  check('JS-only shell escalates to render', spaPage.pages[0]?.via === 'render', spaPage.pages[0]);
} finally {
  await new Promise((resolve) => server.close(resolve));
}

console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
