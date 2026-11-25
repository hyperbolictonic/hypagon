/**
 * Pre-harvesting a warm view into Cortex.
 *
 * Why a module: the snapshot capture, the 50-character floor and the Cortex
 * indexing are one background job with its own failure policy (log, never
 * throw). The engine should not carry it.
 */
import type { CortexDB } from '../cortex/cortex-db.js';
import { RenderedSnapshotEngine } from '../snapshots/rendered-snapshot.js';
import type { PrerenderItem } from './types.js';

/** When to use: after a view is pooled — index it so the read is already warm. */
export async function harvestPrerenderedItem(
  item: PrerenderItem,
  cortex: CortexDB,
  log?: (level: 'info' | 'warn' | 'action', message: string) => void,
): Promise<void> {
  try {
    const snapshot = await RenderedSnapshotEngine.capture(item.view.webContents, {
      format: 'markdown',
      waitUntilIdleMs: 100,
    });
    if (!snapshot.content || snapshot.content.length <= 50) return;
    await cortex.history.indexPage(item.url, item.title || snapshot.title, snapshot.content);
    item.harvested = true;
    log?.('info', `Pre-harvested "${item.title || item.url}" directly into LanceDB Cortex memory`);
  } catch {
    // Non-critical background task
  }
}
