/**
 * The bridge's read and capture routes.
 *
 * Why one module: these endpoints turn the live page into data the agent can
 * reason over — markdown, screenshots, evaluate, DOM facts, frames, console
 * logs, downloads, structured JSON, rendered snapshots and the realtime stream
 * buffers. They share the same "read the page, then answer with the construct"
 * shape; the JEV read guard is the one rule they all pass through, so it lives
 * beside them rather than in the main handler.
 */
import type { ChassisRouteContext } from './route-table.js';
import { dispatchRoute } from './route-table.js';

type ReadHandler = (ctx: ChassisRouteContext) => Promise<void> | void;

/** `/console-logs` and its `/console/logs` alias read the same buffer. */
const consoleLogs = ({ chassis, sendJson }: ChassisRouteContext) => {
  const logs = chassis.getTargetConsoleLogs(50);
  sendJson({ success: true, logs });
};

const ROUTES: Record<string, ReadHandler> = {
  'GET /markdown': async ({ chassis, url, sendJson }) => {
    const includeMarks = url.searchParams.get('include_marks') !== 'false' && url.searchParams.get('marks') !== 'false';
    const includeOffscreen = ['1', 'true'].includes((url.searchParams.get('include_offscreen') || '').toLowerCase());
    const full = ['1', 'true'].includes((url.searchParams.get('full') || '').toLowerCase());
    // The hidden alias dumps the whole construct, so it passes through the same
    // hard funnel as observe(as:"markdown") with no budget or region.
    const pre = await chassis.precheckJevPageRead({ as: 'markdown', full });
    if (pre.blocked) {
      sendJson(
        {
          success: false,
          error: 'Unscoped page reads are disabled while JEV enforce is on. Call jev_index, then read_section.',
          code: 'JEV_REQUIRED',
          ...(pre.refusal || {}),
        },
        409,
      );
      return;
    }
    const construct = await chassis.harvestMarkdown({ includeMarks, includeOffscreen });
    const guard: { allowed: boolean; note?: string; refusal?: Record<string, any> } = pre.note
      ? { allowed: true, note: pre.note }
      : chassis.guardJevPageRead({
          as: 'markdown',
          full,
          pageTokens: construct.estimatedTokens || Math.ceil(String(construct.content || '').length / 4),
          url: construct.url,
          title: construct.title,
          content: construct.content,
        });
    if (!guard.allowed) {
      sendJson(
        {
          success: false,
          error: 'Unscoped page reads are disabled while JEV enforce is on. Call jev_index, then read_section.',
          code: 'JEV_REQUIRED',
          ...(guard.refusal || {}),
        },
        409,
      );
      return;
    }
    if (guard.note) {
      sendJson({ success: true, construct: { ...construct, content: `${construct.content}\n\n[JEV] ${guard.note}` }, jevNote: guard.note });
      return;
    }
    sendJson({ success: true, construct });
  },

  'GET /screenshot': async ({ chassis, url, sendJson }) => {
    const maxWidthParam = url.searchParams.get('max_width');
    const maxWidth = maxWidthParam !== null ? Number(maxWidthParam) : 768;
    const format = (url.searchParams.get('format') || 'jpeg').toLowerCase() as 'jpeg' | 'png';
    const qualityParam = url.searchParams.get('quality');
    const quality = qualityParam !== null ? Number(qualityParam) : 70;

    const screenshot = await chassis.takeScreenshot({ maxWidth, format, quality });
    sendJson({ success: true, screenshot });
  },

  'POST /screenshots/cleanup': async ({ chassis, readBody, sendJson }) => {
    const body = await readBody();
    const maxFiles = body.maxFiles !== undefined ? Number(body.maxFiles) : 50;
    const maxAgeMs = body.maxAgeDays !== undefined ? Number(body.maxAgeDays) * 86400000 : 7 * 86400000;
    const cleanupResult = chassis.cleanupScreenshots(maxFiles, maxAgeMs);
    sendJson({ success: true, ...cleanupResult });
  },

  'POST /evaluate': async ({ chassis, readBody, sendJson }) => {
    const body = await readBody();
    const script = body.script || body.code || body.js || body.expression || body.javascript || '';
    // Frame mode is opt-in: every frame costs two CDP commands, so the default stays the
    // single main-frame evaluate.
    if (body.frames === true || body.include_frames === true) {
      const frames = await chassis.evaluateInFrames(script, {
        maxFrames: body.max_frames !== undefined ? Number(body.max_frames) : undefined,
        timeoutMs: body.timeout_ms !== undefined ? Number(body.timeout_ms) : undefined,
        includeBlank: body.include_blank === true,
      });
      sendJson({ success: true, frames });
      return;
    }
    const result = await chassis.evaluateJavaScript(script);
    sendJson({ success: true, result });
  },

  // Shared control facts (marks / find / guard / recipes). Read-only, one injected expression.
  'POST /dom/facts': async ({ chassis, readBody, sendJson }) => {
    const body = await readBody();
    const facts = await chassis.describeControls({
      selector: body?.selector,
      limit: body?.limit !== undefined ? Number(body.limit) : undefined,
      includeOffscreen: body?.include_offscreen !== false,
      skipHitTest: body?.skip_hit_test === true,
      deep: body?.deep === true,
    });
    sendJson({ success: true, ...facts });
  },

  // Iframes as first-class content: geometry, controls (offset to the top-level viewport)
  // and optional per-frame screenshots. Opt-in because it costs CDP commands per frame.
  'GET /frames': async ({ chassis, sendJson }) => {
    const frames = await chassis.listFrames();
    sendJson({ success: true, frames });
  },

  'POST /frames': async ({ chassis, readBody, sendJson }) => {
    const body = await readBody();
    const result = await chassis.getFrames({
      includeControls: body?.include_controls !== false,
      screenshots: body?.screenshots === true,
      maxFrames: body?.max_frames !== undefined ? Number(body.max_frames) : undefined,
      maxControls: body?.max_controls !== undefined ? Number(body.max_controls) : undefined,
      selector: body?.selector,
      includeOffscreen: body?.include_offscreen === true,
      skipHitTest: body?.skip_hit_test === true,
      maxSide: body?.max_side !== undefined ? Number(body.max_side) : undefined,
    });
    sendJson({ success: true, ...result });
  },

  'GET /console-logs': consoleLogs,

  'GET /console/logs': consoleLogs,

  'GET /fingerprint': ({ chassis, sendJson }) => {
    const profile = chassis.getFingerprintProfile();
    sendJson({ success: true, profile });
  },

  'GET /downloads': ({ chassis, sendJson }) => {
    const downloads = chassis.getDownloads();
    sendJson({ success: true, downloads });
  },

  'POST /downloads/read': async ({ chassis, readBody, sendJson }) => {
    const body = await readBody();
    const document = await chassis.readDownloadedDocument(body.filename || body.id);
    sendJson({ success: true, document });
  },

  'POST /json/query': async ({ chassis, readBody, sendJson }) => {
    const body = await readBody();
    const source = body.source || body.from || 'network_payload';
    const sourceId =
      body.sourceId || body.source_id || body.requestId || body.request_id || body.streamId || body.stream_id || body.filename || body.file;
    const result = chassis.queryJsonData({
      source,
      sourceId,
      jsonString: body.jsonString || body.json_string || body.json,
      path: body.path || body.query,
      view: body.view || body.mode,
      limit: body.limit !== undefined ? Number(body.limit) : undefined,
      maxStringLength: body.maxStringLength || body.max_string_length,
      filterPredicate: body.filterPredicate || body.filter_predicate || body.filter,
    });
    sendJson({ success: true, ...result });
  },

  'POST /snapshot/rendered': async ({ chassis, readBody, sendJson }) => {
    const body = await readBody();
    const result = await chassis.snapshotRenderedPage({
      format: body.format || body.mode,
      waitUntilIdleMs: body.waitUntilIdleMs ?? body.wait_until_idle_ms,
      pierceShadowDom: body.pierceShadowDom ?? body.pierce_shadow_dom,
      saveToDisk: body.saveToDisk ?? body.save_to_disk,
      forceRerender: body.forceRerender ?? body.force_rerender,
    });
    sendJson({ success: true, ...result });
  },

  'POST /prerender/links': async ({ chassis, readBody, sendJson }) => {
    const body = await readBody();
    const result = await chassis.prerenderLinks({
      urls: body.urls,
      selector: body.selector,
      maxPages: body.maxPages ?? body.max_pages,
      harvestToCortex: body.harvestToCortex ?? body.harvest_to_cortex,
      waitUntilIdleMs: body.waitUntilIdleMs ?? body.wait_until_idle_ms,
    });
    sendJson({ success: true, ...result });
  },

  'GET /streams/list': ({ chassis, sendJson }) => {
    const streams = chassis.getRealtimeStreams({});
    sendJson({ success: true, streams });
  },

  'POST /streams/list': async ({ chassis, readBody, sendJson }) => {
    const body = await readBody();
    const streams = chassis.getRealtimeStreams(body);
    sendJson({ success: true, streams });
  },

  'POST /streams/messages': async ({ chassis, readBody, sendJson }) => {
    const body = await readBody();
    const messages = chassis.getStreamMessages(body);
    sendJson({ success: true, messages });
  },

  'POST /streams/clear': async ({ chassis, readBody, sendJson }) => {
    const body = await readBody();
    chassis.clearStreamMessages(body.streamId);
    sendJson({ success: true, message: 'Stream message buffer cleared' });
  },

  'POST /capture/clear': async ({ chassis, readBody, sendJson }) => {
    const body = await readBody();
    const scope = body?.scope || 'all';
    const cleared: string[] = [];
    if (scope === 'all' || scope === 'network') {
      chassis.clearNetworkTraffic();
      cleared.push('network');
    }
    if (scope === 'all' || scope === 'streams') {
      chassis.clearStreamMessages();
      cleared.push('streams');
    }
    sendJson({
      success: true,
      cleared,
      message: cleared.length > 0 ? `Cleared capture buffer(s): ${cleared.join(', ')}` : 'Unknown scope; nothing cleared',
    });
  },
};

/**
 * When to use: the bridge request handler — dispatch page reads and capture.
 * Returns false when the method+path pair is not a read route.
 */
export async function handleReadRoutes(ctx: ChassisRouteContext): Promise<boolean> {
  return dispatchRoute(ROUTES, ctx, (handler) => handler(ctx));
}
