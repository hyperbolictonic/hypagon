/**
 * Validation for a credential entered in Settings → Wrappers.
 *
 * Every rule that can refuse a secret is here: the name shape, the value bounds, the
 * host allow-list, the header and prefix, and the OAuth2 client fields. It is pure —
 * it sees whether an existing record exists, never the cipher or the disk — so the
 * store can validate before it encrypts anything.
 *
 * When to use: `SecretStore.set()`. Messages are user-facing; keep them verbatim.
 */
import type { WrapOAuthMetadata, WrapSecretInput, WrapSecretKind } from './secret-types.js';

const NAME_PATTERN = /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/;
const HEADER_PATTERN = /^[A-Za-z0-9!#$%&'*+.^_`|~-]+$/;
const FORBIDDEN_HEADERS = new Set(['host', 'content-length', 'connection', 'transfer-encoding', 'upgrade', 'cookie', 'set-cookie']);
const HOST_PATTERN = /^(\*\.)?[a-z0-9]([a-z0-9.-]*[a-z0-9])?$/;

/** When to use: the normalised fields `set()` applies once validation passes. */
export interface ValidatedSecretInput {
  name: string;
  value: string;
  hosts: string[];
  header: string;
  prefix: string;
  kind: WrapSecretKind;
  oauth2?: WrapOAuthMetadata;
  /** True when an existing secret is kept because the value field was left blank. */
  keepExisting: boolean;
}

/** When to use: validating a settings entry; `existing` says whether the name is already stored. */
export function validateSecretInput(
  input: WrapSecretInput,
  existing: boolean,
): { ok: true; value: ValidatedSecretInput } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  const name = typeof input?.name === 'string' ? input.name.trim() : '';
  const value = typeof input?.value === 'string' ? input.value : '';

  if (!NAME_PATTERN.test(name) || name.length > 64) {
    errors.push('name must start with a lowercase letter and use only lowercase letters, numbers, dot, dash, or underscore');
  }

  const keepExisting = existing && value === '';
  if (!value && !keepExisting) errors.push('value is required');
  if (value.length > 20_000) errors.push('value must be 20000 characters or fewer');
  if (/[\r\n]/.test(value)) errors.push('value must not contain newlines');

  const hosts = normalizeHosts(input?.allowedHosts);
  if (hosts.length === 0) errors.push('allowedHosts must contain at least one host');
  if (hosts.length > 20) errors.push('allowedHosts must contain at most 20 hosts');
  for (const host of hosts) {
    if (!HOST_PATTERN.test(host) || host.includes('..') || host.length > 253) {
      errors.push(`allowedHosts entry "${host}" is not a valid hostname`);
    }
  }

  const header = typeof input?.header === 'string' && input.header.trim() ? input.header.trim() : 'Authorization';
  if (!HEADER_PATTERN.test(header)) errors.push('header must be a valid HTTP header name');
  if (FORBIDDEN_HEADERS.has(header.toLowerCase())) errors.push(`header "${header}" cannot carry a secret`);

  const prefix =
    typeof input?.prefix === 'string'
      ? input.prefix
      : header.toLowerCase() === 'authorization'
        ? 'Bearer '
        : '';
  if (header.toLowerCase() === 'authorization' && !/^[A-Za-z]+\s+$/.test(prefix)) {
    errors.push('prefix for Authorization must be a scheme followed by a space, such as "Bearer "');
  }
  if (/[\r\n]/.test(prefix)) errors.push('prefix must not contain newlines');
  if (prefix.length > 80) errors.push('prefix must be 80 characters or fewer');

  const kind: WrapSecretKind = input?.kind === 'oauth2' ? 'oauth2' : 'static';
  let oauth2: WrapOAuthMetadata | undefined;
  if (kind === 'oauth2') {
    const tokenUrl = typeof input?.tokenUrl === 'string' ? input.tokenUrl.trim() : '';
    const clientId = typeof input?.clientId === 'string' ? input.clientId.trim() : '';
    const scope = typeof input?.scope === 'string' ? input.scope.trim() : '';
    const audience = typeof input?.audience === 'string' ? input.audience.trim() : '';

    try {
      const parsed = new URL(tokenUrl);
      if (parsed.protocol !== 'https:') errors.push('tokenUrl must use https');
      if (parsed.username || parsed.password) errors.push('tokenUrl must not contain credentials');
    } catch {
      errors.push('tokenUrl must be an absolute https URL');
    }
    if (!clientId) errors.push('clientId is required for an OAuth2 credential');
    if (clientId.length > 500) errors.push('clientId must be 500 characters or fewer');
    if (/[\r\n]/.test(clientId)) errors.push('clientId must not contain newlines');
    if (scope.length > 1_000 || /[\r\n]/.test(scope)) errors.push('scope must be at most 1000 characters and single-line');
    if (audience.length > 500 || /[\r\n]/.test(audience)) errors.push('audience must be at most 500 characters and single-line');

    oauth2 = { tokenUrl, clientId, ...(scope ? { scope } : {}), ...(audience ? { audience } : {}) };
  }

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, value: { name, value, hosts, header, prefix, kind, oauth2, keepExisting } };
}

/** Comma/whitespace-separated hosts, lowercased, trailing dot stripped, de-duplicated. */
function normalizeHosts(input: string[] | string | undefined): string[] {
  const raw = Array.isArray(input) ? input : typeof input === 'string' ? input.split(/[,\s]+/) : [];
  const hosts = raw
    .map((host) => String(host || '').trim().toLowerCase().replace(/\.$/, ''))
    .filter(Boolean);
  return [...new Set(hosts)];
}

/** When to use: checking that a request host is bound to this credential (exact or `*.` wildcard). */
export function hostAllowed(allowedHosts: string[], host: string): boolean {
  const target = String(host || '').toLowerCase().replace(/\.$/, '');
  if (!target) return false;
  return allowedHosts.some((pattern) => {
    if (pattern === target) return true;
    if (pattern.startsWith('*.')) {
      const suffix = pattern.slice(1);
      return target.endsWith(suffix) && target.length > suffix.length;
    }
    return false;
  });
}
