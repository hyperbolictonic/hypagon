/**
 * Primitives — the orthogonal observe / act / wait layer.
 *
 * These sit *above* the raw chassis verbs and below the MCP tool catalogue:
 *
 *   observe()  one snapshot model, projected as markdown | text | ax | som | list | table | app_data
 *   act()      one intent model (click/type/hover/press) that returns a delta and can await
 *   wait_for() one readiness model (selector/text/url/role/count/network_idle/stable/revision)
 *   extract()  structured reads (list / table / embedded app data)
 *   collect()  scroll-and-dedupe a virtualized list into rows
 *   find()     semantic lookup -> mark refs
 *   expect()   immediate assertion with evidence
 *   state()/diff()  cheap change detection
 *
 * Everything runs on the humanlike path (real pointer/keyboard events + the existing
 * Set-of-Marks data-mark-id stamps); no page DOM is mutated beyond that stamp.
 *
 * The class is composed from parts (base -> page-state -> components -> extract -> observe-text -> observe -> find -> wait -> typing -> act -> traffic) so each family
 * stays readable; the host interface is implemented by BrowserChassis, which keeps this layer
 * free of Electron/tab plumbing.
 */
import { PrimitivesTraffic } from './part-traffic.js';

/** When to use: driving observe/find/act/wait/extract/collect — the agent-facing primitive layer. */
export class Primitives extends PrimitivesTraffic {}

export { PrimitiveError } from './error.js';
export { DEFAULT_MARKDOWN_BUDGET } from './types.js';
export type {
  PrimitivesHost,
  PrimitiveErrorCode,
  WaitCondition,
  ConditionResult,
  WaitResult,
  PageState,
  ObserveOptions,
  ExtractOptions,
  CollectOptions,
  FindOptions,
  ActOptions,
  PageReadGuardInput,
  PageReadPrecheckInput,
} from './types.js';
