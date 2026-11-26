/**
 * The page-read funnel contract.
 *
 * The shapes live with the SDK primitives host now; this module re-exports them so the
 * existing app callers keep one import path.
 */
export type {
  GuardPageReadInput,
  GuardPageReadResult,
  PageReadRefusal,
  PageReadRequest,
  PrecheckPageReadResult,
} from '../../../packages/browser/src/primitives/contracts.ts';
