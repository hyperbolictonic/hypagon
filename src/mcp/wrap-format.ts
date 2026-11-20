/**
 * Turning bridge responses into text the model reads.
 *
 * The server is stateless, so this is where a run result, a dry-run preview, a manifest and a
 * secret list become Markdown. Errors keep their published code in bold so a caller can tell
 * a policy refusal from a transport failure.
 *
 * When to use: every tool handler in `wrap-server.ts` and the generated `wrap_<id>` tools.
 */
import { GENERATED_TOOL_CAP, callBridge } from './wrap-config.js';
import { logWrap } from './wrap-log.js';

const MAX_TEXT_CHARS = 60_000;

/** When to use: any tool output — keeps one response inside the model's context budget. */
export function clampText(text: string): string {
  if (typeof text !== 'string' || text.length <= MAX_TEXT_CHARS) return text;
  return `${text.slice(0, MAX_TEXT_CHARS)}\n\n... [Hypagon REST: response truncated at ${MAX_TEXT_CHARS} chars. Use format "json" with a narrower path or a recipe cap.]`;
}

/** When to use: accepting a wrapper object that arrived as JSON text. */
export function asObject(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  if (!trimmed) return value;
  try {
    return JSON.parse(trimmed);
  } catch {
    return value;
  }
}

/** When to use: accepting a JSON sample that arrived as text (wrap_test). */
export function asJson(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  if (!trimmed) return value;
  try {
    return JSON.parse(trimmed);
  } catch {
    return value;
  }
}

/** When to use: joining manifest/secret rows without blank lines. */
export function lines(items: string[]): string {
  return items.filter(Boolean).join('\n');
}

/** When to use: a bridge error as one bold line. */
export function errorText(code: string | undefined, message: string | undefined): string {
  return `**${code || 'ERROR'}:** ${message || 'The wrapper request failed.'}`;
}

/** When to use: a `wrap_run`/`wrap_test` result — Markdown, JSON records, or both. */
export function resultText(data: any, format: 'markdown' | 'json' | 'both'): string {
  if (!data || data.ok === false) {
    const base = errorText(data?.error?.code, data?.error?.message);
    return data?.markdown && !data.markdown.startsWith('**') ? `${base}\n\n${data.markdown}` : base;
  }

  if (data.dryRun) return previewText(data);

  const markdown = typeof data.markdown === 'string' ? data.markdown : '';
  const records = Array.isArray(data.records) ? data.records : [];
  const json = JSON.stringify(records, null, 2);

  if (format === 'json') return json;
  if (format === 'both') return `${markdown}\n\n### Records\n\n\`\`\`json\n${json}\n\`\`\``;

  const footer = data.status
    ? `\n\n_${[
        `HTTP ${data.status}`,
        formatBytes(data.response?.bytes),
        `${data.durationMs ?? 0} ms`,
        ...(data.paging
          ? [`pages ${data.paging.pages}/${data.paging.cap}${data.paging.more ? ' (+more)' : ''}`]
          : []),
        ...(data.indexed
          ? [
              data.indexed.error
                ? `index failed: ${data.indexed.error}`
                : `indexed ${data.indexed.documents} doc${data.indexed.documents === 1 ? '' : 's'}`,
            ]
          : []),
      ].join(' · ')}_`
    : '';
  return `${markdown}${footer}`.trim();
}

/** When to use: a dry-run result — the exact method, URL, headers and body. */
export function previewText(data: any): string {
  const request = data?.request;
  if (!request) return data?.markdown || '_Dry run — request not sent._';

  const requestLines = [
    `${request.method} ${request.url}`,
    ...Object.entries(request.headers || {}).map(([key, value]) => `${key}: ${value}`),
  ];

  if (typeof request.body === 'string' && request.body) {
    requestLines.push('', prettyMaybeJson(request.body));
  }

  return ['**Dry run** — nothing was sent.', '', '```http', ...requestLines, '```'].join('\n');
}

/** When to use: pretty-printing a JSON body when it is JSON, leaving text alone otherwise. */
export function prettyMaybeJson(text: string): string {
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return text;
  }
}

/** When to use: the run footer's size column. */
export function formatBytes(bytes: number | undefined): string {
  if (!Number.isFinite(bytes) || bytes === undefined) return '0 B';
  if (bytes < 1_024) return `${bytes} B`;
  if (bytes < 1_048_576) return `${(bytes / 1_024).toFixed(1)} kB`;
  return `${(bytes / 1_048_576).toFixed(1)} MB`;
}

/** When to use: `wrap_list` — one line per wrapper, with its generated-tool state. */
export function formatManifest(data: any, cap: number = GENERATED_TOOL_CAP): string {
  const wrappers = Array.isArray(data?.wrappers) ? data.wrappers : [];
  if (wrappers.length === 0) {
    return 'No wrappers saved. Use wrap_create with id, request, inputSchema, and response.';
  }

  // Same deterministic rule the registry uses: exposed wrappers sorted by id, first `cap`.
  const exposedIds = new Set(
    wrappers
      .filter((wrapper: any) => wrapper?.exposeAsTool === true)
      .sort((a: any, b: any) => String(a.id).localeCompare(String(b.id)))
      .slice(0, cap)
      .map((wrapper: any) => String(wrapper.id)),
  );

  const rows = wrappers.map((wrapper: any) => {
    const required = Array.isArray(wrapper.required) && wrapper.required.length > 0
      ? ` · required: ${wrapper.required.join(', ')}`
      : '';
    const secret = wrapper.secret ? ` · secret: ${wrapper.secret}` : '';
    let tool = '';
    if (wrapper.exposeAsTool) {
      tool = cap === 0
        ? ' · tool (disabled: HB_WRAP_MAX_TOOLS=0)'
        : exposedIds.has(String(wrapper.id))
          ? ' · tool'
          : ' · tool (over cap: call wrap_run)';
    }
    const verified = wrapper.lastVerified ? ` · verified ${String(wrapper.lastVerified).slice(0, 10)}` : ' · never verified';
    const methods = Array.isArray(wrapper.methods) && wrapper.methods.length ? wrapper.methods.join('/') : wrapper.method;
    return `${wrapper.id} — ${wrapper.name} (${methods} ${wrapper.host}${wrapper.mutating ? ', mutating' : ''})${required}${secret}${tool}${verified}`;
  });

  const header = `### Wrappers (${wrappers.length}) · generated ${exposedIds.size}/${cap}`;
  return `${header}\n${lines(rows)}`;
}

/**
 * Explain why a saved wrapper with `exposeAsTool: true` is not a registered tool. Empty when
 * it is registered, or when the wrapper did not ask to be.
 */
export function generatedWarning(wrapper: any, sync: { cap: number; exposed: string[] }): string {
  if (wrapper?.exposeAsTool !== true) return '';
  const id = String(wrapper.id || '');
  if (sync.exposed.includes(id)) return '';

  if (sync.cap === 0) {
    return `\n\n⚠ ${id} is not registered as a generated tool: HB_WRAP_MAX_TOOLS=0 disables generated tools. Call it with wrap_run, or raise the cap.`;
  }
  return `\n\n⚠ ${id} is not registered as a generated tool: the ${sync.cap}-tool cap is full (the first ${sync.cap} exposed wrappers by id win). Call it with wrap_run, or set HB_WRAP_MAX_TOOLS higher.`;
}

/** When to use: `wrap_secret_list` — names, headers and bound hosts, never values. */
export function formatSecrets(data: any): string {
  const secrets = Array.isArray(data?.secrets) ? data.secrets : [];
  const warning = typeof data?.warning === 'string' && data.warning ? `\n\n_${data.warning}_` : '';
  if (secrets.length === 0) {
    return `No secrets saved. A human can add one in Settings → Wrappers.${warning}`;
  }
  return lines(
    secrets.map((secret: any) => {
      const hosts = Array.isArray(secret.allowedHosts) ? secret.allowedHosts.join(', ') : '';
      const kind = secret.kind === 'oauth2' ? 'oauth2 · ' : '';
      return `${secret.name} · ${kind}${secret.header} · ${hosts}`;
    }),
  ) + warning;
}

/** When to use: a successful tool result (clamped). */
export function toolSuccess(text: string) {
  return { content: [{ type: 'text' as const, text: clampText(text) }] };
}

/** When to use: a failed tool result (clamped, marked as an error). */
export function toolError(text: string) {
  return { isError: true, content: [{ type: 'text' as const, text: clampText(text) }] };
}

/** When to use: a bridge/transport failure — log it, then answer the tool call as an error. */
export function bridgeFailure(err: any) {
  logWrap(`Bridge error: ${err?.message || err}`, 'error');
  return toolError(`[Hypagon REST] ${err?.message || err}`);
}

/** The rejection text for a create/update response, or null when it succeeded. */
export function wrapperRejection(response: any): string | null {
  if (response.data?.success) return null;
  const errors = Array.isArray(response.data?.errors)
    ? response.data.errors
    : [response.data?.error || `HTTP ${response.status}`];
  return `Wrapper rejected:\n- ${errors.join('\n- ')}`;
}

/**
 * When to use: executing a saved wrapper — `wrap_run` and the generated `wrap_<id>` tools call
 * the same endpoint with the same payload shape, so the request and its text live here.
 */
export async function runWrapperText(input: {
  id: string;
  args: unknown;
  format: 'markdown' | 'json' | 'both';
  maxPages?: number;
}): Promise<{ ok: boolean; text: string }> {
  const response = await callBridge('/wrap/run', 'POST', {
    id: input.id,
    args: input.args,
    format: input.format,
    maxPages: input.maxPages,
  });
  const data = response.data;
  if (!data) return { ok: false, text: `No response from the wrapper bridge (HTTP ${response.status}).` };
  return { ok: data.ok !== false, text: resultText(data, input.format) };
}
/** When to use: turning a bridge refusal into the meta-tool error shape with its published code. */
export function failureText(data: any, fallback: string): { error: string } {
  return { error: errorText(data?.code, data?.error || fallback) };
}

