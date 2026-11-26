/**
 * The cloudflared binary: where it is, whether it is current, and installing it.
 *
 * Why a module: locating the binary (managed copy before a system one), the
 * update mode, the last check and the last install error are one concern, and
 * the service should not carry a `CloudflaredManager` field plus four flags to
 * answer "is the tunnel available".
 *
 * Installing replaces the binary under a live tunnel, so the panel asks the
 * service to pause and resume the tunnel around it rather than reaching into it.
 */
import { findCloudflared } from './cloudflared.ts';
import { CloudflaredManager } from '../../../packages/cloudflared/src/index.ts';
import type { CloudflaredCheck, CloudflaredUpdateMode } from '../../../packages/cloudflared/src/index.ts';
import type { RemoteCloudflaredStatus } from '../../shared/remote.js';

/** When to use: the service constructor — the data dir and the tunnel hooks. */
export interface CloudflaredPanelDeps {
  dataDir: string;
  /** An explicit binary from the environment or settings. */
  cloudflaredPath?: string;
  /** The persisted update mode. */
  updateMode: CloudflaredUpdateMode;
  /** Persist the update mode (the service owns the settings file). */
  onChanged: () => void;
  /** Whether a tunnel is live, so an install can pause it. */
  tunnelEnabled: () => boolean;
  pauseTunnel: () => Promise<void>;
  resumeTunnel: () => Promise<void>;
}

/** When to use: `RemoteService` — one panel per service. */
export class CloudflaredPanel {
  private readonly manager: CloudflaredManager;
  private mode: CloudflaredUpdateMode;
  private lastCheck: CloudflaredCheck | undefined;
  private error: string | undefined;
  private readonly deps: CloudflaredPanelDeps;

  constructor(deps: CloudflaredPanelDeps) {
    this.deps = deps;
    this.manager = new CloudflaredManager({ dataDir: deps.dataDir });
    this.mode = deps.updateMode;
  }

  updateMode(): CloudflaredUpdateMode {
    return this.mode;
  }

  setUpdateMode(mode: CloudflaredUpdateMode): void {
    this.mode = mode === 'automatic' ? 'automatic' : 'manual';
    this.deps.onChanged();
  }

  /** Refresh the release check; a failure is recorded and rethrown. */
  async check(): Promise<void> {
    try {
      this.lastCheck = await this.manager.checkForUpdate();
      this.error = undefined;
    } catch (error) {
      this.error = error instanceof Error ? error.message : String(error);
      throw error;
    }
  }

  /** Install the latest binary, pausing a live tunnel for the swap. */
  async install(): Promise<void> {
    const wasTunnelEnabled = this.deps.tunnelEnabled();
    if (wasTunnelEnabled) await this.deps.pauseTunnel();
    try {
      await this.manager.installLatest();
      this.lastCheck = undefined;
      this.error = undefined;
      if (wasTunnelEnabled) await this.deps.resumeTunnel();
    } catch (error) {
      this.error = error instanceof Error ? error.message : String(error);
      throw error;
    }
  }

  /** The launch-time hook: check and install, but only in automatic mode. */
  async maybeAutoUpdate(): Promise<void> {
    if (this.mode !== 'automatic') return;
    if (!this.manager.installed()) return;
    try {
      const check = await this.manager.checkForUpdate();
      this.lastCheck = check;
      if (check.updateAvailable) await this.install();
    } catch (error) {
      this.error = error instanceof Error ? error.message : String(error);
    }
  }

  status(): RemoteCloudflaredStatus {
    const installed = this.manager.installed();
    const binaryPath = this.binaryPath();
    const managed = Boolean(installed && binaryPath === this.manager.managedPath());
    return {
      available: Boolean(binaryPath),
      managed,
      source: managed ? 'managed' : binaryPath ? 'system' : 'none',
      ...(installed?.version ? { version: installed.version } : {}),
      ...(binaryPath ? { path: binaryPath } : {}),
      updateMode: this.mode,
      ...(this.lastCheck?.latest.version ? { latestVersion: this.lastCheck.latest.version } : {}),
      ...(this.lastCheck ? { updateAvailable: this.lastCheck.updateAvailable } : {}),
      ...(this.error ? { error: this.error } : {}),
    };
  }

  /** The binary to run: an explicit one, else the managed copy, else a system one. */
  binaryPath(): string | undefined {
    return findCloudflared(this.deps.cloudflaredPath, this.manager.managedPath());
  }
}
