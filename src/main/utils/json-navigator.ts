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

/** When to use: reading a JSON query result (value, path, truncated). */
export interface JsonQueryResult {
  path: string;
  view: string;
  matchCount?: number;
  data: any;
}

import { evaluateJsonFilter, resolveJsonPath } from './json-navigator-path.js';

/** When to use: querying and filtering captured JSON payloads. */
export class JsonNavigator {
  /**
   * Evaluates a query against a JSON structure.
   */
  public static query(root: any, options: JsonQueryOptions = {}): JsonQueryResult {
    const view = options.view || 'value';
    const limit = options.limit !== undefined ? Math.max(1, options.limit) : 25;
    const maxStrLen = options.maxStringLength || 250;
    const targetPath = (options.path || '').trim();

    // 1. Resolve path (if provided)
    let current = root;
    if (targetPath && targetPath !== '$' && targetPath !== '.') {
      current = this.resolvePath(root, targetPath);
    }

    // 1b. Apply filter predicate parameter if provided
    if (options.filterPredicate && Array.isArray(current)) {
      current = evaluateJsonFilter(current, options.filterPredicate);
    }

    // 2. Apply requested view
    switch (view) {
      case 'schema':
        return {
          path: targetPath || '$',
          view: 'schema',
          data: this.generateSchema(current),
        };

      case 'keys':
        if (current && typeof current === 'object' && !Array.isArray(current)) {
          return {
            path: targetPath || '$',
            view: 'keys',
            matchCount: Object.keys(current).length,
            data: Object.keys(current),
          };
        } else if (Array.isArray(current)) {
          return {
            path: targetPath || '$',
            view: 'keys',
            matchCount: current.length,
            data: {
              arrayLength: current.length,
              sampleIndices: current.slice(0, 5).map((_, i) => i),
              itemKeys: current[0] && typeof current[0] === 'object' && !Array.isArray(current[0]) ? Object.keys(current[0]) : typeof current[0],
            },
          };
        }
        return {
          path: targetPath || '$',
          view: 'keys',
          data: typeof current,
        };

      case 'summary':
        if (Array.isArray(current)) {
          const sample = current.slice(0, Math.min(3, current.length)).map(item => this.truncateStrings(item, maxStrLen));
          return {
            path: targetPath || '$',
            view: 'summary',
            matchCount: current.length,
            data: {
              totalItems: current.length,
              sample,
              commonKeys: current[0] && typeof current[0] === 'object' ? Object.keys(current[0]) : undefined,
            },
          };
        } else if (current && typeof current === 'object') {
          const summary: Record<string, any> = {};
          for (const [k, v] of Object.entries(current)) {
            if (Array.isArray(v)) {
              summary[k] = `Array(${v.length})`;
            } else if (v && typeof v === 'object') {
              summary[k] = `Object(${Object.keys(v).length} keys)`;
            } else {
              summary[k] = typeof v === 'string' && v.length > 50 ? `${v.slice(0, 50)}...` : v;
            }
          }
          return {
            path: targetPath || '$',
            view: 'summary',
            matchCount: Object.keys(current).length,
            data: summary,
          };
        }
        if (typeof current === 'string') {
          return {
            path: targetPath || '$',
            view: 'summary',
            data: {
              type: 'string',
              length: current.length,
              preview: current.length > maxStrLen ? `${current.slice(0, maxStrLen)}... [${current.length - maxStrLen} more characters]` : current,
            },
          };
        }
        return {
          path: targetPath || '$',
          view: 'summary',
          data: current,
        };

      case 'value':
      default: {
        let truncated = current;
        if (Array.isArray(current)) {
          const sliced = current.slice(0, limit);
          truncated = sliced.map(item => this.truncateStrings(item, maxStrLen));
          return {
            path: targetPath || '$',
            view: 'value',
            matchCount: current.length,
            data: truncated,
          };
        }
        truncated = this.truncateStrings(current, maxStrLen);
        return {
          path: targetPath || '$',
          view: 'value',
          data: truncated,
        };
      }
    }
  }

  /**
   * Resolves dot-notation, array indexing, slicing, wildcards, and simple predicates.
   */
  public static resolvePath(root: any, pathStr: string): any {
    return resolveJsonPath(root, pathStr);
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
