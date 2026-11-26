import test from 'node:test';
import assert from 'node:assert/strict';

import { domainMatches, scriptId } from '../src/main/cortex/script-identity.ts';

test('ids are stable for the same exact name', () => {
  assert.equal(scriptId('sale alert'), scriptId('sale alert'));
});

test('names that sanitize alike get different ids', () => {
  assert.notEqual(scriptId('sale alert'), scriptId('sale-alert'));
  assert.notEqual(scriptId('a b'), scriptId('a_b'));
});

test('ids stay filesystem and filter friendly', () => {
  assert.match(scriptId('Sale Alert! / v2'), /^script_[a-z0-9_-]+_[0-9a-f]{8}$/);
});

test('domain filter matches exact, www and subdomains', () => {
  assert.equal(domainMatches('example.com', 'example.com'), true);
  assert.equal(domainMatches('www.example.com', 'example.com'), true);
  assert.equal(domainMatches('docs.example.com', 'example.com'), true);
  assert.equal(domainMatches('example.com', 'docs.example.com'), true);
  assert.equal(domainMatches('https://docs.example.com/path', 'example.com'), true);
});

test('domain filter rejects lookalikes', () => {
  assert.equal(domainMatches('notexample.com', 'example.com'), false);
  assert.equal(domainMatches('example.com.evil', 'example.com'), false);
  assert.equal(domainMatches('example.co', 'example.com'), false);
});

test('wildcard and legacy rows match everything', () => {
  assert.equal(domainMatches('*', 'example.com'), true);
  assert.equal(domainMatches('example.com', '*'), true);
  assert.equal(domainMatches('', 'example.com'), true);
});
