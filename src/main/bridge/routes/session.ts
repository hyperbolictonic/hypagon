/**
 * Session routes: recording, saved sessions, named contexts, HIL and window control.
 *
 * The Context endpoints are thin aliases over the session vault. HIL stays callable
 * while a person holds the wheel, because that is how the agent asks for help.
 *
 * The `ROUTES` table is the single source of truth: the handler dispatches from its
 * keys, and the MCP/bridge contract test reads the same keys statically.
 */

import {
  getRecordingConfig,
  getRecordingStatus,
  listRecordings,
  startRecording,
  stopRecording,
} from '../../recording/recording-service.js';
import type { BridgeContext } from '../context.js';

type Handler = (ctx: BridgeContext) => Promise<void>;

/** Recording tools are a human-only switch; answer 403 before touching the recorder. */
function recordingDisabled(ctx: BridgeContext): boolean {
  if (getRecordingConfig().toolsEnabled !== false) return false;
  ctx.json(
    {
      success: false,
      error: 'Recording tools are disabled in Settings → Recording (human-only switch).',
      code: 'RECORDING_TOOLS_DISABLED',
    },
    403,
  );
  return true;
}

/** Run a recorder mutation with the shared error mapping. */
async function runRecording(ctx: BridgeContext, run: () => Promise<void>): Promise<void> {
  try {
    await run();
  } catch (err: any) {
    ctx.fail(String(err?.message || err), 400, 'RECORDING_FAILED');
  }
}

const saveSession: Handler = async (ctx) => {
  const body = await ctx.body();
  ctx.json({ success: true, result: await ctx.chassis.sessions.save(body.name) });
};

const deleteSession: Handler = async (ctx) => {
  const body = await ctx.body();
  ctx.json({ success: true, deleted: ctx.chassis.sessions.delete(body.name) });
};

const windowState: Handler = async (ctx) => {
  ctx.json({ success: true, visible: ctx.chassis.isWindowVisible(), focused: ctx.chassis.isWindowFocused() });
};

const ROUTES: Record<string, Handler> = {
  'GET /recording/status': async (ctx) => {
    ctx.json({ success: true, ...getRecordingStatus() });
  },

  'POST /recording/start': async (ctx) => {
    if (recordingDisabled(ctx)) return;
    const body = await ctx.body();
    await runRecording(ctx, async () => {
      const started = await startRecording(typeof body?.name === 'string' ? body.name : undefined);
      ctx.json({ success: true, ...started, status: getRecordingStatus() });
    });
  },

  'POST /recording/stop': async (ctx) => {
    if (recordingDisabled(ctx)) return;
    await runRecording(ctx, async () => {
      const result = await stopRecording();
      ctx.json({ success: true, recording: result, ...result });
    });
  },

  'GET /recording/list': async (ctx) => {
    if (recordingDisabled(ctx)) return;
    const limit = Number(ctx.url.searchParams.get('limit')) || 20;
    const config = getRecordingConfig();
    ctx.json({
      success: true,
      enabled: config.enabled,
      toolsEnabled: config.toolsEnabled,
      outputDir: config.outputDir,
      recording: getRecordingStatus().recording,
      recordings: listRecordings(limit),
    });
  },

  'POST /session/save': saveSession,
  'POST /context/save': saveSession,

  'POST /session/restore': async (ctx) => {
    const body = await ctx.body();
    ctx.json({ success: true, result: await ctx.chassis.sessions.restore(body.name) });
  },

  'POST /context/open': async (ctx) => {
    const body = await ctx.body();
    if (!body?.name) {
      ctx.fail('Provide { name }', 400, 'BAD_REQUEST');
      return;
    }
    ctx.json({ success: true, result: await ctx.chassis.sessions.restore(body.name) });
  },

  'GET /session/list': async (ctx) => {
    ctx.json({ success: true, sessions: ctx.chassis.sessions.list() });
  },

  'GET /context/list': async (ctx) => {
    ctx.json({ success: true, contexts: ctx.chassis.sessions.list() });
  },

  'POST /session/delete': deleteSession,
  'POST /context/delete': deleteSession,

  'POST /hil/request': async (ctx) => {
    const body = await ctx.body();
    const result = await ctx.chassis.requestHumanIntervention(body.reason, {
      url: body.url,
      timeoutSeconds: body.timeoutSeconds,
      bringToFront: body.bringToFront,
    });
    ctx.json({ success: true, result });
  },

  'POST /hil/resolve': async (ctx) => {
    const body = await ctx.body();
    ctx.json({ success: true, resolved: ctx.chassis.resolveHumanIntervention(body.id, body.notes) });
  },

  'POST /hil/cancel': async (ctx) => {
    const body = await ctx.body();
    ctx.json({ success: true, cancelled: ctx.chassis.cancelHumanIntervention(body.id) });
  },

  'GET /hil/active': async (ctx) => {
    ctx.json({ success: true, active: ctx.chassis.getActiveHumanIntervention() });
  },

  'GET /hil/history': async (ctx) => {
    ctx.json({ success: true, history: ctx.chassis.getHumanInterventionHistory() });
  },

  'POST /notify': async (ctx) => {
    const body = await ctx.body();
    ctx.json({ success: true, sent: ctx.chassis.sendNotification(body.title, body.message, body.urgency, body.sound) });
  },

  'GET /window/visibility': windowState,

  'POST /window/visibility': async (ctx) => {
    const body = await ctx.body();
    // focus defaults to true for the human surface (tray menu, HIL, deck); agents
    // pass focus:false to lay the window out without stealing the foreground.
    const focus = body?.focus === undefined ? true : body.focus !== false;
    ctx.chassis.setWindowVisibility(!!body.visible, focus);
    if (body.visible && focus) ctx.chassis.focusWindow();
    ctx.json({ success: true, visible: ctx.chassis.isWindowVisible(), focused: ctx.chassis.isWindowFocused() });
  },

  'POST /window/focus': async (ctx) => {
    ctx.json({ success: true, focused: ctx.chassis.focusWindow() });
  },

  'GET /window/tray': async (ctx) => {
    ctx.json({ success: true, closeToTray: ctx.chassis.isCloseToTray() });
  },

  'POST /window/tray': async (ctx) => {
    const body = await ctx.body();
    if (typeof body.closeToTray === 'boolean') {
      ctx.chassis.setCloseToTray(body.closeToTray);
    }
    ctx.json({ success: true, closeToTray: ctx.chassis.isCloseToTray() });
  },
};

/** When to use: the request is a recording, session/context, HIL or window call. */
export async function handleSessionRoutes(ctx: BridgeContext): Promise<boolean> {
  const handler = ROUTES[`${ctx.method} ${ctx.pathname}`];
  if (!handler) return false;
  await handler(ctx);
  return true;
}
