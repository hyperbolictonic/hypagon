#!/usr/bin/env node
/**
 * generate-component-index.mjs
 *
 * Scans a source tree and (re)generates docs/COMPONENT_INDEX.md — the
 * inventory that the `reuse-before-create` skill treats as the source of
 * truth for existing layouts, components, hooks, and utilities.
 *
 * Zero dependencies (plain Node >= 18, ESM). Classification is heuristic
 * (paths + export names + file extension); it is a discovery aid, not a parser.
 *
 * Usage:
 *   node scripts/anti-slop/generate-component-index.mjs [--src src] [--out docs/COMPONENT_INDEX.md] [--root .]
 *
 * A "## Manual Notes" section at the end of an existing index is preserved.
 */

import {
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
} from 'node:fs';
import path from 'node:path';
import { walk, extractExports } from './lib.mjs';
import { applyIgnorePaths } from './cli.mjs';
import { loadConfig } from './config.mjs';

// --- args -------------------------------------------------------------------
function parseArgs(argv) {
  const args = { src: 'src', out: 'docs/COMPONENT_INDEX.md', root: '.', check: false };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--src') args.src = argv[++i];
    else if (a === '--out') args.out = argv[++i];
    else if (a === '--root') args.root = argv[++i];
    else if (a === '--check') args.check = true;
    else if (a === '-h' || a === '--help') {
      console.log('Usage: node generate-component-index.mjs [--src src] [--out docs/COMPONENT_INDEX.md] [--root .] [--check]');
      console.log('  --check  compare against the file on disk; exit 1 when stale (CI mode, writes nothing)');
      process.exit(0);
    } else {
      console.error(`Unknown argument: ${a}`);
      process.exit(1);
    }
  }
  return args;
}

const args = parseArgs(process.argv);

const SRC_DIR = path.resolve(args.root, args.src);
const OUT_FILE = path.resolve(args.root, args.out);
/** Bounded companion to the full index; this is what opencode.json loads. */
const DIGEST_FILE = path.resolve(args.root, path.join(path.dirname(args.out), 'COMPONENT_INDEX.digest.md'));

if (!existsSync(SRC_DIR)) {
  console.error(`Source directory not found: ${SRC_DIR}`);
  process.exit(1);
}

// --- classification ---------------------------------------------------------
function classify(relPath, exports) {
  const base = path.basename(relPath);
  const dir = path.dirname(relPath).toLowerCase();
  const baseName = path.basename(base, path.extname(base));
  const isTsx = /\.(tsx|jsx)$/.test(base);

  const hasJsxLike = exports.length > 0 && isTsx;

  if (/^use[A-Z0-9]/.test(baseName) || /(^|\/)hooks?\//.test(dir)) return 'Hook';
  if (/(^|\/)layouts?(\/|$)/.test(dir) || /layout/i.test(baseName)) return 'Layout';
  if (hasJsxLike && exports.some((e) => /^[A-Z]/.test(e.name))) return 'Component';
  if (/(^|\/)(services?|adapters?)(\/|$)/.test(dir)) return 'Service';
  if (/(^|\/)(utils?|lib|helpers?)(\/|$)/.test(dir)) return 'Util';
  if (exports.some((e) => e.kind === 'type')) return 'Types';
  return 'Module';
}

// --- build ------------------------------------------------------------------
const files = walk(SRC_DIR, SRC_DIR);
// The generator and the docs gate must agree on what exists: docs.ignorePaths
// excludes framework-owned or declarative files from both the listing and the
// undocumented count, so the two never report different totals.
const ignorePaths = Array.isArray(loadConfig().docs?.ignorePaths)
  ? loadConfig().docs.ignorePaths
  : [];
const filtered = applyIgnorePaths(files, ignorePaths, { label: 'docs.ignorePaths', src: args.src });
const index = new Map(); // kind -> [{rel, name, kind, desc, lines}]
let missingDocs = 0;

for (const file of filtered) {
  const source = readFileSync(file.full, 'utf8');
  const exports = extractExports(source);
  if (exports.length === 0) continue;
  const kind = classify(file.rel, exports);
  const lines = source.split('\n').length;
  const list = index.get(kind) ?? [];
  for (const exp of exports) {
    // The docs gate exempts default exports (route entry points etc.); the
    // generator's count must agree, or the two report different totals.
    if (!exp.desc && exp.kind !== 'default') missingDocs++;
    list.push({ rel: file.rel, name: exp.name, kind: exp.kind, desc: exp.desc, lines });
  }
  index.set(kind, list);
}

// --- preserve manual notes --------------------------------------------------
let manualNotes = '';
if (existsSync(OUT_FILE)) {
  const existing = readFileSync(OUT_FILE, 'utf8');
  const marker = existing.indexOf('## Manual Notes');
  if (marker !== -1) manualNotes = existing.slice(marker);
}

// --- render -----------------------------------------------------------------
const KIND_ORDER = ['Layout', 'Component', 'Hook', 'Service', 'Util', 'Types', 'Module'];
// Categories already plural keep their name; everything else takes a plain 's'.
const PLURAL = { Types: 'Types' };
const heading = (kind) => PLURAL[kind] ?? `${kind}s`;
const totalExports = KIND_ORDER.reduce((n, k) => n + (index.get(k)?.length ?? 0), 0);

let md = `# Component Index\n\n`;
md += `<!-- generated: run \`node scripts/anti-slop/generate-component-index.mjs\` to regenerate -->\n\n`;
md += `Inventory of shared layouts, components, hooks, services, and utilities under \`${args.src}/\`. `;
md += `${filtered.length} files, ${totalExports} exports.\n\n`;
md += `> Rule of use: before creating any new component, hook, or utility, check this file first (see the \`reuse-before-create\` skill). When you add a shared abstraction, rerun the generator and fill in the "When to use" column.\n\n`;

for (const kind of KIND_ORDER) {
  const list = index.get(kind);
  if (!list || list.length === 0) continue;
  md += `## ${heading(kind)} (${list.length})\n\n`;
  md += `| File | Export | When to use |\n|---|---|---|\n`;
  for (const e of list) {
    const doc = e.desc ? e.desc.replace(/\|/g, '\\|') : '';
    md += `| \`${e.rel}\` | \`${e.name}\`${e.kind === 'type' ? ' *(type)*' : ''} | ${doc || '-'} |\n`;
  }
  md += `\n`;
}

md += manualNotes ? `${manualNotes.trimEnd()}\n` : `## Manual Notes\n\n(Add notes here; they are preserved when the index is regenerated.)\n`;
md = md.replace(/\n+$/, '\n');

// --- digest (what is actually loaded into a session) -------------------------
// The full index is unbounded: 168 exports is ~22k chars (~5.5k tokens) today,
// and it grows with every export. Injecting that into every session is a tax on
// work that never touches shared code. The digest is one line per MODULE
// (bounded by file count, not export count) and points at the full index for
// the "When to use" text the agent needs once it has a shortlist.
const MAX_DIGEST_MODULES = 120;
const MAX_NAMES_PER_MODULE = 8;

const byModule = new Map();
for (const list of index.values()) {
  for (const e of list) {
    if (!byModule.has(e.rel)) byModule.set(e.rel, []);
    byModule.get(e.rel).push(e.name);
  }
}
const moduleRels = [...byModule.keys()].sort();

let digest = `# Component Index — digest\n\n`;
digest += `<!-- generated: run \`node scripts/anti-slop/generate-component-index.mjs\` to regenerate -->\n\n`;
digest += `${filtered.length} modules, ${totalExports} exports under \`${args.src}/\`. `;
digest += `Full "When to use" descriptions live in [docs/COMPONENT_INDEX.md](COMPONENT_INDEX.md) — `;
digest += `grep it by concept before creating a component, hook, or utility (see \`reuse-before-create\`).\n\n`;
digest += `| Module | Exports |\n|---|---|\n`;
for (const rel of moduleRels.slice(0, MAX_DIGEST_MODULES)) {
  const names = byModule.get(rel);
  const shown = names.slice(0, MAX_NAMES_PER_MODULE).join(', ');
  const more = names.length > MAX_NAMES_PER_MODULE ? `, … (${names.length})` : '';
  digest += `| \`${rel}\` | ${names.length}: ${shown}${more} |\n`;
}
if (moduleRels.length > MAX_DIGEST_MODULES) {
  digest += `\n… and ${moduleRels.length - MAX_DIGEST_MODULES} more module(s) — grep the full index.\n`;
}
digest += `\n> Capped at ${MAX_DIGEST_MODULES} modules so it can be loaded into every session; the full index is the source of truth.\n`;
digest = digest.replace(/\n+$/, '\n');

if (args.check) {
  for (const [file, expected] of [[OUT_FILE, md], [DIGEST_FILE, digest]]) {
    if (!existsSync(file)) {
      console.error(`[x] Index check FAILED: ${file} does not exist. Run the generator without --check and commit the result.`);
      process.exit(1);
    }
    if (readFileSync(file, 'utf8').replace(/\n+$/, '\n') !== expected) {
      console.error(`[x] Index check FAILED: ${file} is stale. Run \`node scripts/anti-slop/generate-component-index.mjs\` and commit the result.`);
      process.exit(1);
    }
  }
  console.log(`[ok] Component index and digest are up to date (${OUT_FILE}, ${DIGEST_FILE}).`);
  process.exit(0);
}

mkdirSync(path.dirname(OUT_FILE), { recursive: true });
writeFileSync(OUT_FILE, md);
writeFileSync(DIGEST_FILE, digest);

console.log(`Wrote ${OUT_FILE}`);
console.log(`Wrote ${DIGEST_FILE} (bounded summary — this is the file sessions load)`);
console.log(`  ${filtered.length} source files, ${totalExports} exports across ${KIND_ORDER.filter((k) => index.has(k)).length} categories.`);
if (missingDocs > 0) {
  console.log(`  [doc] ${missingDocs} export(s) have no JSDoc description. Shared components/hooks/utils must carry a one-line "/** When to use ... */" above the export.`);
}
