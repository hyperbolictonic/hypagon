/**
 * Chassis accessors.
 *
 * The small read/act entry points the bridge routes and the surfaces share.
 * They take the host contract instead of living on `BrowserChassis`, so the
 * chassis class keeps only composition and lifecycle methods.
 */
import type { WebContents } from 'electron';
import type { PageInfo } from '../tabs/page-info.js';
import { readPageInfo } from '../tabs/page-info.js';
import { queryJsonData, type JsonQueryParams } from '../utils/json-query.js';
import type { JsonQueryResult } from '../utils/json-navigator.js';
import { captureScreenshotJpeg as captureJpeg } from '../capture/screenshot-jpeg.js';
import type { PrerenderOptions } from '../prerender/prerender-engine.js';
import { dataPath } from '../data-paths.js';
import type { ChassisHost } from './host.js';
import { reassertViewport } from '../window/reassert-viewport.js';

/** Re-assert the shell and tab views after a window/display transition. */
export function reassertChassisViewport(host: ChassisHost): void {
  reassertViewport(host.getMainWindow(), () => host.deck.position(), host.tabSetup.manager);
}

/** Keep the deck overlay and the emulated tab viewport in step. */
export function setViewportVisibility(host: ChassisHost, visible: boolean): void {
  host.tabSetup.manager?.setViewportVisibility(visible);
  host.deck.panel.setOverlayVisible(visible);
}

/** The active tab's web contents, with the network tap attached. */
export function activeWebContents(host: ChassisHost): WebContents {
  const wc = host.tabSetup.requireManager().getActiveTab().view.webContents;
  host.network.manager.attach(wc);
  return wc;
}

/** The live page identity, preferring the document over the cached state. */
export function pageInfo(host: ChassisHost): PageInfo {
  return readPageInfo(host.state, host.tabSetup.manager?.getActiveTab() ?? null);
}

/** When to use: reading the page revision the bridge reports. */
export function currentRevision(host: ChassisHost): number {
  return host.revision;
}

/** When to use: after a navigation or mutating action — bump and return the revision. */
export function bumpRevision(host: ChassisHost): number {
  return ++host.revision;
}

/** The `query_json_data` source resolution over the live network/download store. */
export function queryChassisJson(host: ChassisHost, params: JsonQueryParams): JsonQueryResult {
  host.log(
    'action',
    `MCP Directive: query_json_data(${params.source}${params.sourceId ? `:${params.sourceId}` : ''}, view=${params.view || 'value'})`,
  );
  return queryJsonData(params, {
    payloadJson: (sourceId) => host.network.manager.getPayload(sourceId).data,
    streamPayloads: (sourceId, limit) =>
      host.network.manager
        .getStreamMessages({ streamId: sourceId, limit })
        .map((message) => (message.jsonData !== undefined ? message.jsonData : message.data)),
    downloadsDir: () => dataPath('downloads'),
  });
}

/** Pre-render candidate links from the active page. */
export async function prerenderLinks(
  host: ChassisHost,
  options: PrerenderOptions = {},
): Promise<{ prerendered: string[]; count: number }> {
  const wc = activeWebContents(host);
  host.log('action', `MCP Directive: prerender_links(maxPages=${options.maxPages || 3})`);
  return await host.prerenderEngine.prerender(wc, options);
}

/** A URL rendered to Markdown through the shared detached view (`read_url` fallback). */
export function readUrlRender(
  host: ChassisHost,
  url: string,
): Promise<{ markdown: string; title: string; status: number; contentType: string | null }> {
  return host.researchView.renderMarkdown(url);
}

/** A baseline viewport JPEG for the decision model. */
export function captureScreenshotJpeg(host: ChassisHost, maxSide = 1400, quality = 82) {
  return captureJpeg(
    {
      capturePage: () => host.harvest.capturePageWithRetry(activeWebContents(host), host.tabSetup.bounds()),
      log: host.log,
    },
    maxSide,
    quality,
  );
}
