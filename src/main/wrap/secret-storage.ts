/**
 * Reading, writing and describing `secrets.json`.
 *
 * The file is main-process only: written atomically with 0600 permissions, read
 * fail-closed (a damaged file reads as empty rather than throwing), and never listed
 * with its ciphertext.
 *
 * When to use: the secret store's own persistence and listing. Cipher work and policy
 * stay in `wrap/secrets.ts`.
 */
import fs from 'node:fs';
import path from 'node:path';
import type { SecretFile, SecretRecord, WrapSecretMetadata } from './secret-types.js';

/** When to use: turning a stored record into the metadata shape Settings may display. */
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

/** When to use: validating one parsed entry before trusting it as a secret record. */
export function isRecord(value: unknown): value is SecretRecord {
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

/** When to use: loading the store — a missing or damaged file reads as empty. */
export function readSecretsFile(filePath: string): SecretFile {
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    if (!parsed || parsed.schemaVersion !== 1 || !Array.isArray(parsed.secrets)) return { schemaVersion: 1, secrets: [] };
    return {
      schemaVersion: 1,
      secrets: parsed.secrets.filter(isRecord).map((secret: SecretRecord) => ({ ...secret, kind: secret.kind ?? 'static' })),
    };
  } catch {
    return { schemaVersion: 1, secrets: [] };
  }
}

/** When to use: saving the store — atomic replace, then 0600 where the OS supports it. */
export function writeSecretsFile(dir: string, filePath: string, file: SecretFile): void {
  fs.mkdirSync(dir, { recursive: true });
  const temp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(temp, `${JSON.stringify(file, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
  fs.renameSync(temp, filePath);
  try {
    fs.chmodSync(filePath, 0o600);
  } catch {
    // Windows uses ACLs.
  }
}

/** When to use: building the on-disk path for a store's directory. */
export function secretsFilePath(dir: string): string {
  return path.join(dir, 'secrets.json');
}
