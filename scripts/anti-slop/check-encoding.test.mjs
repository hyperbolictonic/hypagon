/**
 * Tests for the encoding guard: mojibake detection, the cp1252->UTF-8
 * reverse repair, BOM detection, and the PowerShell round-trip failure mode
 * that motivated the gate.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import {
  isSuspectMojibake, repairDoubleEncodedUtf8, hasUtf8Bom, utf8ToCp1252String,
  hasCorruptionMarkers,
} from './check-encoding.mjs';

test('cp1252 table: undefined slots stay in place (regression: box-drawing -> control pictures)', () => {
  // ├ is E2 94 9C; CP1252 0x94 is U+201D and 0x9C is U+0153.
  assert.equal(utf8ToCp1252String('\u251C'), '\u00E2\u201D\u0153');
  assert.equal(utf8ToCp1252String('\u2514'), '\u00E2\u201D\u201D'); // └ = E2 94 94
  // — is E2 80 94: the canonical three-character mojibake (a-circumflex,
  // euro sign, right double quote).
  assert.equal(utf8ToCp1252String('\u2014'), '\u00E2\u20AC\u201D');
  // The repair must give back the original characters, never the control
  // pictures (U+2418 U+2400 U+2400) that a compacted table produced.
  const corruptedTree = utf8ToCp1252String('\u251C\u2500\u2500');
  assert.equal(repairDoubleEncodedUtf8(corruptedTree), '\u251C\u2500\u2500');
  assert.notEqual(repairDoubleEncodedUtf8(corruptedTree), '\u2418\u2400\u2400');
  assert.equal(repairDoubleEncodedUtf8(utf8ToCp1252String('\u2014')), '\u2014');
});

test('hasCorruptionMarkers: control pictures, invisible marks and lost bytes fail', () => {
  assert.ok(hasCorruptionMarkers('\u2418\u2400\u2400 manifest.json')); // botched-repair debris
  assert.ok(hasCorruptionMarkers('required \u200F selects')); // RLM from a mangled dash
  assert.ok(hasCorruptionMarkers('lost \uFFFD byte'));
  assert.ok(hasCorruptionMarkers('\u0081')); // C1 control
  assert.ok(!hasCorruptionMarkers('\u251C\u2500\u2500 clean tree \u2014 em dash'));
  assert.ok(!hasCorruptionMarkers('caf\u00E9 \u2014 na\u00EFve \u2014 \u65E5\u672C\u8A9E'));
});

test('repairDoubleEncodedUtf8: corrupt-marker text is not "repairable"', () => {
  // Each char is valid UTF-8 already; the cp1252 reverse cannot map it.
  assert.equal(repairDoubleEncodedUtf8('\u2418\u2400\u2400'), null);
});

test('isSuspectMojibake: detects the UTF-8-as-CP1252 signatures', () => {
  const corrupted = utf8ToCp1252String('├── manifest.json — required');
  assert.ok(isSuspectMojibake(corrupted));
  assert.ok(isSuspectMojibake(utf8ToCp1252String('évidence — café')));
  assert.ok(isSuspectMojibake(utf8ToCp1252String("doesn't — it's")));
});

test('isSuspectMojibake: clean text and legit unicode pass', () => {
  assert.ok(!isSuspectMojibake('plain ASCII text'));
  assert.ok(!isSuspectMojibake('├── manifest.json — selects and configures')); // legit box-drawing
  assert.ok(!isSuspectMojibake('café — naïve — 日本語')); // legit accents + CJK
  assert.ok(!isSuspectMojibake('the gateâs own source')); // standalone â is not a signature
});

test('repairDoubleEncodedUtf8: reverses the round-trip exactly', () => {
  const original = '├── manifest.json — required — évidence — café';
  const corrupted = utf8ToCp1252String(original);
  assert.ok(isSuspectMojibake(corrupted));
  const repaired = repairDoubleEncodedUtf8(corrupted);
  assert.equal(repaired, original);
});

test('repairDoubleEncodedUtf8: mixed-state file (partly clean) returns null', () => {
  const mixed = 'clean — text\n' + utf8ToCp1252String('mojibake — here'); // a real em-dash can't reverse to a single cp1252 byte cleanly
  assert.equal(repairDoubleEncodedUtf8(mixed), null);
});

test('hasUtf8Bom: detects and rejects BOM', () => {
  assert.ok(hasUtf8Bom('\uFEFF# Header'));
  assert.ok(!hasUtf8Bom('# Header'));
});

const GATE = fileURLToPath(new URL('./check-encoding.mjs', import.meta.url));

test('gate: the corruption shipped in v0.1.10 (control pictures) fails loudly', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'antislop-enc-'));
  writeFileSync(
    path.join(dir, 'README.md'),
    'presets/<name>/\n\u2418\u2400\u2400 manifest.json     required \u2010 selects\n',
  );
  const run = spawnSync(process.execPath, [GATE], { cwd: dir, encoding: 'utf8' });
  assert.equal(run.status, 1);
  assert.match(run.stdout + run.stderr, /BROKEN \(corrupt markers/);
  rmSync(dir, { recursive: true, force: true });
});

test('gate: clean UTF-8 docs with real box-drawing and dashes pass', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'antislop-enc-'));
  writeFileSync(
    path.join(dir, 'README.md'),
    'presets/<name>/\n\u251C\u2500\u2500 manifest.json     required \u2014 selects\n',
  );
  const run = spawnSync(process.execPath, [GATE], { cwd: dir, encoding: 'utf8' });
  assert.equal(run.status, 0);
  assert.match(run.stdout, /\[ok\] Encoding check passed/);
  rmSync(dir, { recursive: true, force: true });
});

test('gate: build output (dist-electron) is skipped, source corruption still fails', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'antislop-enc-'));
  mkdirSync(path.join(dir, 'src'), { recursive: true });
  mkdirSync(path.join(dir, 'dist-electron', 'main'), { recursive: true });
  writeFileSync(path.join(dir, 'src', 'clean.ts'), 'export const x = 1;\n');
  writeFileSync(path.join(dir, 'dist-electron', 'main', 'bundle.js'), 'var s = "\uFFFD";\n');

  const clean = spawnSync(process.execPath, [GATE], { cwd: dir, encoding: 'utf8' });
  assert.equal(clean.status, 0, clean.stderr);

  writeFileSync(path.join(dir, 'src', 'clean.ts'), 'export const x = "\uFFFD";\n');
  const broken = spawnSync(process.execPath, [GATE], { cwd: dir, encoding: 'utf8' });
  assert.equal(broken.status, 1);
  assert.match(broken.stdout, /BROKEN .*: src\/clean\.ts/);
  rmSync(dir, { recursive: true, force: true });
});

test('gate: encoding.ignorePaths exempts and names the globs', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'antislop-enc-'));
  mkdirSync(path.join(dir, 'generated'), { recursive: true });
  writeFileSync(path.join(dir, 'generated', 'bad.md'), 'lost \uFFFD byte\n');
  writeFileSync(
    path.join(dir, 'anti-slop.config.json'),
    JSON.stringify({ encoding: { ignorePaths: ['generated/**'] } }),
  );
  const run = spawnSync(process.execPath, [GATE], { cwd: dir, encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stdout, /Ignoring 1 file\(s\) matching encoding\.ignorePaths/);
  rmSync(dir, { recursive: true, force: true });
});

test('gate: --help prints usage instead of starting a scan', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'antislop-enc-'));
  const run = spawnSync(process.execPath, [GATE, '--help'], { cwd: dir, encoding: 'utf8' });
  assert.equal(run.status, 0);
  assert.match(run.stdout, /Usage: node check-encoding\.mjs/);
  assert.match(run.stdout, /encoding" section/);
  rmSync(dir, { recursive: true, force: true });
});

test('gate: .opencode skills are scanned (they are products, not tooling)', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'antislop-enc-'));
  mkdirSync(path.join(dir, '.opencode', 'skills', 'x'), { recursive: true });
  writeFileSync(path.join(dir, '.opencode', 'skills', 'x', 'SKILL.md'), 'clean text\n');
  const clean = spawnSync(process.execPath, [GATE], { cwd: dir, encoding: 'utf8' });
  assert.equal(clean.status, 0, clean.stderr);

  writeFileSync(path.join(dir, '.opencode', 'skills', 'x', 'SKILL.md'), 'rule \uFFFD broken\n');
  const broken = spawnSync(process.execPath, [GATE], { cwd: dir, encoding: 'utf8' });
  assert.equal(broken.status, 1);
  assert.match(broken.stdout, /\.opencode\/skills\/x\/SKILL\.md/);
  rmSync(dir, { recursive: true, force: true });
});
