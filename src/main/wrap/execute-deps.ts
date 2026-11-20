/**
 * What the run phases need from the executor.
 *
 * The executor resolves its options once and passes this object to prepare, fetch and compose,
 * so those phases never import the executor class (and no cycle forms).
 */
import type { ResponsePolicy } from './response.ts';
import type { WrapStore } from './store.ts';
import type { SecretStore } from './secrets.ts';
import type { WrapAuditLog } from './audit.ts';
import type { Rendered, WrapIndexContext, WrapIndexDocument } from './execution-types.ts';
import type { WrapWrapper } from './types.ts';

/** When to use: `WrapExecutor.execute` — the executor's own options, passed to the phases. */
export interface ExecuteDeps {
  readonly store: Pick<WrapStore, 'touchVerified'>;
  readonly secrets?: Pick<SecretStore, 'resolve'>;
  readonly audit?: Pick<WrapAuditLog, 'append'>;
  readonly indexDocuments?: (documents: WrapIndexDocument[], context: WrapIndexContext) => Promise<number>;
  readonly policy: ResponsePolicy;
  readonly maxPages: number;
  readonly defaultMaxItems: number;
  readonly maxResultChars: number;
  readonly render: (wrapper: WrapWrapper, json: unknown, text: string, contentType: string, maxItems?: number) => Rendered;
}
