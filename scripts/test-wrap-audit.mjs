import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { WrapAuditLog } from '../src/main/wrap/audit.ts';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wrap-audit-'));
const file = path.join(dir, 'audit.jsonl');
const log = new WrapAuditLog(file);

after(() => fs.rmSync(dir, { recursive: true, force: true }));

test('append and list return the newest entries', () => {
  log.append({ wrapper: 'a', host: 'a.test', method: 'GET', ok: true });
  log.append({ wrapper: 'b', host: 'b.test', method: 'POST', ok: false, code: 'HTTP_ERROR' });
  const rows = log.list(2);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].wrapper, 'a');
  assert.equal(rows[1].wrapper, 'b');
  assert.match(rows[0].at, /^\d{4}-\d{2}-\d{2}T/);
});

test('a missing file lists nothing', () => {
  assert.deepEqual(new WrapAuditLog(path.join(dir, 'missing.jsonl')).list(), []);
});

test('the active file rotates at the cap and keeps the previous segment', () => {
  fs.writeFileSync(file, 'x'.repeat(1_000_100));
  log.append({ wrapper: 'after', host: 'after.test', method: 'GET', ok: true });
  assert.ok(fs.existsSync(`${file}.1`));
  assert.ok(fs.statSync(`${file}.1`).size >= 1_000_000);
  assert.ok(fs.statSync(file).size < 10_000);
  assert.equal(log.list(1)[0].wrapper, 'after');
});

test('list reads only the tail of a large file', () => {
  fs.writeFileSync(file, `${'y'.repeat(700_000)}\n`);
  log.append({ wrapper: 'one', host: 'one.test', method: 'GET', ok: true });
  log.append({ wrapper: 'two', host: 'two.test', method: 'GET', ok: true });
  assert.deepEqual(log.list(2).map((row) => row.wrapper), ['one', 'two']);
});
