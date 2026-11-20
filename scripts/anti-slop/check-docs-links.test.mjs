/**
 * Tests for the docs link checker: GitHub-style slugs, local-disk reference
 * rejection, repo-root escape rejection, and anchor validation (regression:
 * CRLF files made headingSlugs return nothing because '.' does not match \r
 * and '$' does not match before it — fixed by splitting on /\r?\n/).
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  githubSlug, headingSlugs, checkMarkdown, repoMarkdownFiles,
} from './check-docs-links.mjs';

test('githubSlug: matches GitHub anchor conventions', () => {
  assert.equal(githubSlug('Quick start'), 'quick-start');
  assert.equal(
    githubSlug("What counts as duplication — and what doesn't"),
    'what-counts-as-duplication--and-what-doesnt',
  );
  assert.equal(githubSlug('Tuning per repo: `anti-slop.config.json`'), 'tuning-per-repo-anti-slopconfigjson');
  assert.equal(githubSlug("What's inside"), 'whats-inside');
});

test('githubSlug regression: CRLF input via headingSlugs is covered separately', () => {
  // The CRLF regression lives in the headingSlugs test below.
});

test('headingSlugs: CRLF files are handled (regression: 0 slugs on Windows docs)', () => {
  const slugs = headingSlugs('## Quick start\r\n\r\n## The problem\r\n');
  assert.equal(slugs.size, 2);
  assert.ok(slugs.has('quick-start'));
  assert.ok(slugs.has('the-problem'));
});

test('headingSlugs: fenced pseudo-headings are ignored', () => {
  const slugs = headingSlugs('## Real\n\n```\n## Fake in a fence\n```\n');
  assert.deepEqual([...slugs], ['real']);
});

function fixture(docs) {
  const dir = mkdtempSync(path.join(tmpdir(), 'antislop-links-'));
  for (const [rel, content] of Object.entries(docs)) {
    const full = path.join(dir, rel);
    mkdirSync(path.dirname(full), { recursive: true });
    writeFileSync(full, content);
  }
  return dir;
}

test('checkMarkdown: local-disk references are rejected', () => {
  const dir = fixture({ 'README.md': '[x](C:\\repo\\secret.md) and [y](file:///etc/passwd)' });
  const problems = checkMarkdown(path.join(dir, 'README.md'), dir);
  assert.equal(problems.filter((p) => p.reason === 'local-disk').length, 2);
  rmSync(dir, { recursive: true, force: true });
});

test('checkMarkdown: links escaping the repo root are rejected', () => {
  const dir = fixture({ 'docs/x.md': '[outside](../../secrets.md)' });
  const problems = checkMarkdown(path.join(dir, 'docs', 'x.md'), dir);
  assert.equal(problems.filter((p) => p.reason === 'escapes-root').length, 1);
  rmSync(dir, { recursive: true, force: true });
});

test('checkMarkdown: good relative links and anchors pass', () => {
  const dir = fixture({
    'README.md': '## intro\n\n[guide](presets/README.md#lifecycle) and [toc](#intro)',
    'presets/README.md': '## Lifecycle\n\n[plain link](../README.md)',
  });
  const problems = checkMarkdown(path.join(dir, 'README.md'), dir);
  assert.deepEqual(problems, []);
  rmSync(dir, { recursive: true, force: true });
});

test('checkMarkdown: missing target and stale anchor are flagged', () => {
  const dir = fixture({ 'README.md': '[gone](nope.md) and [stale](#no-such-heading)' });
  const problems = checkMarkdown(path.join(dir, 'README.md'), dir);
  assert.deepEqual(problems.map((p) => p.reason).sort(), ['missing-anchor', 'missing-target']);
  rmSync(dir, { recursive: true, force: true });
});

test('repoMarkdownFiles: skips tooling dirs, includes nested docs', () => {
  const dir = fixture({
    'README.md': 'x',
    'presets/README.md': 'x',
    'data/logs/x.md': 'x',
    'node_modules/pkg/x.md': 'x',
  });
  const rels = repoMarkdownFiles(dir).map((f) => f.rel);
  assert.deepEqual(rels.sort(), ['presets/README.md', 'README.md'].sort());
  rmSync(dir, { recursive: true, force: true });
});
