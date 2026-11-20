/**
 * Inspection routes: page reads, JEV compaction, screenshots, script evaluation,
 * frames, console logs, fingerprints, downloads and rendered snapshots.
 *
 * These are read-mostly surfaces. The markdown route is the one place that still
 * passes the JEV hard funnel, because a full-page dump is a read.
 *
 * The `ROUTES` table is the single source of truth: the handler dispatches from its
 * keys, and the MCP/bridge contract test reads the same keys statically.
 */

import type { BridgeContext } from '../context.js';

type Handler = (ctx: BridgeContext) => Promise<void>;

const listConsoleLogs: Handler = async (ctx) => {
  ctx.json({ success: true, logs: ctx.chassis.getTargetConsoleLogs(50) });
};

const ROUTES: Record<string, Handler> = {
  'GET /markdown': async (ctx) => {
    const params = ctx.url.searchParams;
    const includeMarks = params.get('include_marks') !== 'false' && params.get('marks') !== 'false';
    const includeOffscreen = ['1', 'true'].includes((params.get('include_offscreen') || '').toLowerCase());
    const full = ['1', 'true'].includes((params.get('full') || '').toLowerCase());
    // The hidden alias dumps the whole construct, so it passes through the same
    // hard funnel as observe(as:"markdown") with no budget or region.
    const pre = await ctx.chassis.jevSurface.precheckJevPageRead({ as: 'markdown', full });
    if (pre.blocked) {
      ctx.json({ success: false, error: 'Unscoped page reads are disabled while JEV enforce is on. Call jev_index, then read_section.', code: 'JEV_REQUIRED', ...(pre.refusal || {}) }, 409);
      return;
    }
    const construct = await ctx.chassis.harvestMarkdown({ includeMarks, includeOffscreen });
    const guard: { allowed: boolean; note?: string; refusal?: Record<string, any> } = pre.note
      ? { allowed: true, note: pre.note }
      : ctx.chassis.jevSurface.guardJevPageRead({
          as: 'markdown',
          full,
          pageTokens: construct.estimatedTokens || Math.ceil(String(construct.content || '').length / 4),
          url: construct.url,
          title: construct.title,
          content: construct.content,
        });
    if (!guard.allowed) {
      ctx.json({ success: false, error: 'Unscoped page reads are disabled while JEV enforce is on. Call jev_index, then read_section.', code: 'JEV_REQUIRED', ...(guard.refusal || {}) }, 409);
      return;
    }
    if (guard.note) {
      ctx.json({ success: true, construct: { ...construct, content: `${construct.content}\n\n[JEV] ${guard.note}` }, jevNote: guard.note });
      return;
    }
    ctx.json({ success: true, construct });
  },

  'GET /jev/stats': async (ctx) => {
    ctx.json({ success: true, ...ctx.chassis.jevSurface.getJevStats(), status: ctx.chassis.jevSurface.getJevStatus() });
  },

  // JEV (Just-Enough-View) page compaction. Requires a decision model and the
  // optional JEV toggle; otherwise each route returns a clear error.
  'GET /jev/index': async (ctx) => {
    ctx.json(await ctx.chassis.jevSurface.jevIndex());
  },

  'POST /jev/read': async (ctx) => {
    const body = await ctx.body();
    const sectionId = String(body.section_id ?? body.sectionId ?? '');
    const includeChildren = body.include_children === true || body.includeChildren === true;
    ctx.json(ctx.chassis.jevSurface.jevReadSection(sectionId, includeChildren));
  },

  'POST /jev/search': async (ctx) => {
    const body = await ctx.body();
    ctx.json(ctx.chassis.jevSurface.jevSearch(String(body.query ?? '')));
  },

  'GET /screenshot': async (ctx) => {
    const maxWidthParam = ctx.url.searchParams.get('max_width');
    const qualityParam = ctx.url.searchParams.get('quality');
    const screenshot = await ctx.chassis.screenshots.takeScreenshot({
      maxWidth: maxWidthParam !== null ? Number(maxWidthParam) : 768,
      format: (ctx.url.searchParams.get('format') || 'jpeg').toLowerCase() as 'jpeg' | 'png',
      quality: qualityParam !== null ? Number(qualityParam) : 70,
    });
    ctx.json({ success: true, screenshot });
  },

  'POST /screenshots/cleanup': async (ctx) => {
    const body = await ctx.body();
    const maxFiles = body.maxFiles !== undefined ? Number(body.maxFiles) : 50;
    const maxAgeMs = body.maxAgeDays !== undefined ? Number(body.maxAgeDays) * 86400000 : 7 * 86400000;
    ctx.json({ success: true, ...ctx.chassis.screenshots.cleanupScreenshots(maxFiles, maxAgeMs) });
  },

  'POST /evaluate': async (ctx) => {
    const body = await ctx.body();
    const script = body.script || body.code || body.js || body.expression || body.javascript || '';
    // Frame mode is opt-in: every frame costs two CDP commands, so the default stays the
    // single main-frame evaluate.
    if (body.frames === true || body.include_frames === true) {
      const frames = await ctx.chassis.evaluateInFrames(script, {
        maxFrames: body.max_frames !== undefined ? Number(body.max_frames) : undefined,
        timeoutMs: body.timeout_ms !== undefined ? Number(body.timeout_ms) : undefined,
        includeBlank: body.include_blank === true,
      });
      ctx.json({ success: true, frames });
      return;
    }
    ctx.json({ success: true, result: await ctx.chassis.evaluateJavaScript(script) });
  },

  // Shared control facts (marks / find / guard / recipes). Read-only, one injected expression.
  'POST /dom/facts': async (ctx) => {
    const body = await ctx.body();
    const facts = await ctx.chassis.describeControls({
      selector: body?.selector,
      limit: body?.limit !== undefined ? Number(body.limit) : undefined,
      includeOffscreen: body?.include_offscreen !== false,
      skipHitTest: body?.skip_hit_test === true,
      deep: body?.deep === true,
    });
    ctx.json({ success: true, ...facts });
  },

  // Iframes as first-class content: geometry, controls (offset to the top-level viewport)
  // and optional per-frame screenshots. Opt-in because it costs CDP commands per frame.
  'GET /frames': async (ctx) => {
    ctx.json({ success: true, frames: await ctx.chassis.listFrames() });
  },

  'POST /frames': async (ctx) => {
    const body = await ctx.body();
    const result = await ctx.chassis.getFrames({
      includeControls: body?.include_controls !== false,
      screenshots: body?.screenshots === true,
      maxFrames: body?.max_frames !== undefined ? Number(body.max_frames) : undefined,
      maxControls: body?.max_controls !== undefined ? Number(body.max_controls) : undefined,
      selector: body?.selector,
      includeOffscreen: body?.include_offscreen === true,
      skipHitTest: body?.skip_hit_test === true,
      maxSide: body?.max_side !== undefined ? Number(body.max_side) : undefined,
    });
    ctx.json({ success: true, ...result });
  },

  'GET /console-logs': listConsoleLogs,
  'GET /console/logs': listConsoleLogs,

  'GET /fingerprint': async (ctx) => {
    ctx.json({ success: true, profile: ctx.chassis.getFingerprintProfile() });
  },

  'GET /downloads': async (ctx) => {
    ctx.json({ success: true, downloads: ctx.chassis.getDownloads() });
  },

  'POST /downloads/read': async (ctx) => {
    const body = await ctx.body();
    ctx.json({ success: true, document: await ctx.chassis.readDownloadedDocument(body.filename || body.id) });
  },

  'POST /json/query': async (ctx) => {
    const body = await ctx.body();
    const result = ctx.chassis.queryJsonData({
      source: body.source || body.from || 'network_payload',
      sourceId: body.sourceId || body.source_id || body.requestId || body.request_id || body.streamId || body.stream_id || body.filename || body.file,
      jsonString: body.jsonString || body.json_string || body.json,
      path: body.path || body.query,
      view: body.view || body.mode,
      limit: body.limit !== undefined ? Number(body.limit) : undefined,
      maxStringLength: body.maxStringLength || body.max_string_length,
      filterPredicate: body.filterPredicate || body.filter_predicate || body.filter,
    });
    ctx.json({ success: true, ...result });
  },

  'POST /snapshot/rendered': async (ctx) => {
    const body = await ctx.body();
    const result = await ctx.chassis.snapshotRenderedPage({
      format: body.format || body.mode,
      waitUntilIdleMs: body.waitUntilIdleMs ?? body.wait_until_idle_ms,
      pierceShadowDom: body.pierceShadowDom ?? body.pierce_shadow_dom,
      saveToDisk: body.saveToDisk ?? body.save_to_disk,
      forceRerender: body.forceRerender ?? body.force_rerender,
    });
    ctx.json({ success: true, ...result });
  },

  'POST /prerender/links': async (ctx) => {
    const body = await ctx.body();
    const result = await ctx.chassis.prerenderLinks({
      urls: body.urls,
      selector: body.selector,
      maxPages: body.maxPages ?? body.max_pages,
      harvestToCortex: body.harvestToCortex ?? body.harvest_to_cortex,
      waitUntilIdleMs: body.waitUntilIdleMs ?? body.wait_until_idle_ms,
    });
    ctx.json({ success: true, ...result });
  },
};

/** When to use: the request reads the page, frames, screenshots or downloaded documents. */
export async function handleInspectionRoutes(ctx: BridgeContext): Promise<boolean> {
  const handler = ROUTES[`${ctx.method} ${ctx.pathname}`];
  if (!handler) return false;
  await handler(ctx);
  return true;
}
