/**
 * The projections the primitives render: one mark line, the component table, the
 * paged text envelope and the extract preview.
 *
 * Why a module: these are pure formatters used by more than one controller
 * (observe and find both print mark lines), and none of them needs host state.
 */
import type { MarkItem } from '../marks/marks-overlay.js';
import { formatMark } from '../marks/format-mark.js';
import type { ObserveOptions } from './contracts.js';

/** When to use: any view that prints one mark — the shared badge format. */
export function markLine(m: MarkItem): string {
  return formatMark(m);
}

/**
 * When to use: observe(components) — compact, region-grouped rendering of the table.
 *
 * One line per component:
 *   [8] button   "Create account" {click}
 *   [7] textbox  "Email" · empty {type}
 * Read top-down, it is the page's affordances — no markup, no screenshot.
 */
export function componentsText(
  components: Array<{
    id: number;
    role: string;
    name: string;
    value?: string;
    state: string[];
    actions: string[];
    region: string;
    regionName?: string;
  }>,
): string {
  const groups = new Map<string, string[]>();
  for (const c of components) {
    const key = c.regionName ? `${c.region} · ${c.regionName}` : c.region;
    const bits = [`[${c.id}] ${c.role}`.padEnd(20), `"${c.name}"`];
    if (c.value) bits.push(`· ${c.value}`);
    if (c.state.length) bits.push(`[${c.state.join(', ')}]`);
    if (c.actions.length) bits.push(`{${c.actions.join(', ')}}`);
    const line = bits.join(' ');
    const bucket = groups.get(key);
    if (bucket) bucket.push(line);
    else groups.set(key, [line]);
  }
  const lines: string[] = [];
  for (const [region, rows] of groups) {
    if (lines.length) lines.push('');
    lines.push(`## ${region}`);
    lines.push(...rows);
  }
  return lines.join('\n');
}

/**
 * When to use: every observe view — one envelope with the page identity, the
 * budget/cursor slice and the view's own extras.
 */
export function pageText(
  as: string,
  revision: number,
  info: { url: string; title: string },
  text: string,
  opts: ObserveOptions,
  extra: Record<string, any> = {},
  defaultBudget = 0,
) {
  const total = text.length;
  // An explicit budget of 0 means "everything"; an omitted budget uses the
  // projection's default view (markdown is capped so a 400k-char page does not
  // land in context unasked — and, unlike before, the remainder is pageable).
  const budget =
    opts.budget === undefined || opts.budget === null ? defaultBudget : opts.budget > 0 ? opts.budget : 0;
  let offset = 0;
  if (opts.cursor !== undefined && opts.cursor !== null && opts.cursor !== '') {
    const n = typeof opts.cursor === 'number' ? opts.cursor : parseInt(String(opts.cursor), 10);
    if (!isNaN(n) && n > 0) offset = Math.min(n, total);
  }
  let slice = text;
  let nextCursor: string | null = null;
  let truncated = false;
  if (budget > 0 && offset + budget < total) {
    let end = offset + budget;
    const nl = text.indexOf('\n', end);
    if (nl !== -1 && nl - end < budget) end = nl;
    slice = text.slice(offset, end);
    nextCursor = String(end);
    truncated = true;
  } else if (offset > 0) {
    slice = text.slice(offset);
  }
  return {
    as,
    revision,
    url: info.url,
    title: info.title,
    text: slice,
    total,
    offset,
    next_cursor: nextCursor,
    truncated,
    ...extra,
  };
}

/** When to use: observe(list|table|app_data) — the one-line preview of an extract. */
export function renderExtract(data: any): string {
  if (!data || data.error) return `(no data: ${data?.error || 'empty'})`;
  if (data.kind === 'table') {
    const lines: string[] = [data.headers ? '| ' + data.headers.join(' | ') + ' |' : ''];
    for (const row of data.rows || []) lines.push('| ' + row.join(' | ') + ' |');
    return lines.filter(Boolean).join('\n');
  }
  if (data.kind === 'app_data') {
    return (data.sources || []).map((s: any) => `${s.source} (${s.bytes}B, parsed=${s.parsed})`).join('\n');
  }
  return (data.rows || []).map((r: any, i: number) => `${i + 1}. ${r.text}${r.href ? ` -> ${r.href}` : ''}`).join('\n');
}
