/**
 * Shared schema and renderer pieces for the tool catalog.
 *
 * The catalog is a table of tool entries; several of them describe the same shape — a
 * selector/x/y target, the `include_offscreen` toggle, the mark-id alias ladder, the marks
 * renderer, a condition list and its result lines, the notification parameter set. Building
 * those once keeps a change to one tool from silently changing only one of its twins, and it
 * keeps the repeated zod chains out of the table.
 */
import { z } from 'zod';
import { formatMark } from '../main/marks/format-mark.js';

/** The alias ladder older callers use for a mark id, or undefined when none was given. */
export function markIdAliases(args: any): number | undefined {
  const raw =
    args?.mark_id ?? args?.markId ?? args?.mark ?? args?.id ?? args?.badge ?? args?.index ?? args?.num ?? args?.number;
  return raw === undefined || raw === null || isNaN(Number(raw)) ? undefined : Number(raw);
}

/** Resolve a mark id, or throw the calling tool's own hint. */
export function markIdFrom(args: any, hint: string): number {
  const id = markIdAliases(args);
  if (id === undefined) throw new Error(hint);
  return id;
}

/** The marks array as one line per mark, or the whole payload as JSON when there is none. */
export function formatMarks(data: any): string {
  return Array.isArray(data.marks) ? data.marks.map((m: any) => formatMark(m)).join('\n') : JSON.stringify(data);
}

/** `include_offscreen` as the query flag the bridge expects. */
export function offscreenFlag(args: any): string {
  return String(args?.include_offscreen === true);
}

/** The `include_offscreen` parameter, with the wording the calling tool wants. */
export function includeOffscreenParameter(description: string) {
  return z.coerce.boolean().optional().default(false).describe(description);
}

/**
 * The selector/x/y target triple. `coerceSelector` matches the tools that accept a non-string
 * selector value (act), so the advertised schema stays exactly what each tool used to declare.
 */
export function targetParameters(options: {
  selector: string;
  x: string;
  y: string;
  coerceSelector?: boolean;
}): Record<string, z.ZodTypeAny> {
  const selector = options.coerceSelector ? z.coerce.string() : z.string();
  return {
    selector: selector.optional().describe(options.selector),
    x: z.coerce.number().optional().describe(options.x),
    y: z.coerce.number().optional().describe(options.y),
  };
}

/** A condition list, folding the single `condition` legacy form into an array. */
export function conditionList(args: any): any[] {
  return args?.conditions || (args?.condition ? [args.condition] : []);
}

/** One `✓ type — evidence` line per condition result. */
export function conditionLines(data: any): string[] {
  return (data.results || []).map((r: any) => `${r.ok ? '✓' : '✗'} ${r.type}${r.evidence ? ` — ${r.evidence}` : ''}`);
}

/**
 * The notification parameter set. The title default, the urgency choices and the wording differ
 * per tool, so they are arguments — the shape and defaults do not.
 */
export function notificationParameters(options: {
  message: string;
  title: string;
  titleDefault: string;
  urgencyChoices: [string, ...string[]];
  urgencyDefault: string;
  urgencyDescription: string;
  soundDescription: string;
}): Record<string, z.ZodTypeAny> {
  return {
    message: z.string().describe(options.message),
    title: z.string().optional().default(options.titleDefault).describe(options.title),
    urgency: z.enum(options.urgencyChoices).optional().default(options.urgencyDefault).describe(options.urgencyDescription),
    sound: z.boolean().optional().default(true).describe(options.soundDescription),
  };
}

/**
 * The `q` / `tag` / `limit` query payload the search lists share. Only the default limit differs
 * per tool, so it is the argument.
 */
export function queryPagingPayload(args: any, defaultLimit: number): { queryParams: Record<string, string> } {
  return {
    queryParams: {
      ...(args?.query ? { q: args.query } : {}),
      ...(args?.tag ? { tag: args.tag } : {}),
      limit: String(args?.limit ?? defaultLimit),
    },
  };
}

/** The rows of `data[key]`, or an empty list. */
export function rowsOf(data: any, key: string): any[] {
  return Array.isArray(data?.[key]) ? data[key] : [];
}

/** `empty` when there are no rows, else the heading plus one line per row. */
export function renderRows(
  rows: any[],
  options: { empty: string; heading: (count: number) => string; line: (row: any) => string },
): string {
  if (rows.length === 0) return options.empty;
  return `${options.heading(rows.length)}\n${rows.map(options.line).join('\n')}`;
}

/** The `engine` / `engines` / `url_template` triple the two search tools share. */
export function engineParameters(options: {
  engine: string;
  engines: string;
  urlTemplate: string;
}): Record<string, z.ZodTypeAny> {
  return {
    engine: z
      .enum(['google', 'duckduckgo', 'bing', 'brave', 'startpage', 'custom'])
      .optional()
      .describe(options.engine),
    engines: z.array(z.string()).optional().describe(options.engines),
    url_template: z.string().optional().describe(options.urlTemplate),
  };
}

/** The `url` / `as` pair every representation fetch accepts. */
export function urlAsPayload(args: any): { url: any; as: any } {
  return { url: args?.url, as: args?.as };
}

/** The advertised-representation enum the representation fetches share; only the wording differs. */
export function representationEnum(description: string) {
  return z.enum(['llms_txt', 'llms_full', 'markdown', 'text']).optional().describe(description);
}

/** The collect fields shared by `collect_all` and `extract(kind: "collect")`. */
export function collectPayload(args: any) {
  return {
    selector: args?.selector,
    ref: args?.ref,
    scroll: args?.scroll || 'container',
    step: args?.step,
    delay_ms: args?.delay_ms,
    max_scrolls: args?.max_scrolls,
    max: args?.max,
  };
}

/** The collected rows, or the failing tool's own line. */
export function collectFormat(data: any, options: { label: string; heading: string }): string {
  if (data.error) return `${options.label} failed: ${data.error}`;
  const rows = (data.rows || []).map((r: any, i: number) => `${i + 1}. ${r.text}${r.href ? ` -> ${r.href}` : ''}`);
  return `${options.heading} ${data.count} distinct rows after ${data.scrolls} scrolls\n${rows.join('\n')}`;
}
