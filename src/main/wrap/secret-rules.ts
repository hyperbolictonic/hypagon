/**
 * What a Wrap credential may look like: the name/host/header/prefix rules, the OAuth2
 * metadata rules, and the record shape the document reader accepts.
 *
 * Why a module: these rules were ~70 lines inside `SecretStore.set`, and the store's
 * job is to encrypt and persist — not to argue with the human about header names.
 */
import type { SecretRecord, WrapOAuthMetadata, WrapSecretInput, WrapSecretMetadata } from './secret-types.ts';

const NAME_PATTERN = /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/;
const HEADER_PATTERN = /^[A-Za-z0-9!#$%&'*+.^_`|~-]+$/;
const FORBIDDEN_HEADERS = new Set(['host', 'content-length', 'connection', 'transfer-encoding', 'upgrade', 'cookie', 'set-cookie']);
const HOST_PATTERN = /^(\*\.)?[a-z0-9]([a-z0-9.-]*[a-z0-9])?$/;

/** The validated core of an input, before it is encrypted. */
export interface SecretPlan {
  name: string;
  hosts: string[];
  header: string;
  prefix: string;
  /** Keep the stored ciphertext (an empty value means "leave the secret alone"). */
  keepExisting: boolean;
  errors: string[];
}

/** The OAuth2 metadata an input asks for, or an empty object for a static credential. */
export interface OAuthPlan {
  oauth2?: WrapOAuthMetadata;
  errors: string[];
}

/** Split `allowedHosts` (an array or a comma/space separated string) into unique hosts. */
export function normalizeHosts(input: string[] | string | undefined): string[] {
  const raw = Array.isArray(input) ? input : typeof input === 'string' ? input.split(/[,\s]+/) : [];
  const hosts = raw.map((host) => String(host || '').trim().toLowerCase().replace(/\.$/, '')).filter(Boolean);
  return [...new Set(hosts)];
}

/** True when `host` matches one of the allowed patterns (a `*.` prefix covers subdomains). */
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

/** True when a parsed document entry has the fields every credential needs. */
export function isSecretRecord(value: unknown): value is SecretRecord {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.name === 'string' &&
    Array.isArray(record.allowedHosts) &&
    record.allowedHosts.every((host) => typeof host === 'string') &&
    typeof record.header === 'string' &&
    typeof record.prefix === 'string' &&
    typeof record.ciphertext === 'string' &&
    typeof record.createdAt === 'string' &&
    typeof record.updatedAt === 'string' &&
    (record.kind === undefined || record.kind === 'static' || record.kind === 'oauth2') &&
    (record.oauth2 === undefined ||
      (typeof record.oauth2 === 'object' &&
        record.oauth2 !== null &&
        typeof (record.oauth2 as any).tokenUrl === 'string' &&
        typeof (record.oauth2 as any).clientId === 'string'))
  );
}

/** The listable half of a stored record (never the ciphertext). */
export function metadataOf(record: SecretRecord): WrapSecretMetadata {
  return {
    name: record.name,
    allowedHosts: [...record.allowedHosts],
    header: record.header,
    prefix: record.prefix,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    kind: record.kind ?? 'static',
    ...(record.oauth2 ? { oauth2: { ...record.oauth2 } } : {}),
  };
}

/**
 * When to use: `SecretStore.set` — the name, the value presence, the hosts, the header
 * and the prefix. `hasExisting` makes an empty value mean "keep the stored secret".
 */
export function planSecret(input: WrapSecretInput, hasExisting: boolean): SecretPlan {
  const errors: string[] = [];
  const name = typeof input?.name === 'string' ? input.name.trim() : '';
  const value = typeof input?.value === 'string' ? input.value : '';

  if (!NAME_PATTERN.test(name) || name.length > 64) {
    errors.push('name must start with a lowercase letter and use only lowercase letters, numbers, dot, dash, or underscore');
  }

  const keepExisting = hasExisting && value === '';
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
    typeof input?.prefix === 'string' ? input.prefix : header.toLowerCase() === 'authorization' ? 'Bearer ' : '';
  if (header.toLowerCase() === 'authorization' && !/^[A-Za-z]+\s+$/.test(prefix)) {
    errors.push('prefix for Authorization must be a scheme followed by a space, such as "Bearer "');
  }
  if (/[\r\n]/.test(prefix)) errors.push('prefix must not contain newlines');
  if (prefix.length > 80) errors.push('prefix must be 80 characters or fewer');

  return { name, hosts, header, prefix, keepExisting, errors };
}

/** When to use: `SecretStore.set` for kind=oauth2 — the token endpoint and the client id. */
export function planOAuth(input: WrapSecretInput): OAuthPlan {
  if (input?.kind !== 'oauth2') return { errors: [] };

  const errors: string[] = [];
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

  return {
    oauth2: { tokenUrl, clientId, ...(scope ? { scope } : {}), ...(audience ? { audience } : {}) },
    errors,
  };
}
