/**
 * The bridge's research surface.
 *
 * Why one module: these routes answer "what does this page say" at increasing
 * scope — a scoped observe/extract, an LLM-surface probe and fetch, a single
 * URL read, a web search, a deep crawl, a topic sweep, citation relocation and
 * revalidation, and the scroll-to-collect loop. They share the same chassis
 * entry points and the same `{ success, ...result }` answer, and together they
 * are the read half of the primitives contract.
 */
import type { ChassisRouteContext } from './route-table.js';
import { dispatchRoute } from './route-table.js';

type ResearchHandler = (ctx: ChassisRouteContext) => Promise<void> | void;

const ROUTES: Record<string, ResearchHandler> = {
  'POST /observe': async ({ chassis, readBody, sendOk }) => {
    const body = await readBody();
    const obs = await chassis.getPrimitives().observe({
      as: body?.as || body?.format || 'markdown',
      region: body?.region,
      budget: body?.budget !== undefined ? Number(body.budget) : undefined,
      cursor: body?.cursor,
      includeOffscreen: body?.include_offscreen === true || body?.includeOffscreen === true,
      includeFrames: body?.include_frames === true || body?.includeFrames === true,
      limit: body?.limit !== undefined ? Number(body.limit) : undefined,
      full: body?.full === true,
    });
    sendOk(obs);
  },

  'POST /extract': async ({ chassis, readBody, sendOk }) => {
    const body = await readBody();
    const kind = body?.kind || 'list';
    const data = await chassis.getPrimitives().extract({
      kind,
      ref: body?.ref !== undefined && body.ref !== null ? Number(body.ref) : undefined,
      selector: body?.selector,
      type: body?.type,
      limit: body?.limit !== undefined ? Number(body.limit) : undefined,
      includeFrames: body?.include_frames === true,
      maxFrames: body?.max_frames !== undefined ? Number(body.max_frames) : undefined,
      timeoutMs: body?.timeout_ms !== undefined ? Number(body.timeout_ms) : undefined,
    });
    sendOk(data);
  },

  'POST /llm/surface': async ({ chassis, readBody, sendOk }) => {
    const body = await readBody();
    sendOk(await chassis.llm.probe(body?.url));
  },

  'POST /llm/fetch': async ({ chassis, readBody, sendOk }) => {
    const body = await readBody();
    sendOk(await chassis.llm.fetch({ url: body?.url, as: body?.as }));
  },

  'POST /read/url': async ({ chassis, readBody, sendOk }) => {
    const body = await readBody();
    sendOk(
      await chassis.llm.readUrl({
        url: body?.url,
        maxChars: body?.max_chars ?? body?.maxChars,
        cursor: body?.cursor,
        as: body?.as,
      }),
    );
  },

  'POST /search/web': async ({ chassis, readBody, sendOk }) => {
    const body = await readBody();
    sendOk(
      await chassis.search.web(body?.query, {
        engine: body?.engine,
        engines: Array.isArray(body?.engines) ? body.engines : undefined,
        urlTemplate: body?.url_template ?? body?.urlTemplate,
        max: body?.max_results ?? body?.max,
      }),
    );
  },

  'POST /crawl/deep': async ({ chassis, readBody, sendOk }) => {
    const body = await readBody();
    sendOk(
      await chassis.crawl.deepCrawl({
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
      }),
    );
  },

  'POST /research/topic': async ({ chassis, readBody, sendOk }) => {
    const body = await readBody();
    sendOk(
      await chassis.crawl.researchTopic({
        query: body?.query,
        maxSources: body?.max_sources ?? body?.maxSources,
        engine: body?.engine,
        engines: Array.isArray(body?.engines) ? body.engines : undefined,
        urlTemplate: body?.url_template ?? body?.urlTemplate,
        excerptChars: body?.excerpt_chars ?? body?.excerptChars,
        harvestToCortex: body?.harvest_to_cortex ?? body?.harvestToCortex,
        preferLlm: body?.prefer_llm ?? body?.preferLlm,
      }),
    );
  },

  'POST /citation/relocate': async ({ chassis, readBody, sendOk }) => {
    const body = await readBody();
    sendOk(
      await chassis.researchView.relocateCitation({
        url: body?.url,
        fingerprint: body?.fingerprint,
        threshold: body?.threshold,
      }),
    );
  },

  'POST /citation/revalidate': async ({ chassis, readBody, sendOk }) => {
    const body = await readBody();
    sendOk(
      await chassis.researchView.revalidateStored({
        url: body?.url,
        maxUrls: body?.max_urls ?? body?.maxUrls,
      }),
    );
  },

  'POST /collect': async ({ chassis, readBody, sendOk }) => {
    const body = await readBody();
    const data = await chassis.getPrimitives().collectAll({
      ref: body?.ref !== undefined && body.ref !== null ? Number(body.ref) : undefined,
      selector: body?.selector,
      scroll: body?.scroll === 'window' ? 'window' : 'container',
      step: body?.step !== undefined ? Number(body.step) : undefined,
      delayMs: body?.delay_ms ?? body?.delayMs,
      maxScrolls: body?.max_scrolls ?? body?.maxScrolls,
      max: body?.max !== undefined ? Number(body.max) : undefined,
    });
    sendOk(data);
  },
};

/**
 * When to use: the bridge request handler — dispatch the research routes.
 * Returns false when the method+path pair is not a research route.
 */
export async function handleResearchRoutes(ctx: ChassisRouteContext): Promise<boolean> {
  return dispatchRoute(ROUTES, ctx, (handler) => handler(ctx));
}
