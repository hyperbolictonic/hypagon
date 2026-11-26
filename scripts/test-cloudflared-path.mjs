import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { findCloudflared } from '../src/main/remote/cloudflared.ts';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cloudflared-lookup-'));
after(() => fs.rmSync(dir, { recursive: true, force: true }));

test('an explicit executable is used when it exists', () => {
  const file = path.join(dir, 'explicit-cloudflared');
  fs.writeFileSync(file, '');
  fs.chmodSync(file, 0o755);
  assert.equal(findCloudflared(file), file);
});

test('a missing explicit path is not silently replaced by a PATH hit', () => {
  assert.equal(findCloudflared(path.join(dir, 'missing-cloudflared')), undefined);
});

test('a bare name is resolved through PATH and PATHEXT', { skip: process.platform !== 'win32' }, () => {
  const previousPath = process.env.PATH;
  const previousExt = process.env.PATHEXT;
  try {
    const candidate = path.join(dir, 'cloudflared.custom');
    fs.writeFileSync(candidate, '');
    process.env.PATH = dir;
    process.env.PATHEXT = '.CUSTOM';
    assert.equal(findCloudflared(), candidate);
  } finally {
    process.env.PATH = previousPath;
    process.env.PATHEXT = previousExt;
  }
});

test('a non-executable file is refused on POSIX', { skip: process.platform === 'win32' }, () => {
  const file = path.join(dir, 'plain-cloudflared');
  fs.writeFileSync(file, '');
  fs.chmodSync(file, 0o644);
  assert.equal(findCloudflared(file), undefined);
});
