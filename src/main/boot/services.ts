/**
 * The services the first window starts: research settings, the Hypagon REST
 * wrap store, collaboration, media and the remote tunnel.
 *
 * Why a module: the entry point used to build them inside `createWindow`'s
 * try/catch, so a twelve-field literal and the deck wiring sat next to the
 * window options. This class owns that state, exposes it to the IPC modules and
 * keeps the startup order explicit.
 */
import { app } from 'electron';
import path from 'node:path';
import type { BrowserChassis } from '../browser-chassis.js';
import type { ExperimentalSettingsStore } from '../settings/experimental.js';
import { startHttpBridge } from '../http-bridge.js';
import { createWrapExecutor } from '../wrap/factory.js';
import { WrapStore } from '../wrap/store.js';
import { SecretStore } from '../wrap/secrets.js';
import type { SecretCipher } from '../wrap/secrets.js';
import { WrapAuditLog } from '../wrap/audit.js';
import { createCapabilityToken } from '../security/capability-token.js';
import { ResearchSettingsStore } from '../research/settings.js';
import { RemoteService } from '../remote/service.js';
import { ToolSettingsStore } from '../tools/settings.js';
import { registerToolSettingsIpc } from '../tools/ipc.js';
import { CollaborationStore } from '../collaboration/store.js';
import { CollaborationService } from '../collaboration/service.js';
import { MediaService } from '../media/service.js';

/** When to use: constructing the boot — every path and store comes from the entry point. */
export interface ServicesDeps {
  chassis: BrowserChassis;
  bridgePort: number;
  remotePort: number;
  wrapDir: () => string;
  remoteDir: () => string;
  remoteServerPath: () => string;
  secretCipher: () => SecretCipher;
  experimental: () => ExperimentalSettingsStore;
  jevPolicy: () => { available: boolean; enforce: boolean };
}

/** The long-lived services the renderer IPC modules read through getters. */
export class AppServices {
  research: ResearchSettingsStore | null = null;
  wrapStore: WrapStore | null = null;
  wrapSecrets: SecretStore | null = null;
  wrapAudit: WrapAuditLog | null = null;
  collaboration: CollaborationService | null = null;
  media: MediaService | null = null;
  remote: RemoteService | null = null;

  constructor(private readonly deps: ServicesDeps) {}

  /**
   * When to use: the first window is visible. Loads research settings, starts
   * the HTTP bridge and the tunnel. A throw is the caller's warning to log, not
   * a startup failure.
   */
  async start(): Promise<void> {
    this.research = new ResearchSettingsStore(path.join(app.getPath('userData'), 'research-settings.json'));
    await this.deps.chassis.research.setSettings(this.research.load());

    const toolSettings = this.createWrapAndCollaboration();
    startHttpBridge(
      this.deps.chassis,
      this.deps.bridgePort,
      {
        store: this.wrapStore!,
        executor: this.wrapExecutor!,
        secrets: this.wrapSecrets!,
        audit: this.wrapAudit!,
        token: this.wrapToken!,
      },
      toolSettings,
      this.collaboration!,
      this.media!,
    );

    this.ensureRemote();
  }

  /** When to use: app quit — stop the media updater; the tunnel has its own quit sequence. */
  shutdown(): void {
    this.media?.shutdown();
  }

  private wrapExecutor: ReturnType<typeof createWrapExecutor> | null = null;
  private wrapToken: string | null = null;

  /** The wrap store/secrets/audit plus collaboration, media and the deck's collab wiring. */
  private createWrapAndCollaboration(): ToolSettingsStore {
    const chassis = this.deps.chassis;
    const wrapDir = this.deps.wrapDir();

    this.wrapStore = new WrapStore(wrapDir);
    this.wrapSecrets = new SecretStore(wrapDir, this.deps.secretCipher());
    this.wrapAudit = new WrapAuditLog(path.join(wrapDir, 'audit.jsonl'));
    this.wrapExecutor = createWrapExecutor(
      this.wrapStore,
      {
        secrets: this.wrapSecrets,
        audit: this.wrapAudit,
        // Opt-in per recipe (`response.index: "cortex"`). Chunks land in the same
        // page_history table as browsed pages, so `recall_memory` finds them.
        indexDocuments: async (documents: any[], context: { url: string }) => {
          const cortex = chassis.cortex;
          let chunks = 0;
          for (const document of documents) {
            chunks += await cortex.history.indexPage(context.url, document.title, document.markdown);
          }
          return chunks;
        },
      },
      this.wrapSecrets,
    );
    this.wrapToken = createCapabilityToken(wrapDir);

    const toolSettings = new ToolSettingsStore(path.join(app.getPath('userData'), 'tool-settings.json'));
    registerToolSettingsIpc(toolSettings);

    const collaboration = new CollaborationService(
      new CollaborationStore(path.join(app.getPath('userData'), 'collaboration.json')),
      chassis,
      () => chassis.bus.broadcast('collaboration:updated'),
      () => this.deps.experimental().get().collab,
    );
    this.collaboration = collaboration;

    const media = new MediaService({
      notify: ({ title, message }) => chassis.hil.notify(title, message, 'normal', false),
    });
    this.media = media;
    media.startUpdater();

    chassis.deck.collab.setEnabledProvider(() => this.deps.experimental().get().collab);
    chassis.jev.setPolicyProvider(() => this.deps.jevPolicy());
    // The deck toolbar's list + note cycling read exactly what the page overlay shows.
    chassis.deck.collab.setThreadsProvider((filter) => collaboration.list(filter));
    chassis.deck.collab.setOverlayRefresher(() => collaboration.refreshOverlay());
    chassis.deck.collab.setResolver((id) => collaboration.resolve(id, 'Resolved from the collab note list.'));
    chassis.deck.collab.setClassListener((target, added, removed) => {
      try {
        this.collaboration?.recordClassEdit(target, added, removed);
      } catch {
        // Class-edit bookkeeping is best-effort; the page already applied it.
      }
    });
    chassis.collaboration.setNoteHandler((note) => {
      try {
        this.collaboration?.create({
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

    return toolSettings;
  }

  /** Start the remote tunnel once; a second window reuses the running service. */
  private ensureRemote(): void {
    if (this.remote) return;
    this.remote = new RemoteService({
      serverPath: this.deps.remoteServerPath(),
      bridgeUrl: `http://127.0.0.1:${this.deps.bridgePort}`,
      port: this.deps.remotePort,
      dataDir: this.deps.remoteDir(),
      cwd: app.getPath('userData'),
      cloudflaredPath: process.env.HB_CLOUDFLARED_PATH,
    });
    this.remote.ensureToken();
    void this.remote.maybeAutoUpdateCloudflared();
  }
}
