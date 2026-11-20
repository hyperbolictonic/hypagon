#!/usr/bin/env node
/**
 * check-encoding.mjs
 *
 * Encoding guard for the repo's text files. Fails when any text file is
 * double-encoded UTF-8 ("mojibake": UTF-8 bytes misread as Windows-1252 and
 * re-saved — the signature artifact of PowerShell 5.1 Get-Content/Set-Content
 * round-trips on UTF-8 files), carries a UTF-8 BOM, or carries corruption
 * that is still valid UTF-8 and therefore invisible: control pictures
 * (U+2400-U+243F, the debris of a botched mojibake repair), LRM/RLM marks,
 * U+FFFD replacement characters, C1 controls.
 *
 * The suspect patterns are built at RUNTIME from code points and the CP1252
 * table — this source must never contain the sequences it detects, or it
 * would flag itself.
 *
 * Zero dependencies. Only runs when executed directly.
 *
 * Usage: node scripts/anti-slop/check-encoding.mjs [--root .]
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const TEXT_EXT = /\.(md|mjs|json|ts|tsx|js|jsx|mts|cjs|txt|yml|yaml)$/;

/**
 * Windows-1252 mapping for bytes 0x80-0x9F. The five undefined slots
 * (0x81, 0x8D, 0x8F, 0x90, 0x9D) are null and MUST stay in place: a
 * compacted table shifts every mapping above the missing slot. That is how
 * an earlier repair turned a box-drawing "├──" into control pictures
 * (U+2418 U+2400 U+2400) and em-dashes into U+2010 hyphens — silently,
 * because the result was still valid UTF-8.
 */
const CP1252_HIGH = [
  '\u20AC', null,     '\u201A', '\u0192', '\u201E', '\u2026', '\u2020', '\u2021',
  '\u02C6', '\u2030', '\u0160', '\u2039', '\u0152', null,     '\u017D', null,
  null,     '\u2018', '\u2019', '\u201C', '\u201D', '\u2022', '\u2013', '\u2014',
  '\u02DC', '\u2122', '\u0161', '\u203A', '\u0153', null,     '\u017E', '\u0178',
];
const CP1252_CHARS = CP1252_HIGH.filter(Boolean);

// Suspect sequences, built from code points so this source file stays clean:
//   E2 + high-char  -> UTF-8 lead byte E2 (—, “, ”, …, box-drawing) misread
//   C3 + letter     -> UTF-8 lead byte C3 (é, è, ñ, …) misread
//   C2 + high-char  -> UTF-8 lead byte C2 (¡, £, ©, …) misread
const E2 = '\u00E2';
const C3 = '\u00C3';
const C2 = '\u00C2';
const SUSPECT_RE = new RegExp(
  `${E2}[${CP1252_CHARS.join('')}]` +
  `|${C3}[a-z]` +
  `|${C2}[${CP1252_CHARS.join('')}]`,
);

// Corruption that survives (or results from) a bad repair and is still valid
// UTF-8: control pictures U+2400-U+243F stand in for box-drawing characters,
// U+200E/U+200F are invisible LRM/RLM marks (a mangled en/em dash), U+FFFD is
// a lost byte, and C1 controls never belong in source or docs.
const BROKEN_MARKERS_RE = /[\u2400-\u243F\u200E\u200F\uFFFD\u0080-\u009F]/;

/** True when text carries the classic UTF-8-as-CP1252 mojibake signatures. */
export function isSuspectMojibake(text) {
  return SUSPECT_RE.test(text);
}

/**
 * True when text carries corruption that is still valid UTF-8: control
 * pictures, invisible LRM/RLM marks, replacement characters, C1 controls.
 * These are invisible or plausible-looking, so only an explicit check catches
 * them.
 */
export function hasCorruptionMarkers(text) {
  return BROKEN_MARKERS_RE.test(text);
}

/**
 * Simulate the PowerShell failure for tests: decode UTF-8 bytes as CP1252.
 * (PS 5.1 Get-Content without -Encoding does exactly this.)
 */
export function utf8ToCp1252String(text) {
  return Buffer.from(text, 'utf8').toString('latin1')
    .split('')
    .map((ch) => {
      const code = ch.charCodeAt(0);
      return code >= 0x80 && code <= 0x9F ? (CP1252_HIGH[code - 0x80] ?? ch) : ch;
    })
    .join('');
}

function cp1252Reverse(ch) {
  const idx = CP1252_HIGH.indexOf(ch);
  if (idx !== -1) return idx + 0x80;
  const code = ch.charCodeAt(0);
  if (code <= 0xFF) return code;
  return null;
}

/**
 * Reverse UTF-8-as-CP1252 double encoding. Returns the repaired text, or
 * null when any character cannot be reversed in a single cp1252 byte
 * (mixed-state files need manual fixing).
 */
export function repairDoubleEncodedUtf8(text) {
  const bytes = [];
  for (const ch of text) {
    const b = cp1252Reverse(ch);
    if (b === null) return null;
    bytes.push(b);
  }
  const buf = Buffer.from(bytes);
  const decoded = buf.toString('utf8');
  // A lossy decode (U+FFFD substitution) means the input was not a clean
  // double encoding - mixed-state files need manual fixing.
  if (!Buffer.from(decoded, 'utf8').equals(buf)) return null;
  return decoded;
}

/** True when the decoded text starts with a UTF-8 BOM (U+FEFF). */
export function hasUtf8Bom(text) {
  return text.charCodeAt(0) === 0xFEFF;
}

function textFiles(root) {
  const files = [];
  const skip = new Set(['node_modules', '.git', 'data', '.next', 'dist']);
  (function walk(dir) {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.name.startsWith('.') && e.name !== '.github') continue;
      if (skip.has(e.name)) continue;
      const full = path.join(dir, e.name);
      if (statSync(full).isDirectory()) walk(full);
      else if (TEXT_EXT.test(e.name)) {
        files.push({ full, rel: path.relative(root, full).split(path.sep).join('/') });
      }
    }
  })(root);
  return files;
}

function main() {
  const root = process.cwd();
  const files = textFiles(root);
  let broken = 0;
  for (const file of files) {
    const src = readFileSync(file.full, 'utf8');
    if (hasUtf8Bom(src)) {
      console.log(`BROKEN (bom): ${file.rel}`);
      broken++;
      continue;
    }
    if (!isSuspectMojibake(src) && !hasCorruptionMarkers(src)) continue;
    if (isSuspectMojibake(src)) {
      const repaired = repairDoubleEncodedUtf8(src);
      const clean =
        repaired !== null && !isSuspectMojibake(repaired) && !hasCorruptionMarkers(repaired);
      console.log(`BROKEN (mojibake, ${clean ? 'repairable' : 'mixed-state'}): ${file.rel}`);
    } else {
      console.log(
        `BROKEN (corrupt markers - control pictures, invisible marks or replacement chars): ${file.rel}`,
      );
    }
    broken++;
  }
  if (broken === 0) {
    console.log(`[ok] Encoding check passed (${files.length} text file(s), no BOM, no double-encoded UTF-8).`);
    process.exit(0);
  }
  console.error(
    `\n[x] Encoding check FAILED (${broken} file(s)).\n` +
    '    Cause: PowerShell 5.1 Get-Content reads UTF-8 as ANSI; a Get-Content/Set-Content\n' +
    '    round-trip double-encodes every non-ASCII character. Never round-trip repo text\n' +
    '    files through PowerShell - edit with tools, or read/write as explicit UTF-8.\n' +
    '    Repairable mojibake: reverse with the cp1252->UTF-8 transform (see\n' +
    '    repairDoubleEncodedUtf8). Corrupt markers (control pictures like U+2418, LRM/RLM,\n' +
    '    U+FFFD) mean a repair used a WRONG table: every CP1252 byte must map to its own\n' +
    '    slot, including the undefined ones (0x81, 0x8D, 0x8F, 0x90, 0x9D) - compacting\n' +
    '    the table shifts every mapping above the gap and silently mangles box-drawing\n' +
    '    characters and dashes. Restore the file from the last clean commit.'
  );
  process.exit(1);
}

const isMain =
  process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) main();
