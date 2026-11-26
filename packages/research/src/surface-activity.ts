/**
 * Shared hooks for agent-facing research surfaces.
 *
 * A surface controller reports progress to the research activity feed and
 * writes the MCP directive log; both are the chassis's callbacks, passed in
 * explicitly rather than reaching back into it.
 */

/** The activity feed + directive log every research surface takes. */
export interface SurfaceActivityDeps {
  activity<T>(tool: string, summary: string, describe: (result: T) => string, run: () => Promise<T>): Promise<T>;
  log(level: 'info' | 'warn' | 'action', message: string): void;
}
