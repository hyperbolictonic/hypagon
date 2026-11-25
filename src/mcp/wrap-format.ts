/**
 * How a bridge payload becomes text an agent can read: the one-line list rows, the run footer,
 * the dry-run preview and the secret/validation messages.
 *
 * Why a module: formatting is the largest part of the surface and it has no I/O — every function
 * here is payload in, string out.
 */
import { GENERATED_TOOL_CAP } from './wrap-config.js';
import type { BridgeResponse } from './wrap-bridge.js';
import { errorText } from './wrap-messages.js';

/**
 * Parse a JSON string, or pass the value through unchanged.
 *
 * Why one function: `asObject` (arguments) and `asJson` (samples) were the same twelve lines with
 * two names — the duplicate gate caught the pair. `wrap_derive`'s sample, `wrap_test`'s sample and
 * a flat `args` object all just mean "accept either a JSON string or the parsed value".
 */
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

function lines(items: string[]): string {
  return items.filter(Boolean).join('\n');
}

/** When to use: `wrap_run` and a generated tool — the markdown/json record rendering. */
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

/** When to use: a dry run — quote the request that would have been sent. */
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

function prettyMaybeJson(text: string): string {
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return text;
  }
}

/** Bytes as B/kB/MB, for the run footer. */
export function formatBytes(bytes: number | undefined): string {
  if (!Number.isFinite(bytes) || bytes === undefined) return '0 B';
  if (bytes < 1_024) return `${bytes} B`;
  if (bytes < 1_048_576) return `${(bytes / 1_024).toFixed(1)} kB`;
  return `${(bytes / 1_048_576).toFixed(1)} MB`;
}

/** When to use: `wrap_list` and `wrap_reload` — one line per saved wrapper. */
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
    return `\n\n⚠ ${id} is not registered as a generated tool: HB_WRAP_MAX_TOOLS=0 (or KUANG_WRAP_MAX_TOOLS=0) disables generated tools. Call it with wrap_run, or raise the cap.`;
  }
  return `\n\n⚠ ${id} is not registered as a generated tool: the ${sync.cap}-tool cap is full (the first ${sync.cap} exposed wrappers by id win). Call it with wrap_run, or set HB_WRAP_MAX_TOOLS (or KUANG_WRAP_MAX_TOOLS) higher.`;
}

/** When to use: `wrap_secret_list` — names and hosts, never values. */
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

/** The wrapper write tools report a validation failure the same way. */
export function wrapperRejection(response: BridgeResponse): string | undefined {
  if (response.data?.success) return undefined;
  const errors = Array.isArray(response.data?.errors)
    ? response.data.errors
    : [response.data?.error || `HTTP ${response.status}`];
  return `Wrapper rejected:\n- ${errors.join('\n- ')}`;
}
