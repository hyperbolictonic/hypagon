/**
 * The bridge's `/media/*` routes.
 *
 * Why a module: the eight routes each repeated the same "service missing -> 503"
 * guard, and they share one response contract (`{ success, ...result }`, 200/400
 * on `result.ok`). The table below declares the exact method+path combinations,
 * so an unknown `/media` path still falls through to the bridge's 404 instead of
 * a misleading 503, and the guard exists once.
 */
import type { MediaService } from '../media/service.js';
import type { MediaQuality } from '../media/jobs.js';
import { dispatchRoute, type RouteTableContext } from './route-table.js';

/** When to use: building the media dispatcher — the media service, or undefined when the feature is off. */
export interface MediaRouteContext extends RouteTableContext {
  media?: MediaService;
}

type MediaHandler = (media: MediaService, ctx: MediaRouteContext) => Promise<void> | void;

/** The media tools accept `url` under its canonical name only; anything else is an empty read. */
const urlOf = (body: any): string => (typeof body?.url === 'string' ? body.url : '');
const optString = <T extends string = string>(value: unknown): T | undefined =>
  (typeof value === 'string' ? (value as T) : undefined);
const optNumber = (value: unknown): number | undefined => (typeof value === 'number' ? value : undefined);

/** One response contract for every media call: `{ success, ...result }`, 400 when `ok` is false. */
const respond = (sendJson: MediaRouteContext['sendJson'], result: any): void => {
  sendJson(result.ok ? { success: true, ...result } : { success: false, ...result }, result.ok ? 200 : 400);
};

const ROUTES: Record<string, MediaHandler> = {
  'GET /media/status': async (media, { sendJson }) => {
    try {
      sendJson({ success: true, ...(await media.status()) });
    } catch (error) {
      sendJson(
        {
          success: false,
          code: 'MEDIA_UNAVAILABLE',
          error: error instanceof Error ? error.message : String(error),
        },
        500,
      );
    }
  },

  'POST /media/info': async (media, { readBody, sendJson }) => {
    const body = await readBody();
    respond(sendJson, await media.info(urlOf(body)));
  },

  'POST /media/download': async (media, { readBody, sendJson }) => {
    const body = await readBody();
    respond(sendJson, await media.download({
      url: urlOf(body),
      kind: body?.kind === 'audio' ? 'audio' : body?.kind === 'video' ? 'video' : undefined,
      quality: optString<MediaQuality>(body?.quality),
    }));
  },

  'GET /media/jobs': (media, { sendJson }) => {
    sendJson({ success: true, jobs: media.jobs.list(), counts: media.jobs.counts() });
  },

  'POST /media/cancel': async (media, { readBody, sendJson }) => {
    const body = await readBody();
    const result = media.cancel(typeof body?.id === 'string' ? body.id : '');
    sendJson({ success: result.ok, ...result });
  },

  'GET /media/library': (media, { sendJson }) => {
    const jobs = media.library();
    sendJson({
      success: true,
      count: jobs.length,
      bytes: jobs.reduce((total, job) => total + job.files.reduce((sum, file) => sum + file.bytes, 0), 0),
      jobs,
    });
  },

  'POST /media/transcript': async (media, { readBody, sendJson }) => {
    const body = await readBody();
    respond(sendJson, await media.transcript(urlOf(body), {
      lang: optString(body?.lang),
      maxChars: optNumber(body?.maxChars),
      cursor: optNumber(body?.cursor),
      index: body?.index !== false,
    }));
  },

  'POST /media/preview': async (media, { readBody, sendJson }) => {
    const body = await readBody();
    respond(sendJson, await media.preview(urlOf(body), {
      lang: optString(body?.lang),
      maxChars: optNumber(body?.maxChars),
      thumbnail: body?.thumbnail !== false,
    }));
  },
};

/**
 * When to use: the bridge request handler — dispatch `/media/*` before the
 * generic routes. Returns false when the method+path pair is not a media route.
 */
export async function handleMediaRoutes(ctx: MediaRouteContext): Promise<boolean> {
  const service = ctx.media;
  return dispatchRoute(ROUTES, ctx, (handler) => {
    if (!service) {
      ctx.sendJson({ success: false, error: 'Media is not initialised.', code: 'MEDIA_UNAVAILABLE' }, 503);
      return;
    }
    return handler(service, ctx);
  });
}
