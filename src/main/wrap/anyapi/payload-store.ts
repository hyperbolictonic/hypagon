/**
 * A payload store that keeps nothing.
 *
 * The core stores every response behind a handle, but the wrapper surface never
 * exposes handles: `executeStored` also returns the payload, and the result is
 * rendered immediately. Retaining the payload would keep every response of the
 * process in memory for a day, so this store hands back the same deterministic
 * handle and drops the body.
 *
 * When to use: constructing the anyapi executor — it is the `store` the core writes
 * to. Handles are never read back here.
 */

import { bytesOf, handleFor } from 'anyapi-to-mcp/store';
import type { PayloadStore, PutOptions, StoredPayload, StoreError } from 'anyapi-to-mcp/store';
import type { Result } from 'anyapi-to-mcp';

/** When to use: as the core's payload store when responses must not be retained. */
export class EphemeralStore implements PayloadStore {
  async put(payload: unknown, options: PutOptions = {}): Promise<StoredPayload> {
    return {
      handle: handleFor(payload),
      payload,
      meta: {
        bytes: bytesOf(payload),
        createdAt: new Date().toISOString(),
        fetches: 1,
        ...(options.operation === undefined ? {} : { operation: options.operation }),
        ...(options.view === undefined || options.view === null ? {} : { view: options.view }),
        ...(options.url === undefined ? {} : { url: options.url }),
        ...(options.host === undefined ? {} : { host: options.host }),
        ...(options.status === undefined ? {} : { status: options.status }),
        ...(options.kind === undefined ? {} : { kind: options.kind }),
      },
    };
  }

  async get(handle: string): Promise<Result<StoredPayload, StoreError>> {
    return { ok: false, error: { code: 'handle_not_found', message: `this run did not retain ${handle}` } };
  }

  async prune(): Promise<number> {
    return 0;
  }
}
