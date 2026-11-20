/**
 * Phase one: arguments in, a ready request or a refusal.
 *
 * Validation and request building are deterministic; the only async step is resolving the
 * wrapper's credential, which yields a header (never a value) and the secret variants the
 * renderer uses to redact echoes.
 */
import { validateArgs } from './input-schema.ts';
import { buildRequest, BuildRequestError } from './interpolate.ts';
import { failure, secretVariants } from './render.ts';
import type { ExecuteDeps } from './execute-deps.ts';
import type { WrapRunResult, WrapWrapper } from './types.ts';

/** When to use: the first phase's output — everything the fetch phase needs. */
export interface Prepared {
  built: ReturnType<typeof buildRequest>;
  secretHeader?: string;
  secretValues: string[];
  secretRefreshable: boolean;
}

/** When to use: `executeWrapper` before any request is sent. */
export async function prepare(
  wrapper: WrapWrapper,
  argsInput: unknown,
  secrets: ExecuteDeps['secrets'],
): Promise<{ ok: true; prepared: Prepared } | { ok: false; result: WrapRunResult }> {
  const validated = validateArgs(wrapper.inputSchema, argsInput);
  if (!validated.ok) {
    return {
      ok: false,
      result: failure(
        { id: wrapper.id, name: wrapper.name },
        'INVALID_ARGS',
        validated.errors.join('; '),
        undefined,
        validated.field,
      ),
    };
  }

  let built: ReturnType<typeof buildRequest>;
  try {
    built = buildRequest(wrapper, validated.value);
  } catch (err: any) {
    const code = err instanceof BuildRequestError ? err.code : 'INVALID_REQUEST';
    return { ok: false, result: failure({ id: wrapper.id, name: wrapper.name }, code, err?.message || String(err)) };
  }

  let secretHeader: string | undefined;
  let secretValues: string[] = [];
  let secretRefreshable = false;
  if (wrapper.request.auth) {
    if (!secrets) {
      return {
        ok: false,
        result: failure(
          { id: wrapper.id, name: wrapper.name },
          'SECRETS_UNAVAILABLE',
          'This build has no secret store; remove request.auth or use a credential-free endpoint.',
        ),
      };
    }

    const host = new URL(built.url).hostname;
    const resolved = await secrets.resolve(wrapper.request.auth, host);
    if (!resolved.ok || !resolved.header || resolved.value === undefined) {
      return {
        ok: false,
        result: failure(
          { id: wrapper.id, name: wrapper.name },
          resolved.code || 'SECRET_ERROR',
          resolved.message || `Could not resolve secret "${wrapper.request.auth}".`,
        ),
      };
    }

    built.headers[resolved.header] = resolved.value;
    secretHeader = resolved.header;
    secretValues = secretVariants(resolved.value);
    secretRefreshable = Boolean(resolved.refreshable);
  }

  return { ok: true, prepared: { built, secretHeader, secretValues, secretRefreshable } };
}
