/**
 * Research and extraction routes.
 *
 * Everything the agent uses to read the web - surface probing, single-page reads,
 * SERP search, bounded crawls, topic research and citation revalidation - shares
 * the `POST body -> chassis call -> { success, ...result }` shape.
 *
 * The `ROUTES` table is the single source of truth: the handler dispatches from its
 * keys, and the MCP/bridge contract test reads the same keys statically.
 */

import type { BridgeContext } from '../context.js';

type Handler = (ctx: BridgeContext) => Promise<void>;

const ROUTES: Record<string, Handler> = {
  'POST /llm/surface': async (ctx) => {
    const body = await ctx.body();
    const report = await ctx.chassis.probeLlmSurface(body?.url);
    ctx.json({ success: true, ...report });
  },

  'POST /llm/fetch': async (ctx) => {
    const body = await ctx.body();
    const result = await ctx.chassis.fetchLlmSurface({ url: body?.url, as: body?.as });
    ctx.json({ success: true, ...result });
  },

  'POST /read/url': async (ctx) => {
    const body = await ctx.body();
    const result = await ctx.chassis.readUrl({
      url: body?.url,
      maxChars: body?.max_chars ?? body?.maxChars,
      cursor: body?.cursor,
      as: body?.as,
    });
    ctx.json({ success: true, ...result });
  },

  'POST /search/web': async (ctx) => {
    const body = await ctx.body();
    const outcome = await ctx.chassis.searchWeb(body?.query, {
      engine: body?.engine,
      engines: Array.isArray(body?.engines) ? body.engines : undefined,
      urlTemplate: body?.url_template ?? body?.urlTemplate,
      max: body?.max_results ?? body?.max,
    });
    ctx.json({ success: true, ...outcome });
  },

  'POST /crawl/deep': async (ctx) => {
    const body = await ctx.body();
    const outcome = await ctx.chassis.deepCrawl({
      startUrl: body?.url || body?.start_url || body?.startUrl,
      maxDepth: body?.max_depth ?? body?.maxDepth,
      maxPages: body?.max_pages ?? body?.maxPages,
      matchPatterns: body?.match_patterns ?? body?.matchPatterns,
      sameOrigin: body?.same_origin ?? body?.sameOrigin,
      preferLlm: body?.prefer_llm ?? body?.preferLlm,
      harvestToCortex: body?.harvest_to_cortex ?? body?.harvestToCortex,
      selector: body?.selector,
      delayMs: body?.delay_ms ?? body?.delayMs,
      concurrency: body?.concurrency,
      anchorsFor: body?.anchors_for ?? body?.anchorsFor,
    });
    ctx.json({ success: true, ...outcome });
  },

  'POST /research/topic': async (ctx) => {
    const body = await ctx.body();
    const outcome = await ctx.chassis.researchTopic({
      query: body?.query,
      maxSources: body?.max_sources ?? body?.maxSources,
      engine: body?.engine,
      engines: Array.isArray(body?.engines) ? body.engines : undefined,
      urlTemplate: body?.url_template ?? body?.urlTemplate,
      excerptChars: body?.excerpt_chars ?? body?.excerptChars,
      harvestToCortex: body?.harvest_to_cortex ?? body?.harvestToCortex,
      preferLlm: body?.prefer_llm ?? body?.preferLlm,
    });
    ctx.json({ success: true, ...outcome });
  },

  'POST /citation/relocate': async (ctx) => {
    const body = await ctx.body();
    const result = await ctx.chassis.citations.relocateCitation({
      url: body?.url,
      fingerprint: body?.fingerprint,
      threshold: body?.threshold,
    });
    ctx.json({ success: true, ...result });
  },

  'POST /citation/revalidate': async (ctx) => {
    const body = await ctx.body();
    const result = await ctx.chassis.citations.revalidateStored({
      url: body?.url,
      maxUrls: body?.max_urls ?? body?.maxUrls,
    });
    ctx.json({ success: true, ...result });
  },
};

/** When to use: the request is a research/extraction call; returns false for other paths. */
export async function handleResearchRoutes(ctx: BridgeContext): Promise<boolean> {
  if (ctx.method !== 'POST') return false;
  const handler = ROUTES[`${ctx.method} ${ctx.pathname}`];
  if (!handler) return false;
  await handler(ctx);
  return true;
}
