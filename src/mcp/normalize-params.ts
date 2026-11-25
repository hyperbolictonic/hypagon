/**
 * The argument normalizer behind `tools/call`.
 *
 * Why a module: different harnesses send the same call five different ways — a
 * standard `arguments` object, a serialized JSON string, a nested `{arguments}`,
 * or flat properties beside the tool name — and each tool accepts a few aliases.
 * Each rule is a step here, so a new alias lands in one place instead of a
 * 125-line function.
 *
 * Nothing is dropped: values are copied and aliases are added, never removed.
 */

/** The argument container some harnesses use instead of `arguments`. */
const CONTAINER_KEYS = ['args', 'parameters', 'data', 'input', 'properties', 'props'] as const;

/** Properties that belong to the JSON-RPC/MCP envelope, not to the tool. */
const PROTOCOL_KEYS = new Set([
  'name',
  'arguments',
  'args',
  'parameters',
  'properties',
  'props',
  'data',
  '_meta',
  'task',
  'method',
  'jsonrpc',
]);

function isObject(value: unknown): value is Record<string, any> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/** Step 1: find the argument container, whether nested, aliased or serialized. */
function pickContainer(params: Record<string, any>): Record<string, any> | null {
  let container: any = params.arguments;
  if (container === undefined || container === null || (isObject(container) && Object.keys(container).length === 0)) {
    for (const key of CONTAINER_KEYS) {
      if (isObject(params[key])) {
        container = params[key];
        break;
      }
    }
  }
  // Parse JSON string if arguments arrived as a serialized string (OpenAI function calling)
  if (typeof container === 'string') {
    try {
      const parsed = JSON.parse(container);
      if (isObject(parsed)) container = parsed;
    } catch {
      // not JSON object
    }
  }
  // Unwrap nested arguments object if doubled: { arguments: { ... } } or { input: { ... } }
  if (isObject(container)) {
    if (isObject(container.arguments)) container = container.arguments;
    else if (isObject(container.input)) container = container.input;
  }
  return isObject(container) ? container : null;
}

/** Step 2: gather flat callers' properties (`{ name: 'act', mark_id: 1 }`). */
function topLevelArguments(params: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = {};
  for (const [key, value] of Object.entries(params)) {
    if (!PROTOCOL_KEYS.has(key) && value !== undefined) out[key] = value;
  }
  return out;
}

/** Step 3: keep every key and add its snake_case spelling. */
function addSnakeCase(rawArgs: Record<string, any>): Record<string, any> {
  const normalized: Record<string, any> = {};
  for (const [key, value] of Object.entries(rawArgs)) {
    normalized[key] = value;
    const snakeKey = key.replace(/([A-Z])/g, '_$1').toLowerCase();
    if (snakeKey !== key && normalized[snakeKey] === undefined) normalized[snakeKey] = value;
  }
  return normalized;
}

/** Step 4: the per-parameter aliases the tools accept. */
function applyAliases(normalized: Record<string, any>): Record<string, any> {
  // mark_id
  const markVal =
    normalized.mark_id ??
    normalized.markId ??
    normalized.mark ??
    normalized.badge ??
    normalized.index ??
    normalized.num ??
    normalized.number ??
    (normalized.selector === undefined && normalized.tab_id === undefined && normalized.id !== undefined
      ? normalized.id
      : undefined);
  if (markVal !== undefined) normalized.mark_id = isNaN(Number(markVal)) ? markVal : Number(markVal);

  // script / JS
  const scriptVal = normalized.script ?? normalized.code ?? normalized.js ?? normalized.expression ?? normalized.javascript;
  if (scriptVal !== undefined) normalized.script = String(scriptVal);

  // text
  const textVal =
    normalized.text ??
    normalized.value ??
    normalized.content ??
    (normalized.selector === undefined && typeof normalized.input === 'string' ? normalized.input : undefined);
  if (textVal !== undefined) normalized.text = String(textVal);

  // tab_id
  const tabVal =
    normalized.tab_id ??
    normalized.tabId ??
    normalized.tab ??
    (normalized.mark_id === undefined && normalized.id !== undefined ? normalized.id : undefined);
  if (tabVal !== undefined) normalized.tab_id = typeof tabVal === 'number' ? `tab_${tabVal}` : String(tabVal);

  // url
  const urlVal =
    normalized.url ??
    normalized.destination ??
    normalized.target ??
    normalized.link ??
    normalized.href ??
    normalized.address ??
    normalized.uri ??
    normalized.URL;
  if (urlVal !== undefined) normalized.url = String(urlVal);

  // reason
  const reasonVal = normalized.reason ?? normalized.message ?? normalized.prompt;
  if (reasonVal !== undefined) normalized.reason = String(reasonVal);

  // selector
  const selectorVal =
    normalized.selector ??
    normalized.element ??
    normalized.target ??
    normalized.css ??
    (normalized.search_query === undefined && normalized.query !== undefined ? normalized.query : undefined);
  if (selectorVal !== undefined) normalized.selector = String(selectorVal);

  // key
  const keyVal = normalized.key ?? normalized.key_name ?? normalized.button;
  if (keyVal !== undefined) normalized.key = String(keyVal);

  // Booleans / numbers / settings
  if (normalized.closeToTray !== undefined && normalized.close_to_tray === undefined) normalized.close_to_tray = normalized.closeToTray;
  if (normalized.autoDismissConsent !== undefined && normalized.auto_dismiss_consent === undefined) normalized.auto_dismiss_consent = normalized.autoDismissConsent;
  if (normalized.timeoutSeconds !== undefined && normalized.timeout_seconds === undefined) normalized.timeout_seconds = normalized.timeoutSeconds;
  if (normalized.bringToFront !== undefined && normalized.bring_to_front === undefined) normalized.bring_to_front = normalized.bringToFront;
  if (normalized.clearFirst !== undefined && normalized.clear_first === undefined) normalized.clear_first = normalized.clearFirst;

  return normalized;
}

/** When to use: the tools/call interceptor — one call's parameters, normalized. */
export function normalizeIncomingParams(params: any): Record<string, any> {
  if (!params || typeof params !== 'object') return {};
  const container = pickContainer(params);
  const rawArgs = { ...topLevelArguments(params), ...(container ?? {}) };
  return applyAliases(addSnakeCase(rawArgs));
}
