/** When to use: resolving a JSONPath-like expression against a JSON value. */
export function resolveJsonPath(root: any, pathStr: string): any {
  if (root === undefined || root === null) return undefined;

  const normalized = pathStr.replace(/^\$\.?/, '');
  if (!normalized) return root;

  const tokens = tokenizePath(normalized);
  let curr = root;
  for (let i = 0; i < tokens.length; i++) {
    if (curr === undefined || curr === null) return undefined;
    const token = tokens[i];
    if (token.startsWith('[') && token.endsWith(']')) {
      const inner = token.slice(1, -1).trim();
      if (inner === '*') {
        if (!Array.isArray(curr)) return undefined;
        const remainingTokens = tokens.slice(i + 1);
        if (remainingTokens.length === 0) return curr;
        const subPath = remainingTokens.join('.');
        return curr.map((item: any) => resolveJsonPath(item, subPath)).filter((x: any) => x !== undefined);
      }
      if (inner.includes('..')) {
        if (!Array.isArray(curr)) return undefined;
        const [startStr, endStr] = inner.split('..');
        const start = startStr ? parseInt(startStr, 10) : 0;
        const end = endStr ? parseInt(endStr, 10) : curr.length;
        const sliced = curr.slice(start, end);
        const remainingTokens = tokens.slice(i + 1);
        if (remainingTokens.length > 0) {
          const subPath = remainingTokens.join('.');
          return sliced.map((item: any) => resolveJsonPath(item, subPath)).filter((x: any) => x !== undefined);
        }
        curr = sliced;
        continue;
      }
      if (inner.startsWith('?')) {
        if (!Array.isArray(curr)) return undefined;
        const expr = inner.slice(1).trim();
        const filtered = evaluateJsonFilter(curr, expr);
        const remainingTokens = tokens.slice(i + 1);
        if (remainingTokens.length > 0) {
          const subPath = remainingTokens.join('.');
          return filtered.map((item: any) => resolveJsonPath(item, subPath)).filter((x: any) => x !== undefined);
        }
        curr = filtered;
        continue;
      }
      const num = parseInt(inner, 10);
      if (!isNaN(num)) {
        curr = Array.isArray(curr) ? curr[num] : undefined;
        continue;
      }
      const unquoted = inner.replace(/^['"]|['"]$/g, '');
      curr = curr[unquoted];
      continue;
    }
    if (token === '*') {
      if (typeof curr !== 'object' || Array.isArray(curr)) return undefined;
      const remainingTokens = tokens.slice(i + 1);
      if (remainingTokens.length === 0) return Object.values(curr);
      const subPath = remainingTokens.join('.');
      return Object.values(curr).map(val => resolveJsonPath(val, subPath)).filter(x => x !== undefined);
    }
    curr = curr[token];
  }
  return curr;
}

/** When to use: filtering JSON arrays with a simple predicate expression. */
export function evaluateJsonFilter(arr: any[], expr: string): any[] {
  const match = expr.match(/^([a-zA-Z0-9_.$]+)\s*(===|==|=|!=|<=|>=|<|>)\s*(.+)$/);
  if (!match) {
    const key = expr.trim();
    return arr.filter(item => Boolean(resolveJsonPath(item, key)));
  }
  const [, key, op, rawVal] = match;
  let targetVal: any = rawVal.trim();
  if (targetVal === 'true') targetVal = true;
  else if (targetVal === 'false') targetVal = false;
  else if (targetVal === 'null') targetVal = null;
  else if (/^-?\d+(\.\d+)?$/.test(targetVal)) targetVal = parseFloat(targetVal);
  else targetVal = targetVal.replace(/^['"]|['"]$/g, '');
  return arr.filter(item => {
    const actual = resolveJsonPath(item, key);
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

function tokenizePath(pathStr: string): string[] {
  const tokens: string[] = [];
  let current = '';
  let inBracket = false;
  for (let i = 0; i < pathStr.length; i++) {
    const char = pathStr[i];
    if (char === '[' && !inBracket) {
      if (current.trim()) { tokens.push(current.trim()); current = ''; }
      inBracket = true;
      current += char;
    } else if (char === ']' && inBracket) {
      current += char;
      tokens.push(current.trim());
      current = '';
      inBracket = false;
    } else if (char === '.' && !inBracket) {
      if (current.trim()) { tokens.push(current.trim()); current = ''; }
    } else {
      current += char;
    }
  }
  if (current.trim()) tokens.push(current.trim());
  return tokens;
}
