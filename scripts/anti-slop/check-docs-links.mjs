#!/usr/bin/env node
/**
 * check-docs-links.mjs
 *
 * Markdown link checker for the repo's own docs. Scans every .md file and
 * verifies each link:
 *   - absolute local-disk paths (drive letters, file://, leading /) are
 *     REJECTED — links must be repo-relative so they work on GitHub and on
 *     any machine ("no local disk references");
 *   - targets must not escape the repo root via ../..;
 *   - relative targets must exist (file or directory);
 *   - #anchors must match a GitHub-style heading slug in the target file
 *     (same file when the link has no target).
 *
 * Zero dependencies. Only runs when executed directly; the checker function
 * is exported for tests.
 *
 * Usage: node scripts/anti-slop/check-docs-links.mjs [--root .]
 */

import {
  readdirSync, readFileSync, existsSync, statSync,
} from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

/** Repo-relative .md files, excluding tooling and generated noise. */
export function repoMarkdownFiles(root) {
  const files = [];
  const skip = new Set(['node_modules', '.git', 'data', '.next', 'dist']);
  (function walk(dir) {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.name.startsWith('.') && e.name !== '.github') continue;
      if (skip.has(e.name)) continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (e.name.endsWith('.md')) {
        files.push({ full, rel: path.relative(root, full).split(path.sep).join('/') });
      }
    }
  })(root);
  return files;
}

/** GitHub-style heading slug: lowercase, punctuation stripped (unicode-safe),
 * spaces -> hyphens 1:1. "What counts as duplication — and what doesn't"
 * becomes "what-counts-as-duplication--and-what-doesnt". */
export function githubSlug(heading) {
  return heading
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .trim()
    .replace(/\s/g, '-');
}

/** Slug set for every markdown heading in the source (fenced lines excluded).
 * Splits on /\r?\n/ — with CRLF files, a trailing \r would otherwise break the
 * heading regex ('.' does not match \r and '$' does not match before it), which
 * is why anchors failed on Windows-checked docs. */
export function headingSlugs(src) {
  const slugs = new Set();
  let inFence = false;
  for (const line of src.split(/\r?\n/)) {
    if (/^\s*```/.test(line)) { inFence = !inFence; continue; }
    if (inFence) continue;
    const m = /^(#{1,6})\s+(.*)$/.exec(line);
    if (m) slugs.add(githubSlug(m[2]));
  }
  return slugs;
}

/** Markdown links in the source, with fenced blocks and inline code spans
 * excluded: a JSDoc that documents `[text](href)` is describing syntax, not
 * linking to a file called "href". */
export function extractLinks(src) {
  const links = [];
  let inFence = false;
  for (const line of src.split(/\r?\n/)) {
    if (/^\s*```/.test(line)) { inFence = !inFence; continue; }
    if (inFence) continue;
    const prose = line.replace(/`[^`]*`/g, '');
    for (const m of prose.matchAll(/\[[^\]]*\]\(([^)\s]+)\)/g)) {
      links.push(m[1]);
    }
  }
  return links;
}

const LOCAL_DISK_RE = /^(?:[A-Za-z]:[\\/]|file:\/\/|\/)/;

/**
 * Check one markdown file. Returns a list of problems:
 * { link, reason } where reason is 'local-disk' | 'escapes-root' |
 * 'missing-target' | 'missing-anchor'.
 */
export function checkMarkdown(file, root) {
  const problems = [];
  const src = readFileSync(file, 'utf8');
  const ownSlugs = headingSlugs(src);
  for (const link of extractLinks(src)) {
    const decoded = decodeURIComponent(link);
    if (/^(https?:|mailto:)/.test(decoded)) continue;

    if (LOCAL_DISK_RE.test(decoded)) {
      problems.push({ link, reason: 'local-disk' });
      continue;
    }

    const hashAt = decoded.indexOf('#');
    const filePart = hashAt === -1 ? decoded : decoded.slice(0, hashAt);
    const anchor = hashAt === -1 ? null : decoded.slice(hashAt + 1);

    if (!filePart) {
      // Same-file anchor: GitHub resolves it against this file's headings.
      if (anchor && !ownSlugs.has(anchor)) {
        problems.push({ link, reason: 'missing-anchor' });
      }
      continue;
    }

    const resolved = path.resolve(path.dirname(file), filePart);
    if (!resolved.startsWith(root + path.sep) && resolved !== root) {
      problems.push({ link, reason: 'escapes-root' });
      continue;
    }
    if (!existsSync(resolved)) {
      problems.push({ link, reason: 'missing-target' });
      continue;
    }
    if (anchor) {
      if (statSync(resolved).isDirectory()) {
        problems.push({ link, reason: 'missing-anchor' });
        continue;
      }
      if (!headingSlugs(readFileSync(resolved, 'utf8')).has(anchor)) {
        problems.push({ link, reason: 'missing-anchor' });
      }
    }
  }
  return problems;
}

function main() {
  const root = process.cwd();
  const files = repoMarkdownFiles(root);
  let broken = 0;
  for (const file of files) {
    for (const p of checkMarkdown(file.full, root)) {
      console.log(`BROKEN (${p.reason}): ${file.rel} -> ${p.link}`);
      broken++;
    }
  }
  if (broken === 0) {
    console.log(`[ok] Docs link check passed (${files.length} markdown file(s), no local-disk references, no broken links/anchors).`);
    process.exit(0);
  }
  console.error(
    `\n[x] Docs link check FAILED (${broken} problem(s)).\n` +
    '    local-disk: links must be repo-relative (they must work on GitHub and on any machine).\n' +
    '    escapes-root: a relative link climbed out of the repository - fix the ../ level.\n' +
    '    missing-anchor: GitHub slugs are lowercase, punctuation-stripped, spaces -> hyphens.'
  );
  process.exit(1);
}

const isMain =
  process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) main();
