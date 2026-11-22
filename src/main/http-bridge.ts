import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import type { BrowserChassis } from './browser-chassis.js';
import { APP_VERSION } from '../shared/version.js';
import { BRAND } from '../shared/brand.js';
import { shadowWalkStatus } from './shadow-walk/settings.js';
import { dataPath } from './data-paths.js';
import { runDecision, decisionStatus } from './decide/decision-client.js';
import { decideGuarded } from './decide/decision-guard.js';
import { driveTask } from './drive/driver.js';
import { loadRecipes, recipesFor, saveRecipe, deleteRecipe, recordResult, retireRecipe } from './recipes/recipe-store.js';
import { replayRecipe, type RecipeRunner } from './recipes/replay.js';
import { compileDriveSteps } from './recipes/compile.js';
import { summary, snapshot, resetMetrics } from './metrics.js';
import {
  getRecordingConfig,
  getRecordingStatus,
  listRecordings,
  startRecording,
  stopRecording,
} from './recording/recording-service.js';
import { DEFAULT_TOOL_SETTINGS, type ToolSettingsStore } from './tools/settings.js';
import type { CollaborationService } from './collaboration/service.js';
import type { MediaService } from './media/service.js';
import { handleCollaborationRoutes } from './http/collaboration-routes.js';
import { handleMediaRoutes } from './http/media-routes.js';
import { handleWrapRoutes, type WrapBridge } from './http/wrap-routes.js';
import { handleTabRoutes } from './http/tabs-routes.js';
import { handleScriptRoutes } from './http/scripts-routes.js';
import { handleHumanInterventionRoutes } from './http/hil-routes.js';
import { handleWindowRoutes } from './http/window-routes.js';

export type { WrapBridge };

function logBridge(message: string, isError = false) {
  const timestamp = new Date().toISOString();
  if (isError) {
    console.error(`[Cyberdeck Bridge ${timestamp}] ${message}`);
  } else {
    console.log(`[Cyberdeck Bridge ${timestamp}] ${message}`);
  }
  try {
    const logDir = dataPath('logs');
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
    const cleanMsg = message.replace(/\x1b\[[0-9;]*m/g, '');
    fs.appendFileSync(path.join(logDir, 'http-bridge.log'), `[${timestamp}] ${cleanMsg}\n`);
  } catch {
    // Ignore logging disk errors
  }
}

const SECRET_LOG_KEYS = new Set([
  'authorization',
  'cookie',
  'set-cookie',
  'password',
  'secret',
  'token',
  'access_token',
  'refresh_token',
  'api_key',
  'apikey',
  'x-api-key',
]);

/** Keep bridge logs useful without copying credentials or wrapper payload secrets into them. */
function redactLogValue(value: any, depth = 0): any {
  if (depth > 6 || value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((entry) => redactLogValue(entry, depth + 1));
  const out: Record<string, any> = {};
  for (const [key, entry] of Object.entries(value)) {
    out[key] = SECRET_LOG_KEYS.has(key.toLowerCase()) ? '<redacted>' : redactLogValue(entry, depth + 1);
  }
  return out;
}

export function startHttpBridge(
  chassis: BrowserChassis,
  port: number = 4111,
  wrap?: WrapBridge,
  toolSettings?: ToolSettingsStore,
  collaboration?: CollaborationService,
  media?: MediaService
) {
  /** Timestamp of the last mutating action, for `since: "last_action"` network correlation. */
  let lastActionAt = Date.now();
  const MUTATING_PATHS = new Set([
    '/navigate', '/click', '/type', '/form/fill', '/press-key', '/scroll',
    '/marks/click', '/marks/type', '/act',
  ]);
  const server = http.createServer(async (req, res) => {
    const startTime = Date.now();

    // Enable CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Kuang-Wrap-Token');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    const pathname = url.pathname;

    if (req.method === 'POST' && MUTATING_PATHS.has(pathname)) {
      lastActionAt = Date.now();
    }

    if (req.method === 'GET') {
      logBridge(`--> \x1b[36mGET\x1b[0m ${pathname}`);
      chassis.addLog('info', `GET ${pathname}`);
    }

    // Helper to read JSON body
    const readBody = (): Promise<any> =>
      new Promise((resolve) => {
        let body = '';
        req.on('data', (chunk) => (body += chunk));
        req.on('end', () => {
          try {
            const parsed = body ? JSON.parse(body) : {};
            const preview = JSON.stringify(redactLogValue(parsed));
            logBridge(`--> \x1b[35m${req.method}\x1b[0m ${pathname} body: ${preview.length > 300 ? preview.slice(0, 300) + '...' : preview}`);
            chassis.addLog('info', `${req.method} ${pathname}`);
            resolve(parsed);
          } catch {
            logBridge(`--> \x1b[35m${req.method}\x1b[0m ${pathname} body: [Raw/Non-JSON] ${body.slice(0, 100)}`);
            chassis.addLog('info', `${req.method} ${pathname}`);
            resolve({});
          }
        });
      });

    // Helper to send JSON
    const sendJson = (data: any, status = 200) => {
      const duration = Date.now() - startTime;
      const statusColor = status >= 400 ? '\x1b[31m' : '\x1b[32m';
      const summary = status >= 400 ? JSON.stringify(data) : (data?.result ? String(data.result).slice(0, 120) : 'OK');
      logBridge(`<-- ${statusColor}${status}\x1b[0m ${req.method} ${pathname} (${duration}ms) - ${summary}`, status >= 400);
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(data, null, 2));
    };

    try {
      // Explicit human control pauses the agent, not just its synthetic clicks. Reads (GET) stay
      // available for health/state/observations; mutations are refused until RESUME.
      const HUMAN_CONTROL_ALLOWED = new Set([
        '/health',
        '/human/status',
        '/human/takeover',
        '/human/resume',
        '/hil/active',
        '/hil/history',
        '/hil/request',
        '/hil/resolve',
        '/hil/cancel',
      ]);
      if (chassis.isHumanActive() && req.method !== 'GET' && !HUMAN_CONTROL_ALLOWED.has(pathname)) {
        sendJson(
          {
            success: false,
            error:
              'HUMAN_CONTROL: a person has taken control of the browser. Wait for them to press RESUME before acting.',
            code: 'HUMAN_CONTROL',
          },
          409,
        );
        return;
      }

      if (req.method === 'GET' && (pathname === '/health' || pathname === '/page-info')) {
        const info = chassis.getPageInfo();
        sendJson({
          status: 'ok',
          app: BRAND.appKey,
          version: APP_VERSION,
          revision: chassis.getRevision(),
          capabilities: chassis.getCapabilities(),
          decision: decisionStatus(),
          lastActionAt,
          window: { visible: chassis.isWindowVisible(), focused: chassis.isWindowFocused() },
          input: { transport: chassis.getSimulator().lastInputTransport },
          human: { paused: chassis.isHumanActive(), ...chassis.getHumanStatus() },
          metrics: summary(),
          shadowWalk: { ...shadowWalkStatus(), forceOpenArmed: chassis.forceOpenArmed() },
          zoom: chassis.getZoomState(),
          info,
        });
        return;
      }

      if (req.method === 'GET' && pathname === '/tools/config') {
        const settings = toolSettings?.load() ?? DEFAULT_TOOL_SETTINGS;
        // JEV availability is live bridge state, not a saved preference: the MCP server reads it
        // to lead tools/list with the index/read path and to mark the full-page dump as a fallback.
        const policy = chassis.getJevPolicy();
        sendJson({
          success: true,
          ...settings,
          jev: { available: policy.available, mode: policy.enforce ? 'enforce' : 'prefer' },
        });
        return;
      }

      if (await handleMediaRoutes({ media, method: req.method, pathname, url, readBody, sendJson })) return;

      if (await handleCollaborationRoutes({ collaboration, chassis, method: req.method, pathname, url, readBody, sendJson })) return;

      if (req.method === 'GET' && pathname === '/metrics') {
        sendJson({ success: true, version: APP_VERSION, counters: snapshot() });
        return;
      }
      if (req.method === 'POST' && pathname === '/metrics/reset') {
        sendJson({ success: true, ...resetMetrics() });
        return;
      }

      if (req.method === 'GET' && pathname === '/human/status') {
        sendJson({ success: true, ...chassis.getHumanStatus() });
        return;
      }
      if (req.method === 'POST' && pathname === '/human/takeover') {
        sendJson({ success: true, ...chassis.takeOverHuman() });
        return;
      }
      if (req.method === 'POST' && pathname === '/human/resume') {
        sendJson({ success: true, ...chassis.resumeHuman() });
        return;
      }

      // ---- navigation recipes (Phase 5) -------------------------------------
      if (req.method === 'GET' && pathname === '/recipes') {
        const url = String(new URL(req.url || '/', 'http://localhost').searchParams.get('url') || '');
        const store = loadRecipes();
        sendJson({ success: true, total: store.recipes.length, recipes: url ? recipesFor(url) : store.recipes });
        return;
      }
      if (req.method === 'POST' && pathname === '/recipes') {
        {
          const body = await readBody();
          const action = String(body?.action || 'list');
          if (action === 'save') {
            const saved = saveRecipe({ url: body?.url, name: body?.name, path: body?.path, steps: body?.steps });
            sendJson({ success: saved.ok, ...saved }, saved.ok ? 200 : 400);
            return;
          }
          if (action === 'delete') {
            const removed = deleteRecipe(String(body?.id || ''));
            sendJson({ success: removed, removed });
            return;
          }
          if (action === 'replay') {
            const target = body?.id
              ? loadRecipes().recipes.find((r) => r.id === body.id)
              : recipesFor(String(body?.url || ''))[0];
            if (!target) {
              sendJson({ success: false, error: 'no recipe matched that id or url', code: 'NO_RECIPE' }, 404);
              return;
            }
            const result = await replayRecipe(chassis.getPrimitives() as unknown as RecipeRunner, target, {
              expectTimeoutMs: body?.expect_timeout_ms !== undefined ? Number(body.expect_timeout_ms) : undefined,
            });
            if (result.code === 'SIGNATURE_MISMATCH') {
              const retired = retireRecipe(target.id);
              sendJson({ success: false, code: 'SIGNATURE_MISMATCH', error: result.message, result, recipe: retired }, 409);
              return;
            }
            if (result.code === 'SIGNATURE_UNAVAILABLE') {
              sendJson({ success: false, code: 'SIGNATURE_UNAVAILABLE', error: result.message, result }, 409);
              return;
            }
            const updated = recordResult(target.id, result.status === 'ok');
            sendJson({ success: result.status === 'ok', result, recipe: updated });
            return;
          }
          const url = String(body?.url || '');
          sendJson({ success: true, total: loadRecipes().recipes.length, recipes: url ? recipesFor(url) : loadRecipes().recipes });
          return;
        }
      }

      if (req.method === 'POST' && pathname === '/navigate') {
        const body = await readBody();
        const autoDismiss = body.autoDismissConsent !== undefined ? Boolean(body.autoDismissConsent) : true;
        let targetUrl = body.url || body.destination || body.target || body.link || ''; if (targetUrl && !/^https?:\/\//i.test(targetUrl) && !/^about:/i.test(targetUrl) && !/^mark-eleven:/i.test(targetUrl)) { targetUrl = 'https://' + targetUrl; } const result = await chassis.navigateTo(targetUrl, autoDismiss);
        // Live nudge at the moment reading starts: the index is cheap, the dump is not.
        const guided = chassis.isJevEnforced()
          ? `${result} | JEV ENFORCED: unscoped page reads are refused. Call jev_index, then read_section for only what you need.`
          : chassis.isJevEnabled()
            ? `${result} | JEV ACTIVE: call jev_index before reading this page, then read_section for only what you need.`
            : result;
        sendJson({ success: true, result: guided });
        return;
      }

      if (req.method === 'POST' && pathname === '/shield/dismiss') {
        const body = await readBody();
        const result = await chassis.dismissConsent({
          policy: body?.policy,
          forceRemove: body?.force_remove === true || body?.forceRemove === true,
        });
        sendJson({ success: true, result });
        return;
      }

      if (req.method === 'POST' && pathname === '/click') {
        const body = await readBody();
        const selector = body.selector || body.element || body.target || body.css;
        const x = body.x !== undefined ? Number(body.x) : undefined;
        const y = body.y !== undefined ? Number(body.y) : undefined;
        const coords = x !== undefined && !isNaN(x) && y !== undefined && !isNaN(y) ? { x, y } : undefined;
        if (!selector && !coords) {
          sendJson({ success: false, error: 'Must provide either "selector" or coordinates (x, y)' }, 400);
          return;
        }
        const result = await chassis.clickElement(selector, coords);
        sendJson({ success: true, result });
        return;
      }

      if (req.method === 'POST' && pathname === '/type') {
        const body = await readBody();
        const selector = body.selector || body.element || body.target;
        const text = body.text ?? body.value ?? body.content ?? body.input ?? '';
        const result = await chassis.typeText(String(text), selector);
        sendJson({ success: true, result });
        return;
      }

      if (req.method === 'POST' && pathname === '/form/fill') {
        const body = await readBody();
        const result = await chassis.fillForm(body.fields || {}, body.submitSelector);
        sendJson({ success: true, result });
        return;
      }

      if (req.method === 'POST' && pathname === '/press-key') {
        const body = await readBody();
        const result = await chassis.pressKey(body.key);
        sendJson({ success: true, result });
        return;
      }

      if (req.method === 'POST' && pathname === '/scroll') {
        const body = await readBody();
        const result = await chassis.scrollPage(body.direction || 'down', body.amount || 400);
        sendJson({ success: true, result });
        return;
      }

      if (req.method === 'GET' && pathname === '/markdown') {
        const includeMarks = url.searchParams.get('include_marks') !== 'false' && url.searchParams.get('marks') !== 'false';
        const includeOffscreen = ['1', 'true'].includes((url.searchParams.get('include_offscreen') || '').toLowerCase());
        const full = ['1', 'true'].includes((url.searchParams.get('full') || '').toLowerCase());
        // The hidden alias dumps the whole construct, so it passes through the same
        // hard funnel as observe(as:"markdown") with no budget or region.
        const pre = await chassis.precheckJevPageRead({ as: 'markdown', full });
        if (pre.blocked) {
          sendJson({ success: false, error: 'Unscoped page reads are disabled while JEV enforce is on. Call jev_index, then read_section.', code: 'JEV_REQUIRED', ...(pre.refusal || {}) }, 409);
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
          sendJson({ success: false, error: 'Unscoped page reads are disabled while JEV enforce is on. Call jev_index, then read_section.', code: 'JEV_REQUIRED', ...(guard.refusal || {}) }, 409);
          return;
        }
        if (guard.note) {
          sendJson({ success: true, construct: { ...construct, content: `${construct.content}\n\n[JEV] ${guard.note}` }, jevNote: guard.note });
          return;
        }
        sendJson({ success: true, construct });
        return;
      }

      if (req.method === 'GET' && pathname === '/jev/stats') {
        sendJson({ success: true, ...chassis.getJevStats(), status: chassis.getJevStatus() });
        return;
      }

      // JEV (Just-Enough-View) page compaction. Requires a decision model and the
      // optional JEV toggle; otherwise each route returns a clear error.
      if (req.method === 'GET' && pathname === '/jev/index') {
        sendJson(await chassis.jevIndex());
        return;
      }
      if (req.method === 'POST' && pathname === '/jev/read') {
        const body = await readBody();
        const sectionId = String(body.section_id ?? body.sectionId ?? '');
        const includeChildren = body.include_children === true || body.includeChildren === true;
        sendJson(chassis.jevReadSection(sectionId, includeChildren));
        return;
      }
      if (req.method === 'POST' && pathname === '/jev/search') {
        const body = await readBody();
        sendJson(chassis.jevSearch(String(body.query ?? '')));
        return;
      }

      if (req.method === 'GET' && pathname === '/screenshot') {
        const maxWidthParam = url.searchParams.get('max_width');
        const maxWidth = maxWidthParam !== null ? Number(maxWidthParam) : 768;
        const format = (url.searchParams.get('format') || 'jpeg').toLowerCase() as 'jpeg' | 'png';
        const qualityParam = url.searchParams.get('quality');
        const quality = qualityParam !== null ? Number(qualityParam) : 70;

        const screenshot = await chassis.takeScreenshot({ maxWidth, format, quality });
        sendJson({ success: true, screenshot });
        return;
      }

      if (req.method === 'POST' && pathname === '/screenshots/cleanup') {
        const body = await readBody();
        const maxFiles = body.maxFiles !== undefined ? Number(body.maxFiles) : 50;
        const maxAgeMs = body.maxAgeDays !== undefined ? Number(body.maxAgeDays) * 86400000 : 7 * 86400000;
        const cleanupResult = chassis.cleanupScreenshots(maxFiles, maxAgeMs);
        sendJson({ success: true, ...cleanupResult });
        return;
      }

      if (req.method === 'POST' && pathname === '/evaluate') {
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
        return;
      }

      // Shared control facts (marks / find / guard / recipes). Read-only, one injected expression.
      if (req.method === 'POST' && pathname === '/dom/facts') {
        const body = await readBody();
        const facts = await chassis.describeControls({
          selector: body?.selector,
          limit: body?.limit !== undefined ? Number(body.limit) : undefined,
          includeOffscreen: body?.include_offscreen !== false,
          skipHitTest: body?.skip_hit_test === true,
          deep: body?.deep === true,
        });
        sendJson({ success: true, ...facts });
        return;
      }

      // Iframes as first-class content: geometry, controls (offset to the top-level viewport)
      // and optional per-frame screenshots. Opt-in because it costs CDP commands per frame.
      if (req.method === 'GET' && pathname === '/frames') {
        const frames = await chassis.listFrames();
        sendJson({ success: true, frames });
        return;
      }

      if (req.method === 'POST' && pathname === '/frames') {
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
        return;
      }

      if (req.method === 'GET' && (pathname === '/console-logs' || pathname === '/console/logs')) {
        const logs = chassis.getTargetConsoleLogs(50);
        sendJson({ success: true, logs });
        return;
      }

      if (req.method === 'GET' && pathname === '/fingerprint') {
        const profile = chassis.getFingerprintProfile();
        sendJson({ success: true, profile });
        return;
      }

      if (req.method === 'GET' && pathname === '/downloads') {
        const downloads = chassis.getDownloads();
        sendJson({ success: true, downloads });
        return;
      }

      if (req.method === 'POST' && pathname === '/downloads/read') {
        const body = await readBody();
        const document = await chassis.readDownloadedDocument(body.filename || body.id);
        sendJson({ success: true, document });
        return;
      }

      // ---- timelapse recording --------------------------------------------------------------
      if (req.method === 'GET' && pathname === '/recording/status') {
        sendJson({ success: true, ...getRecordingStatus() });
        return;
      }

      if (req.method === 'POST' && pathname === '/recording/start') {
        if (getRecordingConfig().toolsEnabled === false) {
          sendJson(
            {
              success: false,
              error: 'Recording tools are disabled in Settings → Recording (human-only switch).',
              code: 'RECORDING_TOOLS_DISABLED',
            },
            403
          );
          return;
        }
        const body = await readBody();
        try {
          const started = await startRecording(typeof body?.name === 'string' ? body.name : undefined);
          sendJson({ success: true, ...started, status: getRecordingStatus() });
        } catch (err: any) {
          sendJson({ success: false, error: String(err?.message || err), code: 'RECORDING_FAILED' }, 400);
        }
        return;
      }

      if (req.method === 'POST' && pathname === '/recording/stop') {
        if (getRecordingConfig().toolsEnabled === false) {
          sendJson(
            {
              success: false,
              error: 'Recording tools are disabled in Settings → Recording (human-only switch).',
              code: 'RECORDING_TOOLS_DISABLED',
            },
            403
          );
          return;
        }
        try {
          const result = await stopRecording();
          sendJson({ success: true, recording: result, ...result });
        } catch (err: any) {
          sendJson({ success: false, error: String(err?.message || err), code: 'RECORDING_FAILED' }, 400);
        }
        return;
      }

      if (req.method === 'GET' && pathname === '/recording/list') {
        if (getRecordingConfig().toolsEnabled === false) {
          sendJson(
            {
              success: false,
              error: 'Recording tools are disabled in Settings → Recording (human-only switch).',
              code: 'RECORDING_TOOLS_DISABLED',
            },
            403
          );
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
        return;
      }

      if (req.method === 'POST' && pathname === '/session/save') {
        const body = await readBody();
        const result = await chassis.saveSession(body.name);
        sendJson({ success: true, result });
        return;
      }

      if (req.method === 'POST' && pathname === '/session/restore') {
        const body = await readBody();
        const result = await chassis.restoreSession(body.name);
        sendJson({ success: true, result });
        return;
      }

      if (req.method === 'GET' && pathname === '/session/list') {
        const sessions = chassis.listSessions();
        sendJson({ success: true, sessions });
        return;
      }

      if (req.method === 'POST' && pathname === '/session/delete') {
        const body = await readBody();
        const deleted = chassis.deleteSession(body.name);
        sendJson({ success: true, deleted });
        return;
      }

      if ((req.method === 'GET' || req.method === 'POST') && pathname === '/network/traffic') {
        const filter = req.method === 'POST' ? await readBody() : undefined;
        let traffic = chassis.getNetworkTraffic(filter);
        if (filter) {
          const since = filter.since === 'last_action' ? lastActionAt : Number(filter.since);
          if (since && !isNaN(since)) {
            traffic = traffic.filter((r) => (r.requestTime || 0) >= since);
          }
        }
        sendJson({ success: true, count: traffic.length, traffic });
        return;
      }

      if (req.method === 'POST' && pathname === '/network/payload') {
        const body = await readBody();
        const payload = chassis.getApiPayload(body.requestId);
        sendJson({ success: true, payload });
        return;
      }

      if (req.method === 'POST' && pathname === '/network/clear') {
        chassis.clearNetworkTraffic();
        sendJson({ success: true, message: 'Network traffic buffer cleared' });
        return;
      }

      if (req.method === 'POST' && pathname === '/json/query') {
        const body = await readBody();
        const source = body.source || body.from || 'network_payload';
        const sourceId = body.sourceId || body.source_id || body.requestId || body.request_id || body.streamId || body.stream_id || body.filename || body.file;
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
        return;
      }

      if (req.method === 'POST' && pathname === '/snapshot/rendered') {
        const body = await readBody();
        const result = await chassis.snapshotRenderedPage({
          format: body.format || body.mode,
          waitUntilIdleMs: body.waitUntilIdleMs ?? body.wait_until_idle_ms,
          pierceShadowDom: body.pierceShadowDom ?? body.pierce_shadow_dom,
          saveToDisk: body.saveToDisk ?? body.save_to_disk,
          forceRerender: body.forceRerender ?? body.force_rerender,
        });
        sendJson({ success: true, ...result });
        return;
      }

      if (req.method === 'POST' && pathname === '/prerender/links') {
        const body = await readBody();
        const result = await chassis.prerenderLinks({
          urls: body.urls,
          selector: body.selector,
          maxPages: body.maxPages ?? body.max_pages,
          harvestToCortex: body.harvestToCortex ?? body.harvest_to_cortex,
          waitUntilIdleMs: body.waitUntilIdleMs ?? body.wait_until_idle_ms,
        });
        sendJson({ success: true, ...result });
        return;
      }

      if ((req.method === 'GET' || req.method === 'POST') && pathname === '/streams/list') {
        const body = req.method === 'POST' ? await readBody() : {};
        const streams = chassis.getRealtimeStreams(body);
        sendJson({ success: true, streams });
        return;
      }

      if (req.method === 'POST' && pathname === '/streams/messages') {
        const body = await readBody();
        const messages = chassis.getStreamMessages(body);
        sendJson({ success: true, messages });
        return;
      }

      if (req.method === 'POST' && pathname === '/streams/clear') {
        const body = await readBody();
        chassis.clearStreamMessages(body.streamId);
        sendJson({ success: true, message: 'Stream message buffer cleared' });
        return;
      }

      if (req.method === 'POST' && pathname === '/capture/clear') {
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
        return;
      }

      if (req.method === 'GET' && pathname === '/marks/screenshot') {
        const flag = (name: string) => ['1', 'true'].includes((url.searchParams.get(name) || '').toLowerCase());
        const result = await chassis.takeAnnotatedScreenshot({ economy: flag('economy'), textOnly: flag('text_only'), includeOffscreen: flag('include_offscreen') });
        sendJson({ success: true, ...result });
        return;
      }

      if (req.method === 'POST' && pathname === '/marks/click') {
        const body = await readBody();
        const rawId = body.markId ?? body.mark_id ?? body.mark ?? body.id ?? body.badge ?? body.index ?? body.num ?? body.number;
        if (rawId === undefined || isNaN(Number(rawId))) {
          sendJson({ success: false, error: 'Must provide valid numeric markId (or mark_id)' }, 400);
          return;
        }
        const result = await chassis.clickMark(Number(rawId));
        sendJson({ success: true, result });
        return;
      }

      if (req.method === 'POST' && pathname === '/marks/type') {
        const body = await readBody();
        const rawId = body.markId ?? body.mark_id ?? body.mark ?? body.id ?? body.badge ?? body.index ?? body.num ?? body.number;
        const text = body.text ?? body.value ?? body.content ?? body.input ?? '';
        if (rawId === undefined || isNaN(Number(rawId))) {
          sendJson({ success: false, error: 'Must provide valid numeric markId (or mark_id)' }, 400);
          return;
        }
        const result = await chassis.typeMark(Number(rawId), String(text), {
          clearFirst: body?.clear_first === true || body?.clearFirst === true,
        });
        sendJson({ success: true, result });
        return;
      }

      if (req.method === 'GET' && pathname === '/marks/list') {
        const marks = chassis.getActiveMarks();
        sendJson({ success: true, marks });
        return;
      }

      if (await handleScriptRoutes({ chassis, method: req.method, pathname, url, readBody, sendJson })) return;

      if (req.method === 'POST' && pathname === '/history') {
        const body = await readBody();
        let result = '';
        if (body.action === 'back') result = await chassis.goBack();
        else if (body.action === 'forward') result = await chassis.goForward();
        else if (body.action === 'reload') result = await chassis.reload();
        sendJson({ success: true, result });
        return;
      }

      if (req.method === 'GET' && pathname === '/zoom') {
        sendJson({ success: true, zoom: chassis.getZoomState() });
        return;
      }

      if (req.method === 'POST' && pathname === '/zoom') {
        const body = await readBody();
        const action = body?.action === 'in' || body?.action === 'out' || body?.action === 'reset' || body?.action === 'status'
          ? body.action
          : 'status';
        const factor = body?.factor !== undefined ? Number(body.factor) : undefined;
        if (body?.action === 'set' && factor === undefined) {
          sendJson({ success: false, error: 'action "set" requires a numeric factor.', code: 'BAD_REQUEST' }, 400);
          return;
        }
        if (factor !== undefined && (!Number.isFinite(factor) || factor < 0.25 || factor > 5)) {
          sendJson({ success: false, error: 'factor must be between 0.25 and 5.', code: 'BAD_REQUEST' }, 400);
          return;
        }
        const zoom = chassis.setZoom({ action, factor });
        sendJson({ success: true, zoom });
        return;
      }

      if (req.method === 'GET' && pathname === '/viewport') {
        sendJson({ success: true, viewport: chassis.getViewportState() });
        return;
      }

      if (req.method === 'POST' && pathname === '/viewport') {
        const body = await readBody();
        const requested =
          body?.action === 'reset' || body?.action === 'rotate' || body?.action === 'set' || body?.action === 'status'
            ? body.action
            : body?.preset !== undefined || body?.width !== undefined
              ? 'set'
              : 'status';
        try {
          const viewport = await chassis.setViewport({
            action: requested,
            preset: typeof body?.preset === 'string' ? body.preset : undefined,
            width: body?.width !== undefined ? Number(body.width) : undefined,
            height: body?.height !== undefined ? Number(body.height) : undefined,
            deviceScaleFactor:
              body?.device_scale_factor !== undefined
                ? Number(body.device_scale_factor)
                : body?.deviceScaleFactor !== undefined
                  ? Number(body.deviceScaleFactor)
                  : undefined,
            mobile: typeof body?.mobile === 'boolean' ? body.mobile : undefined,
            touch: typeof body?.touch === 'boolean' ? body.touch : undefined,
          });
          sendJson({ success: true, viewport });
        } catch (error: any) {
          sendJson({ success: false, error: error?.message || String(error), code: 'BAD_REQUEST' }, 400);
        }
        return;
      }

      if (await handleTabRoutes({ chassis, method: req.method, pathname, url, readBody, sendJson })) return;

      // Cortex LanceDB Semantic Memory Endpoints
      if (req.method === 'POST' && pathname === '/cortex/recall') {
        const body = await readBody();
        const cortex = chassis.getCortex();
        const results = await cortex.recall(body.query, { limit: body.limit, domain: body.domain });
        sendJson({ success: true, results });
        return;
      }

      if (req.method === 'GET' && pathname === '/cortex/history') {
        const cortex = chassis.getCortex();
        const limit = url.searchParams.get('limit') ? parseInt(url.searchParams.get('limit')!, 10) : undefined;
        const domain = url.searchParams.get('domain') || undefined;
        const history = await cortex.getHistory({ limit, domain });
        sendJson({ success: true, history });
        return;
      }

      if (req.method === 'GET' && pathname === '/cortex/suggest') {
        const cortex = chassis.getCortex();
        const query = url.searchParams.get('q') || '';
        const limit = url.searchParams.get('limit') ? parseInt(url.searchParams.get('limit')!, 10) : undefined;
        const semantic = url.searchParams.get('semantic') !== 'false';
        const suggestions = await cortex.suggestUrls(query, { limit, semantic });
        sendJson({ success: true, suggestions });
        return;
      }

      if (req.method === 'POST' && pathname === '/cortex/history/clear') {
        const body = await readBody();
        const cortex = chassis.getCortex();
        await cortex.clearHistory(body.olderThan);
        sendJson({ success: true, message: 'History cleared' });
        return;
      }

      // Bookmarks Endpoints
      if (req.method === 'GET' && pathname === '/bookmarks') {
        const cortex = chassis.getCortex();
        const query = url.searchParams.get('q') || undefined;
        const tag = url.searchParams.get('tag') || undefined;
        const limit = url.searchParams.get('limit') ? parseInt(url.searchParams.get('limit')!, 10) : undefined;
        const bookmarks = await cortex.listBookmarks({ query, tag, limit });
        sendJson({ success: true, bookmarks });
        return;
      }

      if (req.method === 'POST' && pathname === '/bookmarks/add') {
        const body = await readBody();
        const cortex = chassis.getCortex();
        const activeUrl = chassis.getTabsSummary().find(t => t.isActive)?.url || 'about:blank';
        const bookmark = await cortex.addBookmark({
          url: body.url || activeUrl,
          title: body.title,
          notes: body.notes,
          tags: body.tags
        });
        sendJson({ success: true, bookmark });
        return;
      }

      if (req.method === 'POST' && pathname === '/bookmarks/delete') {
        const body = await readBody();
        const cortex = chassis.getCortex();
        const deleted = await cortex.deleteBookmark(body.urlOrId);
        sendJson({ success: true, deleted });
        return;
      }

      if (req.method === 'GET' && pathname === '/bookmarks/check') {
        const cortex = chassis.getCortex();
        const checkUrl = url.searchParams.get('url') || '';
        const isBookmarked = await cortex.isBookmarked(checkUrl);
        sendJson({ success: true, isBookmarked });
        return;
      }

      // Human-In-The-Loop & Notification Endpoints
      if (await handleHumanInterventionRoutes({ chassis, method: req.method, pathname, url, readBody, sendJson })) return;

      if (req.method === 'POST' && pathname === '/notify') {
        const body = await readBody();
        const sent = chassis.sendNotification(body.title, body.message, body.urgency, body.sound);
        sendJson({ success: true, sent });
        return;
      }

      // Window & System Tray Management Endpoints
      if (await handleWindowRoutes({ chassis, method: req.method, pathname, url, readBody, sendJson })) return;

      // Chaos Kinematics & Mouse Movement Endpoints
      if (req.method === 'POST' && pathname === '/chaos/trajectory') {
        const body = await readBody();
        const target = body.target || { x: 500, y: 500 };
        const steps = chassis.testChaosTrajectory(target, body.options);
        const totalDurationMs = steps.reduce((sum, s) => sum + s.delayMs, 0);
        const peakVelocity = Math.max(...steps.map((s) => s.velocity));
        const correctiveSteps = steps.filter((s) => s.isCorrective).length;
        sendJson({
          success: true,
          steps,
          metrics: {
            stepCount: steps.length,
            totalDurationMs,
            peakVelocity,
            hasOvershoot: correctiveSteps > 0,
            correctiveSteps,
          },
        });
        return;
      }

      if (req.method === 'POST' && pathname === '/mouse/move') {
        const body = await readBody();
        const target = body.target || { x: 500, y: 500 };
        await chassis.moveMouse(target, body.options);
        sendJson({ success: true, target });
        return;
      }

      // ---- Primitives layer (observe / act / wait / extract / collect / find) ----

      if (req.method === 'GET' && pathname === '/page-version') {
        sendJson({ success: true, revision: chassis.getRevision(), capabilities: chassis.getCapabilities() });
        return;
      }

      if ((req.method === 'POST' || req.method === 'GET') && pathname === '/page-state') {
        const state = await chassis.getPrimitives().pageState();
        sendJson({ success: true, state });
        return;
      }

      if (req.method === 'POST' && pathname === '/diff') {
        const body = await readBody();
        const since = body?.since !== undefined && body.since !== null && body.since !== '' ? Number(body.since) : undefined;
        const diff = await chassis.getPrimitives().diff(isNaN(Number(since)) ? undefined : since);
        sendJson({ success: true, ...diff });
        return;
      }

      if (req.method === 'POST' && pathname === '/wait-for') {
        const body = await readBody();
        const conditions = Array.isArray(body?.conditions) ? body.conditions : body?.condition ? [body.condition] : [];
        if (!conditions.length) {
          sendJson({ success: false, error: 'Provide { conditions: [{type:"selector", selector:"..."}] }', code: 'BAD_REQUEST' }, 400);
          return;
        }
        const result = await chassis.getPrimitives().waitFor(conditions, {
          timeoutMs: body.timeout_ms ?? body.timeoutMs,
          pollMs: body.poll_ms ?? body.pollMs,
          require: body.require === 'all' ? 'all' : 'any',
        });
        sendJson({ success: true, ...result });
        return;
      }

      if (req.method === 'POST' && pathname === '/expect') {
        const body = await readBody();
        const conditions = Array.isArray(body?.conditions) ? body.conditions : body?.condition ? [body.condition] : [];
        const result = await chassis.getPrimitives().expect(conditions);
        sendJson({ success: true, ...result });
        return;
      }

      // ---- optional decision model (off unless configured) -------------------
      if (req.method === 'POST' && pathname === '/drive') {
        const body = await readBody();
        if (!decisionStatus().configured) {
          sendJson({ success: false, error: 'No decision model is configured.', code: 'NOT_CONFIGURED' }, 400);
          return;
        }
        const result = await driveTask(chassis.getPrimitives(), {
          goal: String(body?.goal || ''),
          values: body?.values && typeof body.values === 'object' ? body.values : undefined,
          maxSteps: body?.max_steps ?? body?.maxSteps,
          threshold: body?.threshold,
          maxAttempts: body?.max_attempts ?? body?.maxAttempts,
          dryRun: body?.dry_run === true || body?.dryRun === true,
          includePageText: body?.include_page_text !== false,
        });
        if (result.status === 'human_required') {
          void chassis.requestHumanForGate({ kind: result.gate, reason: result.message, evidence: result.reasons }, result.url);
        }
        // Compile a verified run into a recipe on request: decide once, replay cheap next time.
        let recipe: any = null;
        if ((body?.save_recipe === true || body?.saveRecipe === true) && result.status === 'done') {
          const steps = compileDriveSteps(result.steps as any[], { values: body?.values || {} });
          if (steps.length) {
            const saved = saveRecipe({
              url: result.url || chassis.getPageInfo().url,
              name: body?.recipe_name || body?.recipeName || String(body?.goal || '').slice(0, 80),
              steps,
            });
            recipe = saved.ok ? saved.recipe : { error: saved.errors.join('; ') };
          }
        }
        // 200 with a status field: the transcript matters more than the HTTP code here.
        sendJson({ success: true, ...result, recipe });
        return;
      }
      if (req.method === 'GET' && pathname === '/decisions') {
        const decisions = chassis.getDecisionEvents();
        sendJson({ success: true, count: decisions.length, decisions });
        return;
      }
      if (pathname === '/decide' && (req.method === 'GET' || req.method === 'POST')) {
        if (req.method === 'GET') {
          sendJson({ success: true, ...decisionStatus() });
          return;
        }
        const body = await readBody();
        // A guarded call (the decision loop) inspects the real page text as well as the caller's
        // state: a wall announces itself in copy ("Verify your birthday to continue") that the
        // component table alone does not carry. Raw `decide` stays a pure pipe.
        const useGuard = body?.guard !== undefined || body?.eliminate !== undefined;
        let state = body?.state;
        let usedPageText = false;
        if (body?.include_page_text === true || (body?.include_page_text !== false && useGuard)) {
          try {
            const page = await chassis.getPrimitives().observe({ as: 'text', budget: 4000 });
            const pageText = typeof page?.text === 'string' ? page.text.slice(0, 4000) : '';
            if (pageText.trim()) {
              state = `${typeof state === 'string' ? state : JSON.stringify(state ?? '')}\n\nVisible page text:\n${pageText}`;
              usedPageText = true;
            }
          } catch {
            // No page context available (e.g. called before a tab exists) — carry on with the state.
          }
        }
        let assets: Record<string, unknown> | undefined;
        let screenshotNote: string | undefined;
        if (body?.include_screenshot === true) {
          // Jev accepts images in the state, referenced by name from a top-level `assets` map.
          // Only the hosted backend is multimodal; say so rather than silently dropping the image.
          const endpoint = decisionStatus().endpoint || '';
          if (/opencode\.ai/i.test(endpoint)) {
            // The OpenCode gateway does not forward TypeSafe's Danger-Zone header (verified directly),
            // so an image can only end in a 400. Refuse up front and say why.
            screenshotNote =
              'disabled: the OpenCode gateway does not forward TypeSafe headers — images only work against api.typesafe.ai';
          } else if (decisionStatus().protocol === 'typesafe') {
            const shot = await chassis.captureScreenshotJpeg().catch(() => null);
            if (shot) {
              const ref = `kuang-shot-${Date.now().toString(36)}`;
              const text = typeof state === 'string' ? state : JSON.stringify(state ?? '');
              state = {
                text: `${text}\n\nA screenshot of the visible viewport (${shot.width}x${shot.height}) is attached as \`${ref}\`.`,
                screenshot: ref,
              };
              assets = { [ref]: { type: 'image', format: 'jpg', data_base64: shot.base64 } };
              screenshotNote = `${shot.width}x${shot.height} jpeg attached`;
            } else {
              screenshotNote = 'capture failed — decided without an image';
            }
          } else {
            screenshotNote = 'ignored: the local ONNX model is text-only';
          }
        }

        const result = useGuard
          ? await decideGuarded({
              state,
              pageUrl: usedPageText ? chassis.getPageInfo().url : undefined,
              questions: body?.questions || {},
              model: body?.model,
              assets,
              guard: body?.guard || {},
              maxAttempts: body?.eliminate?.max_attempts ?? body?.eliminate?.maxAttempts ?? (body?.eliminate ? 3 : 1),
            })
          : await runDecision({
              state,
              pageUrl: usedPageText ? chassis.getPageInfo().url : undefined,
              questions: body?.questions || {},
              model: body?.model,
              assets,
            });
        if (screenshotNote || (result as any).imageNote) {
          (result as any).screenshot = (result as any).imageNote || screenshotNote;
        }
        // A guarded call that did not accept any answer (`accepted:false` — confidence gate or every
        // option eliminated) is exactly the case a person should answer. Note it arrives with
        // ok:true, so this must be checked BEFORE the success branch.
        if ((result as any).accepted === false) {
          const optionNames: string[] = [];
          for (const q of Object.values(body?.questions || {}) as any[]) {
            const criteria = q?.criteria;
            if (criteria && typeof criteria === 'object') optionNames.push(...Object.keys(criteria));
          }
          const options = [...new Set(optionNames)];
          const hilId = chassis.requestHumanForDecision(
            {
              question: typeof body?.state === 'string' ? body.state.split('\n')[0].slice(0, 140) : undefined,
              options,
              reasons: (result as any).reasons,
            },
            chassis.getPageInfo().url
          );
          sendJson(
            {
              success: false,
              error: 'human decision required — the guarded choice did not clear its threshold',
              code: 'HUMAN_DECISION_REQUIRED',
              human_required: true,
              hil_id: hilId,
              options,
              reasons: (result as any).reasons,
              hint: 'Do NOT guess or act. A human has been asked (the HIL banner is up). Wait for them to resolve it, then re-observe the page and continue.',
              protocol: result.protocol,
              latencyMs: result.latencyMs,
            },
            409
          );
          return;
        }
        if (result.ok) {
          // "Blocked" without a deterministic match is not a compliance boundary we can prove.
          // The agent decides: it may know the site, or it may call request_human_intervention.
          const operation = (result as any).answers?.operation?.choice;
          if (operation === 'blocked' && !(result as any).gate) {
            (result as any).hint =
              'No deterministic gate matched (no age-verification or CAPTCHA copy). The agent decides: if this is a compliance boundary — age, CAPTCHA, payment, identity — call request_human_intervention; otherwise choose the next step yourself.';
          }
          sendJson({ success: true, ...result });
        } else {
          const code = result.error?.code;
          // A sensitive gate is a hand-off, not just an error: raise the HIL request from Kuang so
          // the human is actually asked (throttled per URL, and skipped if one is already open).
          if (code === 'HUMAN_REQUIRED') {
            const hint = result.error?.hint || '';
            const evidence = hint.replace(/^Matched:\s*/i, '').split(/\s*\|\s*/).filter(Boolean);
            // Do NOT await the intervention: its promise resolves when the *human* acts, which can
            // take minutes. The request itself is registered synchronously before the first await,
            // so the caller gets 409 immediately with the banner already up.
            void chassis.requestHumanForGate(
              { kind: (result as any).gate, reason: result.error?.message || 'Human required', evidence },
              chassis.getPageInfo().url
            );
          }
          // A guarded call whose every option was rejected is handled above (accepted:false) —
          // this branch is for transport/backend failures only.
          const status = code === 'TIMEOUT' ? 504 : code === 'HUMAN_REQUIRED' ? 409 : code === 'UPSTREAM_ERROR' ? 502 : 400;
          sendJson(
            {
              success: false,
              // `error` stays a string: the MCP client turns it into "HTTP 400: <error>".
              error: result.error?.message || 'decision call failed',
              code,
              gate: (result as any).gate,
              hint: result.error?.hint,
              fallback: (result as any).fallback,
              reasons: (result as any).reasons,
              upstreamStatus: result.error?.status,
              protocol: result.protocol,
              latencyMs: result.latencyMs,
            },
            status
          );
        }
        return;
      }

      if (req.method === 'POST' && pathname === '/observe') {
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
        sendJson({ success: true, ...obs });
        return;
      }

      if (req.method === 'POST' && pathname === '/extract') {
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
        sendJson({ success: true, ...data });
        return;
      }

      if (req.method === 'POST' && pathname === '/llm/surface') {
        const body = await readBody();
        const report = await chassis.probeLlmSurface(body?.url);
        sendJson({ success: true, ...report });
        return;
      }

      if (req.method === 'POST' && pathname === '/llm/fetch') {
        const body = await readBody();
        const result = await chassis.fetchLlmSurface({ url: body?.url, as: body?.as });
        sendJson({ success: true, ...result });
        return;
      }

      if (req.method === 'POST' && pathname === '/read/url') {
        const body = await readBody();
        const result = await chassis.readUrl({
          url: body?.url,
          maxChars: body?.max_chars ?? body?.maxChars,
          cursor: body?.cursor,
          as: body?.as,
        });
        sendJson({ success: true, ...result });
        return;
      }

      if (req.method === 'POST' && pathname === '/search/web') {
        const body = await readBody();
        const outcome = await chassis.searchWeb(body?.query, {
          engine: body?.engine,
          engines: Array.isArray(body?.engines) ? body.engines : undefined,
          urlTemplate: body?.url_template ?? body?.urlTemplate,
          max: body?.max_results ?? body?.max,
        });
        sendJson({ success: true, ...outcome });
        return;
      }

      if (req.method === 'POST' && pathname === '/crawl/deep') {
        const body = await readBody();
        const outcome = await chassis.deepCrawl({
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
        sendJson({ success: true, ...outcome });
        return;
      }

      if (req.method === 'POST' && pathname === '/research/topic') {
        const body = await readBody();
        const outcome = await chassis.researchTopic({
          query: body?.query,
          maxSources: body?.max_sources ?? body?.maxSources,
          engine: body?.engine,
          engines: Array.isArray(body?.engines) ? body.engines : undefined,
          urlTemplate: body?.url_template ?? body?.urlTemplate,
          excerptChars: body?.excerpt_chars ?? body?.excerptChars,
          harvestToCortex: body?.harvest_to_cortex ?? body?.harvestToCortex,
          preferLlm: body?.prefer_llm ?? body?.preferLlm,
        });
        sendJson({ success: true, ...outcome });
        return;
      }

      if (req.method === 'POST' && pathname === '/citation/relocate') {
        const body = await readBody();
        const result = await chassis.relocateCitation({
          url: body?.url,
          fingerprint: body?.fingerprint,
          threshold: body?.threshold,
        });
        sendJson({ success: true, ...result });
        return;
      }

      if (req.method === 'POST' && pathname === '/citation/revalidate') {
        const body = await readBody();
        const result = await chassis.revalidateStored({
          url: body?.url,
          maxUrls: body?.max_urls ?? body?.maxUrls,
        });
        sendJson({ success: true, ...result });
        return;
      }

      if (req.method === 'POST' && pathname === '/collect') {
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
        sendJson({ success: true, ...data });
        return;
      }

      if (req.method === 'POST' && pathname === '/focus_walk') {
        const body = await readBody();
        const result = await chassis.focusWalk({
          selector: body?.selector,
          x: body?.x !== undefined ? Number(body.x) : undefined,
          y: body?.y !== undefined ? Number(body.y) : undefined,
          direction: body?.direction === 'backward' ? 'backward' : 'forward',
          maxSteps: body?.max_steps !== undefined ? Number(body.max_steps) : undefined,
          restore: body?.restore !== false,
        });
        sendJson({ success: true, ...result });
        return;
      }

      if (req.method === 'POST' && pathname === '/find') {
        const body = await readBody();
        const data = await chassis.getPrimitives().find({
          role: body?.role,
          name: body?.name,
          contains: body?.contains ?? body?.text,
          regex: body?.regex,
          flags: body?.flags,
          tag: body?.tag,
          selector: body?.selector,
          limit: body?.limit !== undefined ? Number(body.limit) : undefined,
          includeOffscreen: body?.include_offscreen === undefined ? true : body.include_offscreen === true,
          sealed: body?.sealed === true,
          includeFrames: body?.include_frames === true,
          refresh: body?.refresh === true,
        });
        sendJson({ success: true, ...data });
        return;
      }

      if (req.method === 'POST' && pathname === '/act') {
        const body = await readBody();
        const rawId = body?.mark_id ?? body?.markId ?? body?.mark ?? body?.id ?? body?.badge;
        const selector = body?.selector || body?.element || body?.target || body?.css;
        const targetText =
          body?.target_text !== undefined ? String(body.target_text) : body?.targetText !== undefined ? String(body.targetText) : undefined;
        const x = body?.x !== undefined ? Number(body.x) : undefined;
        const y = body?.y !== undefined ? Number(body.y) : undefined;
        const result = await chassis.getPrimitives().act({
          markId: rawId !== undefined && rawId !== null ? Number(rawId) : undefined,
          selector,
          targetText,
          targetExact: body?.target_exact === true || body?.targetExact === true,
          sealedToken: body?.sealed_token !== undefined ? String(body.sealed_token) : body?.sealedToken !== undefined ? String(body.sealedToken) : undefined,
          x,
          y,
          action: body?.action || 'click',
          text: body?.text !== undefined ? String(body.text) : undefined,
          secret: body?.secret === true,
          clearFirst: body?.clear_first === true || body?.clearFirst === true,
          await: Array.isArray(body?.await) ? body.await : Array.isArray(body?.await_conditions) ? body.await_conditions : undefined,
          timeoutMs: body?.timeout_ms ?? body?.timeoutMs,
          dryRun: body?.dry_run === true || body?.dryRun === true,
          includeOffscreen: body?.include_offscreen === undefined ? true : body.include_offscreen === true,
        });
        sendJson({ success: true, ...result });
        return;
      }

      if (req.method === 'POST' && pathname === '/network/har') {
        const body = await readBody();
        const har = chassis.getPrimitives().exportHar({
          limit: body?.limit !== undefined ? Number(body.limit) : undefined,
          pattern: body?.pattern,
        });
        if (body?.save) {
          const dir = dataPath('har');
          if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
          const file = path.join(dir, `har_${Date.now()}.har`);
          fs.writeFileSync(file, JSON.stringify(har, null, 2));
          sendJson({ success: true, entries: har.log.entries.length, filePath: file });
          return;
        }
        sendJson({ success: true, entries: har.log.entries.length, har });
        return;
      }

      // Named contexts (cookie/storage profiles) — thin aliases over the session vault.
      if (req.method === 'POST' && pathname === '/context/save') {
        const body = await readBody();
        const result = await chassis.saveSession(body?.name);
        sendJson({ success: true, result });
        return;
      }

      if (req.method === 'POST' && pathname === '/context/open') {
        const body = await readBody();
        if (!body?.name) {
          sendJson({ success: false, error: 'Provide { name }', code: 'BAD_REQUEST' }, 400);
          return;
        }
        const result = await chassis.restoreSession(body.name);
        sendJson({ success: true, result });
        return;
      }

      if (req.method === 'GET' && pathname === '/context/list') {
        sendJson({ success: true, contexts: chassis.listSessions() });
        return;
      }

      if (req.method === 'POST' && pathname === '/context/delete') {
        const body = await readBody();
        const deleted = chassis.deleteSession(body?.name);
        sendJson({ success: true, deleted });
        return;
      }

      // ---- Hypagon REST ------------------------------------------------------------------
      if (
        await handleWrapRoutes({
          wrap,
          method: req.method,
          pathname,
          url,
          headers: req.headers,
          readBody,
          sendJson,
        })
      )
        return;

      sendJson({ error: 'Endpoint not found' }, 404);
    } catch (err: any) {
      const code = err?.code || 'INTERNAL';
      if (code === 'JEV_REQUIRED') {
        const detail = err?.detail && typeof err.detail === 'object' ? err.detail : {};
        sendJson({ success: false, error: err?.message || 'Unscoped page reads are disabled while JEV enforce is on.', code, ...detail }, 409);
        return;
      }
      if (code === 'SEALED_RATE_LIMITED') {
        sendJson(
          {
            success: false,
            error: err?.message || 'Sealed discovery is rate-limited.',
            code,
            retry_after: Math.max(1, Math.ceil(Number(err?.retryAfterMs || 0) / 1000)),
          },
          429
        );
        return;
      }
      const client = ['BAD_REQUEST', 'STALE_REF', 'NO_TARGET', 'NOT_SUPPORTED', 'TIMEOUT', 'NO_LLM_SURFACE', 'FETCH_BLOCKED',
        'SHADOW_WALK_DISABLED', 'SEALED_DISABLED', 'TAB_WALK_DISABLED', 'FRAMES_DISABLED', 'DEEP_OPEN_ROOTS_DISABLED'].includes(code)
        || code.startsWith('NAVIGATION_');
      sendJson({ success: false, error: err?.message || String(err), code }, client ? 400 : 500);
    }
  });

  server.on('error', (err: any) => {
    const inUse = err?.code === 'EADDRINUSE';
    const message = inUse
      ? `Port ${port} is already in use — another Cyberdeck (dev or installed) is probably running. ` +
        'Only one bridge can own a port: close the other instance, or start this one with ' +
        'HB_BRIDGE_PORT=<other port> and point the MCP server at it with HB_BRIDGE_URL.'
      : `HTTP Bridge server error on port ${port}: ${err?.message || err}`;
    logBridge(message, true);
    chassis.addLog('warn', message);
  });

  server.listen(port, '127.0.0.1', () => {
    logBridge(`\n======================================================\n 🚀 HYPAGON GATEWAY // CYBERDECK HTTP BRIDGE\n Active at: http://127.0.0.1:${port}\n Live directive logging enabled.\n======================================================\n`);
    chassis.addLog('info', `Autonomous Bridge active at http://127.0.0.1:${port}`);
  });

  return server;
}
