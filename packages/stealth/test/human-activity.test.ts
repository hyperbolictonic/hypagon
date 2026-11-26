import test from 'node:test';
import assert from 'node:assert/strict';

import {
  HUMAN_CONSOLE_PREFIX,
  HumanActivityMonitor,
  SYNTHETIC_GRACE_MS,
  humanListenerScript,
  shouldCountAsHuman,
} from '../src/input/human-activity.ts';

test('synthetic events inside the grace window are not a human takeover', () => {
  const now = 1_000_000;
  assert.equal(shouldCountAsHuman(true, now, now - 10), false);
  assert.equal(shouldCountAsHuman(true, now, now - SYNTHETIC_GRACE_MS - 1), true);
  assert.equal(shouldCountAsHuman(false, now, now - 10_000), false);
  assert.equal(shouldCountAsHuman(true, Number.NaN, 0), false);
});

test('the monitor parses a human event after the graceful window', () => {
  const monitor = new HumanActivityMonitor();
  const at = Date.now();
  monitor.markSynthetic(at);
  const message = `${HUMAN_CONSOLE_PREFIX}${JSON.stringify({ kind: 'pointer', at: at + SYNTHETIC_GRACE_MS + 5, url: 'https://e/', target: 'button "Go"' })}`;
  const hit = monitor.ingest(message);
  assert.equal(hit?.kind, 'pointer');
  assert.equal(hit?.url, 'https://e/');
  assert.equal(hit?.target, 'button "Go"');
  assert.deepEqual(monitor.getLastHuman(), hit);
});

test('the monitor ignores our own events, malformed payloads and other console lines', () => {
  const monitor = new HumanActivityMonitor();
  const at = Date.now();
  monitor.markSynthetic(at);
  assert.equal(monitor.ingest(`${HUMAN_CONSOLE_PREFIX}${JSON.stringify({ kind: 'key', at })}`), null);
  assert.equal(monitor.ingest(`${HUMAN_CONSOLE_PREFIX}{not json`), null);
  assert.equal(monitor.ingest('ordinary console line'), null);
  assert.equal(monitor.getLastHuman(), null);
});

test('unknown event kinds fall back to pointer and missing fields stay undefined', () => {
  const monitor = new HumanActivityMonitor();
  const at = Date.now();
  monitor.markSynthetic(0);
  const hit = monitor.ingest(`${HUMAN_CONSOLE_PREFIX}${JSON.stringify({ kind: 'mystery', at })}`);
  assert.equal(hit?.kind, 'pointer');
  assert.equal(hit?.url, undefined);
  assert.equal(hit?.target, undefined);
});

test('the listener script is idempotent and reports only trusted events', () => {
  const script = humanListenerScript();
  assert.match(script, /__kuangHumanWired/);
  assert.match(script, /isTrusted !== true/);
  assert.ok(script.includes(JSON.stringify(HUMAN_CONSOLE_PREFIX)));
});
