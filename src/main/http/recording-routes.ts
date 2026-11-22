/**
 * The bridge's `/recording/*` routes — the timelapse recorder.
 *
 * Why a module: three of the four routes repeated the same "tools disabled in
 * Settings → Recording" 403 and the same `RECORDING_FAILED` 400. Both responses
 * now come from one helper each, so a change to the message or code lands once.
 */
import {
  getRecordingConfig,
  getRecordingStatus,
  listRecordings,
  startRecording,
  stopRecording,
} from '../recording/recording-service.js';
import type { ChassisRouteContext } from './route-table.js';
import { dispatchRoute } from './route-table.js';

type RecordingHandler = (ctx: ChassisRouteContext) => Promise<void> | void;

/** True when the human-only switch currently blocks recording tools. */
const toolsDisabled = (): boolean => getRecordingConfig().toolsEnabled === false;

const toolsDisabledResponse = (sendJson: ChassisRouteContext['sendJson']): void => {
  sendJson(
    {
      success: false,
      error: 'Recording tools are disabled in Settings → Recording (human-only switch).',
      code: 'RECORDING_TOOLS_DISABLED',
    },
    403,
  );
};

const failureResponse = (sendJson: ChassisRouteContext['sendJson'], error: unknown): void => {
  sendJson({ success: false, error: String((error as any)?.message || error), code: 'RECORDING_FAILED' }, 400);
};

const ROUTES: Record<string, RecordingHandler> = {
  'GET /recording/status': ({ sendJson }) => {
    sendJson({ success: true, ...getRecordingStatus() });
  },

  'POST /recording/start': async ({ readBody, sendJson }) => {
    if (toolsDisabled()) {
      toolsDisabledResponse(sendJson);
      return;
    }
    const body = await readBody();
    try {
      const started = await startRecording(typeof body?.name === 'string' ? body.name : undefined);
      sendJson({ success: true, ...started, status: getRecordingStatus() });
    } catch (error) {
      failureResponse(sendJson, error);
    }
  },

  'POST /recording/stop': async ({ sendJson }) => {
    if (toolsDisabled()) {
      toolsDisabledResponse(sendJson);
      return;
    }
    try {
      const result = await stopRecording();
      sendJson({ success: true, recording: result, ...result });
    } catch (error) {
      failureResponse(sendJson, error);
    }
  },

  'GET /recording/list': ({ url, sendJson }) => {
    if (toolsDisabled()) {
      toolsDisabledResponse(sendJson);
      return;
    }
    const limit = Number(url.searchParams.get('limit')) || 20;
    const config = getRecordingConfig();
    sendJson({
      success: true,
      enabled: config.enabled,
      toolsEnabled: config.toolsEnabled,
      outputDir: config.outputDir,
      recording: getRecordingStatus().recording,
      recordings: listRecordings(limit),
    });
  },
};

/**
 * When to use: the bridge request handler — dispatch `/recording/*`. Returns
 * false when the method+path pair is not a recording route.
 */
export async function handleRecordingRoutes(ctx: ChassisRouteContext): Promise<boolean> {
  return dispatchRoute(ROUTES, ctx, (handler) => handler(ctx));
}
