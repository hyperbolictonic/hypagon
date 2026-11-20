/**
 * cli.mjs — shared CLI plumbing for the anti-slop gate scripts.
 *
 * Zero dependencies (Node >= 18, ESM). Source-scanning helpers live in lib.mjs;
 * per-repo config (loading + validation) lives in config.mjs; this module
 * handles flag parsing, gate bootstrap and path-to-file resolution. Keep it
 * free of scanning logic.
 */

import { existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { walk, SOURCE_EXT, IGNORE_FILE, isGenerated } from './lib.mjs';

// --- CLI parsing ---------------------------------------------------------------

/**
 * Parse CLI flags uniformly across gate scripts.
 *
 * spec maps flag -> type: 'string' | 'number' | 'flag' (boolean, no value).
 * argv starts after the script path. Unknown flags and bare positional words
 * land in `positionals`; each script decides whether positionals are an error
 * or file paths.
 *
 * Returns { values: Record<flag, string|number|true>, positionals: string[] }.
 */
export function parseFlags(argv, spec) {
  const values = {};
  const positionals = [];
  for (let i = 0; i < argv.length; i++) {
    const s = argv[i];
    const type = spec[s];
    if (!type) {
      positionals.push(s);
      continue;
    }
    if (type === 'flag') {
      values[s] = true;
      continue;
    }
    const raw = argv[++i];
    if (raw === undefined) {
      throw new Error(`Missing value for ${s}`);
    }
    const v = type === 'number' ? Number(raw) : raw;
    if (type === 'number' && Number.isNaN(v)) {
      throw new Error(`${s} expects a number, got: ${raw}`);
    }
    values[s] = v;
  }
  return { values, positionals };
}

/**
 * Common gate bootstrap: handle -h/--help with `usage`, parse flags per `spec`,
 * and merge flag values over `defaults` (config-supplied). Flag names are
 * camelCased into arg keys: --min-tokens -> args.minTokens, --report-only ->
 * args.reportOnly (flags become true/false).
 *
 * Returns { args, positionals }. Never returns on -h (exits 0) or a parse
 * error (exits 1).
 */
export function bootstrapGate(argv, { usage, spec, defaults }) {
  if (argv.includes('-h') || argv.includes('--help')) {
    console.log(usage);
    process.exit(0);
  }
  let parsed;
  try {
    parsed = parseFlags(argv, spec);
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
  const args = { ...defaults };
  for (const [flag, type] of Object.entries(spec)) {
    const key = flag.slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    args[key] = type === 'flag'
      ? parsed.values[flag] === true
      : (parsed.values[flag] ?? defaults[key]);
  }
  return { args, positionals: parsed.positionals };
}

/**
 * Resolve explicit path arguments (files or directories) into { full, rel }
 * source entries, applying the same filters as walk(). Exits 1 on a missing
 * path. Used by gate scripts in git-hook staged-file mode.
 * `opts.includeTests` opts in to test/spec files; `opts.extensions` overrides
 * the scanned extension set (preset support).
 */
export function collectPathFiles(paths, opts = {}) {
  const { includeTests = false, extensions } = opts;
  const exts = extensions ? new Set(extensions) : SOURCE_EXT;
  const files = [];
  for (const p of paths) {
    const abs = path.resolve(p);
    if (!existsSync(abs)) {
      console.error(`Path not found: ${p}`);
      process.exit(1);
    }
    if (statSync(abs).isDirectory()) {
      files.push(...walk(abs, abs, opts));
    } else if (
      (SOURCE_EXT.has(path.extname(abs)) || exts.has(path.extname(abs))) &&
      !isGenerated(abs.split(path.sep).join('/')) &&
      (includeTests || !IGNORE_FILE.test(abs))
    ) {
      files.push({ full: abs, rel: path.relative(process.cwd(), abs).split(path.sep).join('/') });
    }
  }
  return files;
}

/**
 * Resolve the scan root given to a gate (--src): accepts a directory (walked)
 * or a single file. Exits 1 when the path does not exist.
 * `opts.includeTests` opts in to test/spec files (duplicates.includeTests).
 * `opts.extensions` overrides the scanned extension set (preset support).
 */
export function resolveScanTarget(src, opts = {}) {
  const abs = path.resolve(src);
  if (!existsSync(abs)) {
    console.error(`Source directory not found: ${abs}`);
    process.exit(1);
  }
  if (statSync(abs).isFile()) {
    return collectPathFiles([src], opts);
  }
  return walk(abs, abs, opts);
}

/**
 * bootstrapGate plus the standard positional validation most gates share.
 * Pass allowPositionals: true for gates that accept file-path arguments
 * (git-hook staged mode).
 */
export function gateArgs({ argv, usage, spec, defaults, allowPositionals = false }) {
  const { args, positionals } = bootstrapGate(argv, { usage, spec, defaults });
  if (!allowPositionals && positionals.length > 0) {
    console.error(`Unexpected arguments: ${positionals.join(' ')} (this script takes flags only)`);
    process.exit(1);
  }
  return { args, positionals };
}

// --- per-repo config ----------------------------------------------------------

/**
 * Filter resolved files by a docs/duplicates-style ignore-path config:
 * globs are matched against THREE path candidates so every mode and both
 * glob conventions work — the provided rel, repo-relative, and (when `src`
 * is given) scan-root-relative. Tree-wide walks produce scan-root-relative
 * rels; git-hook staged mode produces repo-relative ones; configs may use
 * either convention. Returns the kept files and prints an exclusion notice
 * when any glob is configured and something matched.
 */
export function applyIgnorePaths(files, globs, { label = 'ignorePaths', src } = {}) {
  if (!Array.isArray(globs) || globs.length === 0) return files;
  const srcDir = src ? path.resolve(src) : null;
  const kept = files.filter((f) => {
    const repoRel = path.relative(process.cwd(), f.full).split(path.sep).join('/');
    const scanRel = srcDir ? path.relative(srcDir, f.full).split(path.sep).join('/') : null;
    const candidates = scanRel ? [f.rel, repoRel, scanRel] : [f.rel, repoRel];
    return !candidates.some((p) => matchesAnyGlob(p, globs));
  });
  const excluded = files.length - kept.length;
  if (excluded > 0) {
    console.log(`Ignoring ${excluded} file(s) matching ${label} (${globs.join(', ')}).`);
  }
  return kept;
}

/** Convert a glob (`**`, `*`, `?`) into a RegExp tested against '/'-separated rel paths. */
export function globToRegex(glob) {
  let pattern = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*') {
      if (glob[i + 1] === '*') {
        pattern += '[\\s\\S]*';
        i++;
      } else {
        pattern += '[^/]*';
      }
    } else if (c === '?') {
      pattern += '[^/]';
    } else {
      pattern += c.replace(/[.+^${}()|[\]\\]/g, '\\$&');
    }
  }
  return new RegExp(`^${pattern}$`);
}

/** True when relPath matches any ignore glob. */
export function matchesAnyGlob(relPath, globs) {
  return globs.length > 0 && globs.some((g) => globToRegex(g).test(relPath));
}
