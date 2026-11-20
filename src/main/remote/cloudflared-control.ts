/**
 * Installed `cloudflared`: where it is, how fresh it is, and what the panel should say.
 *
 * Both an app-managed copy and a system binary are valid; the managed one is only
 * reported as managed when it is the path actually found, so "INSTALL / UPDATE" is never
 * a no-op that claims success. Checks are remembered until an install or a new check.
 *
 * When to use: `RemoteService` — it decides when to check, install or restart the tunnel;
 * this owns the manager, the last check and the last error.
 */
import { findCloudflared } from './cloudflared.ts';
import { CloudflaredManager } from '../../../packages/cloudflared/src/index.ts';
import type { CloudflaredCheck, CloudflaredUpdateMode } from '../../../packages/cloudflared/src/index.ts';
import type { RemoteCloudflaredStatus } from '../../shared/remote.js';

/** When to use: constructing the control from the app's data dir and an optional path. */
export interface CloudflaredControlOptions {
  readonly dataDir: string;
  /** `HB_CLOUDFLARED_PATH` or an app option: an explicitly chosen binary. */
  readonly configuredPath?: string;
}

/** When to use: `RemoteService` — check, install and describe the cloudflared binary. */
export class CloudflaredControl {
  private readonly options: CloudflaredControlOptions;
  private readonly manager: CloudflaredManager;
  private lastCheck: CloudflaredCheck | undefined;
  private lastError: string | undefined;

  constructor(options: CloudflaredControlOptions) {
    this.options = options;
    this.manager = new CloudflaredManager({ dataDir: options.dataDir });
  }

  /** The managed install path (the version the app ships/downloads). */
  managedPath(): string {
    return this.manager.managedPath();
  }

  /** The binary actually resolved: configured path, then managed install, then system. */
  localPath(): string | undefined {
    return findCloudflared(this.options.configuredPath, this.managedPath());
  }

  /** The installed version record, or undefined when no binary is present. */
  installed(): ReturnType<CloudflaredManager['installed']> {
    return this.manager.installed();
  }

  /** When to use: the CHECK button — records the check and rethrows on failure. */
  async check(): Promise<void> {
    try {
      this.lastCheck = await this.manager.checkForUpdate();
      this.lastError = undefined;
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : String(error);
      throw error;
    }
  }

  /** When to use: the INSTALL / UPDATE button — records the error and rethrows. */
  async install(): Promise<void> {
    try {
      await this.manager.installLatest();
      this.lastCheck = undefined;
      this.lastError = undefined;
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : String(error);
      throw error;
    }
  }

  /**
   * When to use: automatic mode at startup — true when an update should be installed.
   *
   * A failed check is recorded and reported as "nothing to do", because a background
   * update must never block the app from starting.
   */
  async autoCheck(updateMode: CloudflaredUpdateMode): Promise<boolean> {
    if (updateMode !== 'automatic') return false;
    if (!this.installed()) return false;
    try {
      const check = await this.manager.checkForUpdate();
      this.lastCheck = check;
      return check.updateAvailable;
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : String(error);
      return false;
    }
  }

  /** When to use: the `cloudflared` section of Remote status. */
  describe(updateMode: CloudflaredUpdateMode): RemoteCloudflaredStatus {
    const installed = this.installed();
    const path = this.localPath();
    const managed = Boolean(installed && path === this.managedPath());
    return {
      available: Boolean(path),
      managed,
      source: managed ? 'managed' : path ? 'system' : 'none',
      ...(installed?.version ? { version: installed.version } : {}),
      ...(path ? { path } : {}),
      updateMode,
      ...(this.lastCheck?.latest.version ? { latestVersion: this.lastCheck.latest.version } : {}),
      ...(this.lastCheck ? { updateAvailable: this.lastCheck.updateAvailable } : {}),
      ...(this.lastError ? { error: this.lastError } : {}),
    };
  }
}
