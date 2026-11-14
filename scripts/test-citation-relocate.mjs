#!/usr/bin/env node
// Citation revalidation regression: anchor -> redesign -> relocate.
//
// Run: node scripts/test-citation-relocate.mjs
// Requires the Cyberdeck app running (bridge on 127.0.0.1:4111); prints SKIP and exits 0 when down.
import http from 'node:http';
import assert from 'node:assert/strict';

const BASE = 'http://127.0.0.1:4111';

const ORIGINAL = `<html><body>
<article class="post">
  <h1>Frostblink Elementalist</h1>
  <p class="gear">Budget gear requires Heatshiver and Berek's Respite to reach four million ignite DPS on a modest budget for this build.</p>
  <p class="notes">Level with rolling magma and switch to the final setup once the required uniques are affordable for the league start.</p>
</article>
</body></html>`;

const CHANGED = `<html><body>
<div class="layout">
  <article class="post redesigned">
    <h1>Frostblink Elementalist</h1>
    <div class="content">
      <p class="intro">Patch notes changed the layout but not the build advice for this league.</p>
    </div>
    <p class="new">Patch 3.26 changed nothing important for this setup.</p>
    <p class="equipment">Budget gear requires Heatshiver and Berek's Respite to reach four million ignite DPS on a modest budget for this build.</p>
    <p class="notes">Level with rolling magma and switch to the final setup once the required uniques are affordable for the league start.</p>
  </article>
</div>
</body></html>`;

const DELETED = CHANGED.replace(/<p class="equipment">[\s\S]*?<\/p>/, '');

const server = http.createServer((req, res) => {
  const body = req.url === '/changed' ? CHANGED : req.url === '/deleted' ? DELETED : ORIGINAL;
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  res.end(body);
});

await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;

async function post(path, body) {
  const response = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`${path} -> HTTP ${response.status}`);
  return response.json();
}

let failures = 0;
const check = (name, ok, detail) => {
  if (ok) console.log(`PASS  ${name}`);
  else {
    failures++;
    console.log(`FAIL  ${name}${detail === undefined ? '' : ` — ${JSON.stringify(detail)}`}`);
  }
};

try {
  const health = await fetch(`${BASE}/health`).catch(() => null);
  if (!health || !health.ok) {
    console.log('SKIP: bridge is not running on 127.0.0.1:4111');
    process.exit(0);
  }

  // 1. Capture an anchor from the original page.
  const crawl = await post('/crawl/deep', {
    url: `${origin}/original`,
    max_depth: 0,
    max_pages: 1,
    harvest_to_cortex: false,
    anchors_for: 'heatshiver berek ignite',
  });
  const anchors = crawl.pages?.[0]?.anchors || [];
  check('crawl captured an anchor', anchors.length > 0, anchors.length);

  const anchor = anchors.find((a) => /Heatshiver/.test(a.text));
  check('anchor points at the gear paragraph', Boolean(anchor), anchors.map((a) => a.text.slice(0, 40)));

  // 2. Relocate after the redesign.
  const changed = await post('/citation/relocate', {
    url: `${origin}/changed`,
    fingerprint: anchor.fingerprint,
  });
  check('relocation succeeds after a redesign', changed.found === true, changed);
  check('relocation score clears the default threshold', (changed.score ?? 0) >= 40, changed.score);
  check('relocated text is the gear paragraph', /Heatshiver/.test(changed.text || ''), changed.text?.slice(0, 60));
  check('relocated path is on the new branch', /layout|article/.test(changed.path || ''), changed.path);

  // 3. A stricter threshold rejects the drift.
  const strict = await post('/citation/relocate', {
    url: `${origin}/changed`,
    fingerprint: anchor.fingerprint,
    threshold: 95,
  });
  check('high threshold rejects the drifted block', strict.found === false, strict.score);

  // 4. A deleted block is not resurrected.
  const deleted = await post('/citation/relocate', {
    url: `${origin}/deleted`,
    fingerprint: anchor.fingerprint,
  });
  check('deleted citation reports not found', deleted.found === false, deleted);
  check('not-found response still ranks candidates', Array.isArray(deleted.candidates) && deleted.candidates.length > 0, deleted.candidates?.length);
} finally {
  server.close();
}

console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
