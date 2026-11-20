/**
 * Remote-access IPC: the Settings panel's enable/token/tunnel/auth controls.
 *
 * Every handler answers the same `{ ok, status?, error? }` shape and refuses politely until
 * the service exists (the bridge starts after the window loads). One helper owns that refusal
 * and the try/catch, so each channel is a single call.
 */
import { ipcMain } from 'electron';
import type { RemoteService } from '../remote/service.js';
import { state } from './state.js';

function remoteFailure(message: string) {
  return { ok: false, error: message };
}

/** When to use: every `remote:*` action except `info` — one refusal/error contract. */
async function withRemote(run: (service: RemoteService) => Promise<unknown> | unknown) {
  if (!state.remote) return remoteFailure('Remote access is not ready yet.');
  try {
    return { ok: true, status: await run(state.remote) };
  } catch (err: any) {
    return remoteFailure(err?.message || String(err));
  }
}

/** When to use: once at boot — registers every `remote:*` channel. */
export function registerRemoteIpc(): void {
  ipcMain.handle('remote:info', async () => {
    if (!state.remote) return remoteFailure('Remote access is not ready yet.');
    try {
      return { ok: true, ...state.remote.getInfo() };
    } catch (err: any) {
      return remoteFailure(err?.message || String(err));
    }
  });

  ipcMain.handle('remote:set-enabled', (_event, enabled: boolean) =>
    withRemote((service) => service.setEnabled(Boolean(enabled))),
  );
  ipcMain.handle('remote:rotate-token', () => withRemote((service) => service.rotateToken()));
  ipcMain.handle('remote:disconnect-sessions', () => withRemote((service) => service.disconnectSessions()));
  ipcMain.handle('remote:set-tunnel-enabled', (_event, enabled: boolean) =>
    withRemote((service) => service.setTunnelEnabled(Boolean(enabled))),
  );
  ipcMain.handle('remote:set-tunnel-config', (_event, hostname: string, token?: string) =>
    withRemote((service) => service.setTunnelConfig(String(hostname || ''), token ? String(token) : undefined)),
  );
  ipcMain.handle('remote:set-cloudflared-mode', (_event, mode: 'manual' | 'automatic') =>
    withRemote((service) => service.setCloudflaredUpdateMode(mode)),
  );
  ipcMain.handle('remote:check-cloudflared', () => withRemote((service) => service.checkCloudflared()));
  ipcMain.handle('remote:install-cloudflared', () => withRemote((service) => service.installCloudflared()));
  ipcMain.handle('remote:set-auth-mode', (_event, mode: 'bearer' | 'oauth') =>
    withRemote((service) => service.setAuthMode(mode)),
  );
  ipcMain.handle('remote:rotate-oauth-client', () => withRemote((service) => service.rotateOAuthClient()));
}
