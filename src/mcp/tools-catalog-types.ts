import { z } from 'zod';

/** When to use: any surface that registers or inspects a catalog entry — the one item shape for the whole catalog. */
export interface ToolCatalogItem {
  name: string;
  description: string;
  parameters: Record<string, z.ZodTypeAny>;
  endpoint: string;
  method?: 'GET' | 'POST';
  payload?: (args: any) => any;
  format?: (data: any, args: any) => string;
  /** Resolves the endpoint per call (one tool fronting two routes). Defaults to `endpoint`. */
  endpointFor?: (args: any) => string;
  /** Every route this tool may call; validated by the contract test. Defaults to `[endpoint]`. */
  endpoints?: string[];
  /**
   * Hidden from `tools/list` (and therefore from agent tool pickers) but still
   * callable by name via `tools/call` for one release. Used for deprecated
   * aliases and renamed tools; see docs/TOOL_CATALOG_REVIEW.md.
   */
  hidden?: boolean;
  /** Canonical tool this deprecated name forwards to (drives the call-time notice). */
  deprecatedInFavorOf?: string;
}
