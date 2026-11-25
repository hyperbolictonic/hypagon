/**
 * The bridge capabilities advertised by `bridge_health`.
 *
 * Kept as declarative data: the list describes what the bridge exposes, so it
 * lives beside the routes rather than inside the chassis.
 */
export const BRIDGE_CAPABILITIES: readonly string[] = [
  'observe:v2',
  'wait_for',
  'extract:list,table,app_data',
  'collect_all',
  'find',
  'expect',
  'act',
  'page_state',
  'diff',
  'network_since',
  'export_har',
  'contexts',
  'marks_offscreen',
  'llm_surface',
  'llm_fetch',
  'read_url',
  'search_web',
  'deep_crawl',
  'research_topic',
  'zoom',
];
