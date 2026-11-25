/**
 * lib.mjs — shared source-scanning helpers for the anti-slop gate scripts.
 *
 * Zero dependencies (Node >= 18, ESM). CLI/config plumbing lives in cli.mjs;
 * this module is pure scanning: file discovery, noise stripping, tokenizing,
 * export extraction. Keep it free of I/O decisions and argument parsing.
 */

import { readdirSync } from 'node:fs';
import path from 'node:path';

/** Directories never scanned by the gates (deps, build output, tests, tooling). */
export const EXCLUDE_DIRS = new Set([
  'node_modules', 'dist', 'build', 'out', '.next', '.turbo',
  'coverage', 'storybook-static', '__tests__', '__mocks__',
  // Framework build output that is not namespaced under dist/ or build/:
  // generated bundles legitimately contain mojibake-looking sequences.
  'dist-electron', 'out-tsc', '.output', '.svelte-kit', '.nuxt', 'release', '_site',
]);
/** Filename patterns never gated: test/spec/story files (any JS/TS extension incl. mjs/mts) and type declaration shims. */
export const IGNORE_FILE = /(\.test|\.spec|\.stories|\.d)\.[mc]?[tj]sx?$/;

/** Generated files that must never be gated (sizes/counts are machine-owned). */
export const GENERATED_FILE = /(^|\/)(payload-types|next-env)(\.d)?\.ts$/;

/** True when relPath is a generated artifact (see GENERATED_FILE). */
export function isGenerated(relPath) {
  return GENERATED_FILE.test(relPath);
}

/** Source file extensions the gates scan. */
export const SOURCE_EXT = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.mts']);

/** Filenames of test/spec files — excluded from gates by default, included when
 * a gate opts in (duplicates.includeTests). .stories and .d stay excluded always. */
export const TEST_FILE = /(\.test|\.spec)\.[mc]?[tj]sx?$/;

/** Recursively list source files under `dir`, as { full, rel } with '/'-separated rel paths.
 * Entries are sorted by name, so gate output (index rows, report order) is
 * identical across operating systems and filesystems — required for
 * generate-component-index --check to pass on a different OS than the one
 * that generated the index.
 * `opts.includeTests` opts in to test and spec files (default: excluded).
 * `opts.extensions` overrides the scanned extension set (preset support). */
export function walk(dir, base, opts = {}) {
  const { includeTests = false, extensions } = opts;
  const exts = extensions ? new Set(extensions) : SOURCE_EXT;
  const files = [];
  const entries = [...readdirSync(dir, { withFileTypes: true })]
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  for (const entry of entries) {
    if (entry.name.startsWith('.') || EXCLUDE_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    const rel = path.relative(base, full).split(path.sep).join('/');
    const isTest = TEST_FILE.test(entry.name);
    // Test/spec files: included only on opt-in. .stories/.d and other
    // IGNORE_FILE matches stay excluded in every mode.
    const include = isTest ? includeTests : !IGNORE_FILE.test(entry.name);
    if (entry.isDirectory()) files.push(...walk(full, base, opts));
    else if (exts.has(path.extname(entry.name)) && !isGenerated(rel) && include) {
      files.push({ full, rel });
    }
  }
  return files;
}

/**
 * Comment/string handling shared by both strippers below. Newlines (including
 * those inside strings) are preserved, so line numbers computed on the output
 * match the original source.
 */
function stripSource(src, blankStrings) {
  let out = '';
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i];
    const next = src[i + 1];
    if (c === '/' && next === '/') {
      while (i < n && src[i] !== '\n') i++;
    } else if (c === '/' && next === '*') {
      i += 2;
      while (i < n && !(src[i] === '*' && src[i + 1] === '/')) {
        if (src[i] === '\n') out += '\n';
        i++;
      }
      i += 2;
    } else if (c === '"' || c === "'" || c === '`') {
      const quote = c;
      i++;
      if (blankStrings) {
        while (i < n && src[i] !== quote) {
          if (src[i] === '\\') i++;
          if (src[i] === '\n') out += '\n';
          i++;
        }
        i++; // closing quote
        out += '""';
      } else {
        out += quote;
        while (i < n && src[i] !== quote) {
          if (src[i] === '\\' && i + 1 < n) {
            out += src[i] + src[i + 1];
            i += 2;
            continue;
          }
          out += src[i];
          i++;
        }
        out += quote;
        i++; // closing quote
      }
    } else {
      out += c;
      i++;
    }
  }
  return out;
}

/**
 * Remove comments and blank string contents so brace/regex analysis is
 * reliable. Newlines are preserved, so line numbers computed on the output
 * match the original source.
 */
export function stripNoise(src) {
  return stripSource(src, true);
}

/**
 * Remove comments while KEEPING string contents verbatim — used where the
 * text inside strings matters (import specifier parsing) but comment noise
 * must not create false edges.
 */
export function stripComments(src) {
  return stripSource(src, false);
}

const TOKEN_RE =
  /"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|`(?:[^`\\]|\\.)*`|[A-Za-z_$][\w$]*|\d+(?:\.\d+)?|\S/g;

/** Tokenize stripped source into normalized tokens [{ t, line }] (1-based lines): strings -> `<str>`, numbers -> `<num>`, identifiers/symbols stay literal. */
export function tokenize(stripped) {
  const tokens = [];
  for (const m of stripped.matchAll(TOKEN_RE)) {
    let nl = 0;
    for (let k = 0; k < m.index; k++) if (m.input[k] === '\n') nl++;
    const raw = m[0];
    const t = raw[0] === '"' || raw[0] === "'" || raw[0] === '`' ? '<str>'
      : /^\d/.test(raw) ? '<num>'
      : raw;
    tokens.push({ t, line: 1 + nl });
  }
  return tokens;
}

/** 1-based line number of char index `idx` within comment/string-stripped source. */
export function lineOf(stripped, idx) {
  let line = 1;
  for (let i = 0; i < idx && i < stripped.length; i++) {
    if (stripped[i] === '\n') line++;
  }
  return line;
}

const CONTROL_KEYWORDS = new Set(['if', 'for', 'while', 'switch', 'catch']);

/**
 * Limits a file may declare an exception for, via
 *   // anti-slop: <limit> <value> — <reason>
 * File-scoped limits apply anywhere; member-scoped limits must sit directly
 * above the member they exempt (enforced by the gate).
 */
export const LIMIT_NAMES = new Set(['file-lines', 'function-lines', 'class-methods', 'exports']);

/**
 * Parse `// anti-slop: <limit> <value> — <reason>` declarations.
 * Returns { exceptions: [{ limit, value, reason, line }], invalid: [{ line, why }] }.
 * A reason is mandatory: an unexplained exemption is the lazy fix the kit bans,
 * and a malformed directive fails loudly instead of being silently ignored.
 */
export function parseLimitExceptions(source) {
  const exceptions = [];
  const invalid = [];
  source.split(/\r?\n/).forEach((text, i) => {
    // Only a real line comment counts: prose/JSDoc that documents the syntax
    // (` * // anti-slop: ...`) must not be mistaken for a malformed directive.
    if (!/^\s*\/\/\s*anti-slop:/.test(text)) return;
    const m = /^\/\/\s*anti-slop:\s*(file-lines|function-lines|class-methods|exports)\s+(\d+)\s*(?:[-—]\s*(.*))?$/.exec(text.trim());
    if (!m) {
      invalid.push({ line: i + 1, why: 'not `// anti-slop: <limit> <value> — <reason>`' });
      return;
    }
    const reason = (m[3] ?? '').trim();
    if (reason.length < 8) {
      invalid.push({ line: i + 1, why: 'a reason (>= 8 chars) is required after the dash' });
      return;
    }
    exceptions.push({ limit: m[1], value: Number(m[2]), reason, line: i + 1 });
  });
  return { exceptions, invalid };
}

/**
 * True when the `{` at openBraceIdx opens a control-flow block (if/for/while/
 * switch/catch): the nearest `)` before the brace belongs to a `(` that follows
 * one of the control keywords. `foo(x) {` is NOT control flow.
 */
export function isControlFlow(stripped, openBraceIdx) {
  let j = openBraceIdx - 1;
  let depth = 0;
  while (j >= 0) {
    const ch = stripped[j];
    if (ch === ')') depth++;
    else if (ch === '(') {
      depth--;
      if (depth === 0) break;
    }
    j--;
  }
  if (j < 0) return false;
  let k = j - 1;
  while (k >= 0 && /\s/.test(stripped[k])) k--;
  const end = k;
  while (k >= 0 && /[\w$]/.test(stripped[k])) k--;
  return CONTROL_KEYWORDS.has(stripped.slice(k + 1, end + 1));
}

/**
 * True when the `{` at openBraceIdx opens a function/method body rather than a
 * class, object literal, or control block. Covers:
 *   name(params) {              method shorthand
 *   public run(): Promise<T> {  typed signature — the brace follows the return
 *                               type, not the `)`, which a `prev === ')'` check
 *                               misses entirely
 *   (x) => {                    arrow
 *   function f<T>(x: T): T {    generics + return type
 * while rejecting `if (x) {`, `class X {`, `else {`, `foo({`, `const x = {` and
 * `useMemo(() => ({`.
 *
 * The signature head is the text since the last newline: semicolon-free code
 * otherwise lets a previous statement's `)` leak into the window and turns
 * every `const x: Config = {` into a phantom 100-line "function".
 */
export function isFunctionBody(stripped, openBraceIdx) {
  const window = stripped.slice(Math.max(0, openBraceIdx - 400), openBraceIdx);
  const head = window.slice(window.lastIndexOf('\n') + 1).trimEnd();
  if (head.endsWith('=>')) return true;

  // A function body follows its parameter list (possibly via a return type);
  // it never follows an operator or an opening bracket.
  const lastChar = head[head.length - 1];
  if (lastChar && '=(:,[?!&|+-*/%'.includes(lastChar)) return false;
  if (!head.includes(')')) return false;

  return !isControlFlow(stripped, openBraceIdx);
}

/**
 * Returns the first line of the JSDoc/TSDoc block immediately preceding
 * source index `idx`, or null if there is none.
 *
 * Why this is not a one-line regex: the previous implementation scanned with
 * `/\/\*\*([\s\S]*?)\*\/\s*$/`. The `$` anchor plus a lazy capture makes that
 * match start at the FIRST docblock in the file and end at the LAST closing
 * terminator before the declaration, so every export reported the module
 * header — in a real repo, four server actions all described as "Carer-facing
 * mutations." and a type's doc attached to the function above it. A one-line
 * block also leaked its closing terminator into docs/COMPONENT_INDEX.md.
 * check-docs only requires a non-null first line, so the gate passed while the
 * inventory that `reuse-before-create` is grounded in was wrong.
 *
 * Keep both properties: the NEAREST block, and only when nothing but whitespace
 * sits between its close and the declaration. Anything else must return null —
 * that is the "undocumented" verdict the gate exists to report, and it is safer
 * than borrowing a neighbouring comment.
 */
export function jsdocBefore(source, idx) {
  const slice = source.slice(0, idx).replace(/\s+$/, '');
  const end = slice.lastIndexOf('*/');
  if (end === -1 || end !== slice.length - 2) return null; // no block ends here

  // Look only at the region after the previous comment close, and take its
  // FIRST line-start '/**'. A glob inside a doc (`"src/domain/**"`) is mid-line
  // and is not mistaken for the opening; taking the LAST '/**' would find it.
  const prevClose = slice.lastIndexOf('*/', end - 1);
  const region = slice.slice(prevClose === -1 ? 0 : prevClose + 2, end);
  const open = /(?:^|\n)[ \t]*\/\*\*/.exec(region);
  if (!open) return null;

  const lines = region
    .slice(open.index + open[0].length)
    .split('\n')
    .map((l) => l.replace(/^\s*\*+\s?/, '').trim())
    .filter(Boolean);
  if (lines.length === 0) return null;
  const desc = lines[0];
  return desc.startsWith('@') ? null : desc; // tag-only blocks are not usage docs
}

/**
 * Extract exported declarations from source: [{ name, kind, index, desc }].
 * `desc` is the JSDoc first line (null when undocumented).
 */
export function extractExports(source) {
  const found = [];
  const add = (name, kind, index, isDefault) => {
    if (name && !found.some((e) => e.name === name)) {
      found.push({ name, kind, index, isDefault: Boolean(isDefault) });
    }
  };

  for (const m of source.matchAll(/export\s+(?:default\s+)?(?:async\s+)?function\s*\*?\s*([A-Za-z0-9_$]+)/g)) {
    add(m[1], 'function', m.index, m[0].startsWith('export default'));
  }
  for (const m of source.matchAll(/export\s+(?:default\s+)?const\s+([A-Za-z0-9_$]+)/g)) {
    add(m[1], /=>/.test(source.slice(m.index, m.index + 200)) ? 'function' : 'value', m.index, m[0].startsWith('export default'));
  }
  for (const m of source.matchAll(/export\s+(?:abstract\s+)?class\s+([A-Za-z0-9_$]+)/g)) {
    add(m[1], 'class', m.index, m[0].startsWith('export default'));
  }
  for (const m of source.matchAll(/export\s+(?:type|interface)\s+([A-Za-z0-9_$]+)/g)) {
    add(m[1], 'type', m.index, false);
  }
  if (/export\s+default\s+(?!function|class|const)/.test(source)) {
    add('default', 'default', source.length, true);
  }
  return found.map((e) => ({ ...e, desc: jsdocBefore(source, e.index) }));
}
