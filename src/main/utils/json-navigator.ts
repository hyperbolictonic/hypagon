/**
 * JSON Navigator Engine
 * Token-efficient JSON inspection, schema distillation, and JSONPath slicing
 * designed specifically for multimodal LLMs to navigate massive API bodies.
 */

export interface JsonQueryOptions {
  path?: string;
  view?: 'value' | 'schema' | 'keys' | 'summary';
  limit?: number;
  maxStringLength?: number;
  filterPredicate?: string;
}

/** When to use: one JSON navigator reply — the resolved path, the view name and the sliced data. */
export interface JsonQueryResult {
  path: string;
  view: string;
  matchCount?: number;
  data: any;
}

/** The context every view renders against: the resolved path and the two caps. */
interface JsonViewContext {
  path: string;
  limit: number;
  maxStrLen: number;
}

/** When to use: `query` with view=schema — the shape of the value, not its content. */
function schemaView(current: any, ctx: JsonViewContext): JsonQueryResult {
  return {
    path: ctx.path || '$',
    view: 'schema',
    data: JsonNavigator.generateSchema(current),
  };
}

/** When to use: `query` with view=keys — the key list, with array shapes described. */
function keysView(current: any, ctx: JsonViewContext): JsonQueryResult {
  if (current && typeof current === 'object' && !Array.isArray(current)) {
    return {
      path: ctx.path || '$',
      view: 'keys',
      matchCount: Object.keys(current).length,
      data: Object.keys(current),
    };
  }
  if (Array.isArray(current)) {
    return {
      path: ctx.path || '$',
      view: 'keys',
      matchCount: current.length,
      data: {
        arrayLength: current.length,
        sampleIndices: current.slice(0, 5).map((_, i) => i),
        itemKeys:
          current[0] && typeof current[0] === 'object' && !Array.isArray(current[0])
            ? Object.keys(current[0])
            : typeof current[0],
      },
    };
  }
  return { path: ctx.path || '$', view: 'keys', data: typeof current };
}

/** When to use: `query` with view=summary — sizes and samples instead of the payload. */
function summaryView(current: any, ctx: JsonViewContext): JsonQueryResult {
  if (Array.isArray(current)) {
    const sample = current.slice(0, Math.min(3, current.length)).map((item) => JsonNavigator.truncateStrings(item, ctx.maxStrLen));
    return {
      path: ctx.path || '$',
      view: 'summary',
      matchCount: current.length,
      data: {
        totalItems: current.length,
        sample,
        commonKeys: current[0] && typeof current[0] === 'object' ? Object.keys(current[0]) : undefined,
      },
    };
  }
  if (current && typeof current === 'object') {
    const summary: Record<string, any> = {};
    for (const [key, value] of Object.entries(current)) {
      if (Array.isArray(value)) {
        summary[key] = `Array(${value.length})`;
      } else if (value && typeof value === 'object') {
        summary[key] = `Object(${Object.keys(value).length} keys)`;
      } else {
        summary[key] = typeof value === 'string' && value.length > 50 ? `${value.slice(0, 50)}...` : value;
      }
    }
    return {
      path: ctx.path || '$',
      view: 'summary',
      matchCount: Object.keys(current).length,
      data: summary,
    };
  }
  if (typeof current === 'string') {
    return {
      path: ctx.path || '$',
      view: 'summary',
      data: {
        type: 'string',
        length: current.length,
        preview:
          current.length > ctx.maxStrLen
            ? `${current.slice(0, ctx.maxStrLen)}... [${current.length - ctx.maxStrLen} more characters]`
            : current,
      },
    };
  }
  return { path: ctx.path || '$', view: 'summary', data: current };
}

/** When to use: `query` with view=value (the default) — the value, capped and truncated. */
function valueView(current: any, ctx: JsonViewContext): JsonQueryResult {
  if (Array.isArray(current)) {
    return {
      path: ctx.path || '$',
      view: 'value',
      matchCount: current.length,
      data: current.slice(0, ctx.limit).map((item) => JsonNavigator.truncateStrings(item, ctx.maxStrLen)),
    };
  }
  return {
    path: ctx.path || '$',
    view: 'value',
    data: JsonNavigator.truncateStrings(current, ctx.maxStrLen),
  };
}

/** When to use: `query_json_data` — path/view/limit slicing of a large JSON body. */
export class JsonNavigator {
  /**
   * Evaluates a query against a JSON structure.
   */
  public static query(root: any, options: JsonQueryOptions = {}): JsonQueryResult {
    const view = options.view || 'value';
    const ctx: JsonViewContext = {
      path: (options.path || '').trim(),
      limit: options.limit !== undefined ? Math.max(1, options.limit) : 25,
      maxStrLen: options.maxStringLength || 250,
    };

    // 1. Resolve path (if provided)
    let current = root;
    if (ctx.path && ctx.path !== '$' && ctx.path !== '.') {
      current = this.resolvePath(root, ctx.path);
    }

    // 1b. Apply filter predicate parameter if provided
    if (options.filterPredicate && Array.isArray(current)) {
      current = this.evaluateFilter(current, options.filterPredicate);
    }

    // 2. Apply requested view
    switch (view) {
      case 'schema':
        return schemaView(current, ctx);
      case 'keys':
        return keysView(current, ctx);
      case 'summary':
        return summaryView(current, ctx);
      case 'value':
      default:
        return valueView(current, ctx);
    }
  }

  /**
   * Resolves dot-notation, array indexing, slicing, wildcards, and simple predicates.
   */
  public static resolvePath(root: any, pathStr: string): any {
    if (root === undefined || root === null) return undefined;

    // Normalize path by stripping leading $. or $
    const normalized = pathStr.replace(/^\$\.?/, '');
    if (!normalized) return root;

    // Tokenize into path segments
    // Matches: property names, [0], [0..4], [*], [?key=val], [?key>val], [?key<val]
    const tokens = this.tokenizePath(normalized);
    let curr = root;

    for (let i = 0; i < tokens.length; i++) {
      if (curr === undefined || curr === null) return undefined;
      const token = tokens[i];

      // Array index / slice / filter
      if (token.startsWith('[') && token.endsWith(']')) {
        const inner = token.slice(1, -1).trim();

        // 1. Wildcard: [*]
        if (inner === '*') {
          if (!Array.isArray(curr)) return undefined;
          const remainingTokens = tokens.slice(i + 1);
          if (remainingTokens.length === 0) return curr;
          const subPath = remainingTokens.join('.');
          return curr.map(item => this.resolvePath(item, subPath)).filter(x => x !== undefined);
        }

        // 2. Slice range: [start..end]
        if (inner.includes('..')) {
          if (!Array.isArray(curr)) return undefined;
          const [startStr, endStr] = inner.split('..');
          const start = startStr ? parseInt(startStr, 10) : 0;
          const end = endStr ? parseInt(endStr, 10) : curr.length;
          const sliced = curr.slice(start, end);
          const remainingTokens = tokens.slice(i + 1);
          if (remainingTokens.length > 0) {
            const subPath = remainingTokens.join('.');
            return sliced.map(item => this.resolvePath(item, subPath)).filter(x => x !== undefined);
          }
          curr = sliced;
          continue;
        }

        // 3. Simple filter: [?key == val], [?key = val], [?key < val], [?key > val], [?key]
        if (inner.startsWith('?')) {
          if (!Array.isArray(curr)) return undefined;
          const expr = inner.slice(1).trim();
          const filtered = this.evaluateFilter(curr, expr);
          const remainingTokens = tokens.slice(i + 1);
          if (remainingTokens.length > 0) {
            const subPath = remainingTokens.join('.');
            return filtered.map(item => this.resolvePath(item, subPath)).filter(x => x !== undefined);
          }
          curr = filtered;
          continue;
        }

        // 4. Numeric index: [3]
        const num = parseInt(inner, 10);
        if (!isNaN(num)) {
          curr = Array.isArray(curr) ? curr[num] : undefined;
          continue;
        }

        // 5. Quoted key: ['foo'] or ["foo"]
        const unquoted = inner.replace(/^['"]|['"]$/g, '');
        curr = curr[unquoted];
        continue;
      }

      // Wildcard object key: *
      if (token === '*') {
        if (typeof curr !== 'object' || Array.isArray(curr)) return undefined;
        const remainingTokens = tokens.slice(i + 1);
        if (remainingTokens.length === 0) return Object.values(curr);
        const subPath = remainingTokens.join('.');
        return Object.values(curr).map(val => this.resolvePath(val, subPath)).filter(x => x !== undefined);
      }

      // Normal property lookup
      curr = curr[token];
    }

    return curr;
  }

  /**
   * Tokenizes a path string into dot and bracket tokens.
   */
  private static tokenizePath(pathStr: string): string[] {
    const tokens: string[] = [];
    let current = '';
    let inBracket = false;

    for (let i = 0; i < pathStr.length; i++) {
      const char = pathStr[i];

      if (char === '[' && !inBracket) {
        if (current.trim()) {
          tokens.push(current.trim());
          current = '';
        }
        inBracket = true;
        current += char;
      } else if (char === ']' && inBracket) {
        current += char;
        tokens.push(current.trim());
        current = '';
        inBracket = false;
      } else if (char === '.' && !inBracket) {
        if (current.trim()) {
          tokens.push(current.trim());
          current = '';
        }
      } else {
        current += char;
      }
    }

    if (current.trim()) {
      tokens.push(current.trim());
    }

    return tokens;
  }

  /**
   * Simple predicate evaluator for array filtering.
   */
  private static evaluateFilter(arr: any[], expr: string): any[] {
    // Matches: key < 300, key > 100, key == 'London', key = true, key != false, or truthy key
    const match = expr.match(/^([a-zA-Z0-9_.$]+)\s*(===|==|=|!=|<=|>=|<|>)\s*(.+)$/);
    if (!match) {
      // Truthy check: [?isAvailable]
      const key = expr.trim();
      return arr.filter(item => Boolean(this.resolvePath(item, key)));
    }

    const [, key, op, rawVal] = match;
    let targetVal: any = rawVal.trim();

    // Parse primitive values
    if (targetVal === 'true') targetVal = true;
    else if (targetVal === 'false') targetVal = false;
    else if (targetVal === 'null') targetVal = null;
    else if (/^-?\d+(\.\d+)?$/.test(targetVal)) targetVal = parseFloat(targetVal);
    else targetVal = targetVal.replace(/^['"]|['"]$/g, '');

    return arr.filter(item => {
      const actual = this.resolvePath(item, key);
      switch (op) {
        case '=':
        case '==':
        case '===': return actual == targetVal;
        case '!=': return actual != targetVal;
        case '<': return actual < targetVal;
        case '<=': return actual <= targetVal;
        case '>': return actual > targetVal;
        case '>=': return actual >= targetVal;
        default: return false;
      }
    });
  }

  /**
   * Generates a recursive, token-efficient schema signature of an object/array.
   */
  public static generateSchema(data: any, depth = 0, maxDepth = 4): any {
    if (data === null) return 'null';
    if (data === undefined) return 'undefined';

    const type = typeof data;
    if (type !== 'object') {
      return type;
    }

    if (depth >= maxDepth) {
      return Array.isArray(data) ? `Array(${data.length})` : `Object(${Object.keys(data).length} keys)`;
    }

    if (Array.isArray(data)) {
      if (data.length === 0) return 'Array(0)';
      // Take up to 2 items to sample union schema
      const sampleItem = this.generateSchema(data[0], depth + 1, maxDepth);
      return `Array(${data.length}) of ${typeof sampleItem === 'string' ? sampleItem : JSON.stringify(sampleItem)}`;
    }

    const schema: Record<string, any> = {};
    const keys = Object.keys(data);
    for (const key of keys.slice(0, 40)) {
      const val = data[key];
      if (Array.isArray(val)) {
        if (val.length === 0) {
          schema[key] = 'Array(0)';
        } else {
          const itemSample = this.generateSchema(val[0], depth + 1, maxDepth);
          schema[key] = `Array(${val.length}) of ${typeof itemSample === 'string' ? itemSample : JSON.stringify(itemSample)}`;
        }
      } else if (val && typeof val === 'object') {
        schema[key] = this.generateSchema(val, depth + 1, maxDepth);
      } else {
        schema[key] = typeof val;
      }
    }

    if (keys.length > 40) {
      schema['...'] = `+${keys.length - 40} more keys`;
    }

    return schema;
  }

  /**
   * Truncates long string values (e.g. base64 tokens, HTML blobs) within an object to prevent token blowups.
   */
  public static truncateStrings(data: any, maxLen = 250, depth = 0): any {
    if (depth > 10) return data;
    if (typeof data === 'string') {
      return data.length > maxLen ? `${data.slice(0, maxLen)}... [${data.length - maxLen} chars truncated]` : data;
    }
    if (Array.isArray(data)) {
      return data.map(item => this.truncateStrings(item, maxLen, depth + 1));
    }
    if (data && typeof data === 'object') {
      const res: Record<string, any> = {};
      for (const [k, v] of Object.entries(data)) {
        res[k] = this.truncateStrings(v, maxLen, depth + 1);
      }
      return res;
    }
    return data;
  }
}
