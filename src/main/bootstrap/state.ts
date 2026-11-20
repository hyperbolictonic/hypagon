/**
 * The mutable objects the bootstrap creates and the IPC modules read.
 *
 * Electron registers IPC handlers before the window exists, so the services they talk to are
 * assigned later. One shared state object keeps that hand-off explicit instead of scattering
 * module-level `let`s through the entry point.
 */
import type { BrowserWindow } from 'electron';
import type { ResearchSettingsStore } from '../research/settings.js';
import type { ZoomSettingsStore } from '../zoom/settings.js';
import type { WrapStore } from '../wrap/store.js';
import type { SecretStore } from '../wrap/secrets.js';
import type { WrapAuditLog } from '../wrap/audit.js';
import type { RemoteService } from '../remote/service.js';
import type { CollaborationService } from '../collaboration/service.js';
import type { MediaService } from '../media/service.js';

/** When to use: any bootstrap phase that needs a window or a service. */
export interface BootstrapState {
  mainWindow: BrowserWindow | null;
  research: ResearchSettingsStore | null;
  zoom: ZoomSettingsStore | null;
  wrapStore: WrapStore | null;
  wrapSecrets: SecretStore | null;
  wrapAudit: WrapAuditLog | null;
  remote: RemoteService | null;
  collaboration: CollaborationService | null;
  media: MediaService | null;
}

/** When to use: imported by the IPC modules and the window/service phases. */
export const state: BootstrapState = {
  mainWindow: null,
  research: null,
  zoom: null,
  wrapStore: null,
  wrapSecrets: null,
  wrapAudit: null,
  remote: null,
  collaboration: null,
  media: null,
};
