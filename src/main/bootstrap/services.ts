/**
 * The services the shell starts after the window loads: settings, wrap, tools, collaboration,
 * media, the HTTP bridge and remote access.
 *
 * A failure here is logged and the window stays usable (the bridge is optional), which is why
 * the whole block is one try/catch.
 */
import { app } from 'electron';
import path from 'node:path';
import type { BrowserChassis } from '../browser-chassis.js';
import { startHttpBridge } from '../http-bridge.js';
import { createWrapExecutor } from '../wrap/factory.js';
import { WrapStore } from '../wrap/store.js';
import { createWrapToken } from '../wrap/token.js';
import { SecretStore } from '../wrap/secrets.js';
import { WrapAuditLog } from '../wrap/audit.js';
import { ResearchSettingsStore } from '../research/settings.js';
import { RemoteService } from '../remote/service.js';
import { ToolSettingsStore } from '../tools/settings.js';
import { registerToolSettingsIpc } from '../tools/ipc.js';
import { CollaborationStore } from '../collaboration/store.js';
import { CollaborationService } from '../collaboration/service.js';
import { MediaService } from '../media/service.js';
import { state } from './state.js';
import { createSecretCipher, ensureRemoteServerPath, remoteDir, wrapDir } from './paths.js';
import { experimentalSettings, jevPolicy } from './ipc-settings.js';

/** When to use: once, right after the shell is shown. */
export async function startServices(chassis: BrowserChassis, bridgePort: number, remotePort: number): Promise<void> {
  // Start Autonomous HTTP Bridge
  try {
    state.research = new ResearchSettingsStore(path.join(app.getPath('userData'), 'research-settings.json'));
    await chassis.setResearchSettings(state.research.load());

    const wrapStore = new WrapStore(wrapDir());
    state.wrapStore = wrapStore;
    const wrapSecrets = new SecretStore(wrapDir(), createSecretCipher());
    const wrapAudit = new WrapAuditLog(path.join(wrapDir(), 'audit.jsonl'));
    state.wrapSecrets = wrapSecrets;
    state.wrapAudit = wrapAudit;
    const wrapExecutor = createWrapExecutor(
      wrapStore,
      {
        secrets: wrapSecrets,
        audit: wrapAudit,
        // Opt-in per recipe (`response.index: "cortex"`). Chunks land in the same
        // page_history table as browsed pages, so `recall_memory` finds them.
        indexDocuments: async (documents, context) => {
          const cortex = chassis.getCortex();
          let chunks = 0;
          for (const document of documents) {
            chunks += await cortex.indexPage(context.url, document.title, document.markdown);
          }
          return chunks;
        },
      },
      wrapSecrets,
    );
    const wrapToken = createWrapToken(wrapDir());
    const toolSettings = new ToolSettingsStore(path.join(app.getPath('userData'), 'tool-settings.json'));
    registerToolSettingsIpc(toolSettings);
    const collaboration = new CollaborationService(
      new CollaborationStore(path.join(app.getPath('userData'), 'collaboration.json')),
      chassis,
      () => chassis.broadcast('collaboration:updated'),
      () => experimentalSettings().get().collab,
    );
    state.collaboration = collaboration;
    const media = new MediaService({
      notify: ({ title, message }) => chassis.sendNotification(title, message, 'normal', false),
    });
    state.media = media;
    media.startUpdater();
    chassis.setCollabEnabledProvider(() => experimentalSettings().get().collab);
    chassis.jevSurface.setJevPolicyProvider(() => jevPolicy());
    // The deck toolbar's list + note cycling read exactly what the page overlay shows.
    chassis.setCollaborationThreadsProvider((filter) => collaboration.list(filter));
    chassis.setCollaborationOverlayRefresher(() => collaboration.refreshOverlay());
    chassis.setCollaborationResolver((id) => collaboration.resolve(id, 'Resolved from the collab note list.'));
    chassis.setCollaborationClassListener((target, added, removed) => {
      try {
        state.collaboration?.recordClassEdit(target, added, removed);
      } catch {
        // Class-edit bookkeeping is best-effort; the page already applied it.
      }
    });
    chassis.setOnCollaborationNote((note) => {
      try {
        state.collaboration?.create({
          target: note.target,
          text: note.text,
          tags: note.tags,
          kind: 'comment',
          author: 'human',
        });
      } catch {
        // The page drawer is best-effort; the persisted thread is authoritative.
      }
    });
    startHttpBridge(
      chassis,
      bridgePort,
      {
        store: wrapStore,
        executor: wrapExecutor,
        secrets: wrapSecrets,
        audit: wrapAudit,
        token: wrapToken,
      },
      toolSettings,
      collaboration,
      media
    );

    if (!state.remote) {
      state.remote = new RemoteService({
        serverPath: ensureRemoteServerPath(),
        bridgeUrl: `http://127.0.0.1:${bridgePort}`,
        port: remotePort,
        dataDir: remoteDir(),
        cwd: app.getPath('userData'),
        cloudflaredPath: process.env.HB_CLOUDFLARED_PATH,
      });
      state.remote.ensureToken();
      void state.remote.maybeAutoUpdateCloudflared();
    }
  } catch (err: any) {
    chassis.addLog('warn', `HTTP Bridge notice: ${err?.message || err}`);
  }
}
