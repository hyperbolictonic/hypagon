/**
 * Universal request-level argument normaliser.
 *
 * Clients disagree about argument names (camelCase, snake_case, stringified JSON). This maps
 * the known aliases onto the canonical names before schema validation, so a tool call is not
 * rejected over a spelling difference.
 */

export function normalizeIncomingParams(params: any): Record<string, any> {
  if (!params || typeof params !== 'object') return {};

  // Standard MCP tools/call structure: { name: string, arguments?: Record<string, any> }
  let container = params.arguments;

  // Some harnesses send args / data / input / parameters as the argument container object
  if (container === undefined || container === null || (typeof container === 'object' && Object.keys(container).length === 0)) {
    if (params.args !== undefined && typeof params.args === 'object' && params.args !== null) {
      container = params.args;
    } else if (params.parameters !== undefined && typeof params.parameters === 'object' && params.parameters !== null) {
      container = params.parameters;
    } else if (params.data !== undefined && typeof params.data === 'object' && params.data !== null) {
      container = params.data;
    } else if (params.input !== undefined && typeof params.input === 'object' && params.input !== null) {
      container = params.input;
    } else if (params.properties !== undefined && typeof params.properties === 'object' && params.properties !== null) {
      container = params.properties;
    } else if (params.props !== undefined && typeof params.props === 'object' && params.props !== null) {
      container = params.props;
    }
  }

  // Parse JSON string if arguments arrived as a serialized string (OpenAI function calling)
  if (typeof container === 'string') {
    try {
      const parsed = JSON.parse(container);
      if (parsed && typeof parsed === 'object') {
        container = parsed;
      }
    } catch {
      // not JSON object
    }
  }

  // Unwrap nested arguments object if doubled: { arguments: { ... } } or { input: { ... } }
  if (container && typeof container === 'object') {
    if (container.arguments && typeof container.arguments === 'object') {
      container = container.arguments;
    } else if (container.input && typeof container.input === 'object') {
      container = container.input;
    }
  }

  // Gather any non-protocol top-level properties on params (for flat callers e.g. { name: 'act', mark_id: 1 } or { name: 'act', id: 1 })
  const protocolKeys = new Set(['name', 'arguments', 'args', 'parameters', 'properties', 'props', 'data', '_meta', 'task', 'method', 'jsonrpc']);
  const topLevelArgs: Record<string, any> = {};
  for (const [k, v] of Object.entries(params)) {
    if (!protocolKeys.has(k) && v !== undefined) {
      topLevelArgs[k] = v;
    }
  }

  const rawArgs = {
    ...topLevelArgs,
    ...(typeof container === 'object' && container !== null ? container : {}),
  };

  const normalized: Record<string, any> = {};
  // Copy and convert camelCase to snake_case
  for (const [k, v] of Object.entries(rawArgs)) {
    normalized[k] = v;
    const snakeKey = k.replace(/([A-Z])/g, '_$1').toLowerCase();
    if (snakeKey !== k && normalized[snakeKey] === undefined) {
      normalized[snakeKey] = v;
    }
  }

  // Aliases for mark_id
  const markVal = normalized.mark_id ?? normalized.markId ?? normalized.mark ?? normalized.badge ?? normalized.index ?? normalized.num ?? normalized.number ?? (normalized.selector === undefined && normalized.tab_id === undefined && normalized.id !== undefined ? normalized.id : undefined);
  if (markVal !== undefined) {
    normalized.mark_id = isNaN(Number(markVal)) ? markVal : Number(markVal);
  }

  // Aliases for script / JS
  const scriptVal = normalized.script ?? normalized.code ?? normalized.js ?? normalized.expression ?? normalized.javascript;
  if (scriptVal !== undefined) {
    normalized.script = String(scriptVal);
  }

  // Aliases for text
  const textVal = normalized.text ?? normalized.value ?? normalized.content ?? (normalized.selector === undefined && normalized.input !== undefined && typeof normalized.input === 'string' ? normalized.input : undefined);
  if (textVal !== undefined) {
    normalized.text = String(textVal);
  }

  // Aliases for tab_id
  const tabVal = normalized.tab_id ?? normalized.tabId ?? normalized.tab ?? (normalized.mark_id === undefined && normalized.id !== undefined ? normalized.id : undefined);
  if (tabVal !== undefined) {
    normalized.tab_id = typeof tabVal === 'number' ? `tab_${tabVal}` : String(tabVal);
  }

  // Aliases for url
  const urlVal = normalized.url ?? normalized.destination ?? normalized.target ?? normalized.link ?? normalized.href ?? normalized.address ?? normalized.uri ?? normalized.URL;
  if (urlVal !== undefined) {
    normalized.url = String(urlVal);
  }

  // Aliases for reason
  const reasonVal = normalized.reason ?? normalized.message ?? normalized.prompt;
  if (reasonVal !== undefined) {
    normalized.reason = String(reasonVal);
  }

  // Aliases for selector
  const selectorVal = normalized.selector ?? normalized.element ?? normalized.target ?? normalized.css ?? (normalized.search_query === undefined && normalized.query !== undefined ? normalized.query : undefined);
  if (selectorVal !== undefined) {
    normalized.selector = String(selectorVal);
  }

  // Aliases for key
  const keyVal = normalized.key ?? normalized.key_name ?? normalized.button;
  if (keyVal !== undefined) {
    normalized.key = String(keyVal);
  }

  // Booleans / numbers / settings
  if (normalized.closeToTray !== undefined && normalized.close_to_tray === undefined) normalized.close_to_tray = normalized.closeToTray;
  if (normalized.autoDismissConsent !== undefined && normalized.auto_dismiss_consent === undefined) normalized.auto_dismiss_consent = normalized.autoDismissConsent;
  if (normalized.timeoutSeconds !== undefined && normalized.timeout_seconds === undefined) normalized.timeout_seconds = normalized.timeoutSeconds;
  if (normalized.bringToFront !== undefined && normalized.bring_to_front === undefined) normalized.bring_to_front = normalized.bringToFront;
  if (normalized.clearFirst !== undefined && normalized.clear_first === undefined) normalized.clear_first = normalized.clearFirst;

  return normalized;
}
