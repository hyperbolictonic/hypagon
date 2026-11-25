/**
 * The `remote:*` IPC surface.
 *
 * Why a module: eleven handlers repeated the same skeleton — guard the
 * not-yet-initialised service, run the call, wrap the result as
 * `{ ok: true, ...payload }` or `{ ok: false, error }`. One `invoke` owns that
 * shape, so a change to the error text or the guard message lands once.
 */
import { ipcMain } from 'electron';
import type { RemoteService } from './service.js';

type RemoteResult = ({ ok: true } & Record<string, unknown>) | { ok: false; error: string };

const NOT_READY: RemoteResult = { ok: false, error: 'Remote access is not ready yet.' };

/**
 * When to use: a `remote:*` handler body — run the action against a live
 * service, or report not-ready / the thrown error in the standard shape.
 */
async function invoke<T extends Record<string, unknown>>(
  service: RemoteService | null,
  action: (service: RemoteService) => Promise<T>,
): Promise<RemoteResult> {
  if (!service) return NOT_READY;
  try {
    return { ok: true, ...(await action(service)) };
  } catch (error: any) {
    return { ok: false, error: error?.message || String(error) };
  }
}

/**
 * When to use: main-process startup — register every `remote:*` channel. The
 * service arrives through a getter because it is created (and may be recreated)
 * after the window bootstrap.
 */
export function registerRemoteIpc(getService: () => RemoteService | null): void {
  ipcMain.handle('remote:info', () =>
    invoke(getService(), async (service) => ({ ...service.getInfo() })),
  );

  ipcMain.handle('remote:set-enabled', (_event, enabled: boolean) =>
    invoke(getService(), async (service) => ({ status: await service.access.setEnabled(Boolean(enabled)) })),
  );

  ipcMain.handle('remote:rotate-token', () =>
    invoke(getService(), async (service) => ({ status: await service.access.rotateToken() })),
  );

  ipcMain.handle('remote:disconnect-sessions', () =>
    invoke(getService(), async (service) => ({ status: await service.access.disconnectSessions() })),
  );

  ipcMain.handle('remote:set-tunnel-enabled', (_event, enabled: boolean) =>
    invoke(getService(), async (service) => ({ status: await service.tunnel.setEnabled(Boolean(enabled)) })),
  );

  ipcMain.handle('remote:set-tunnel-config', (_event, hostname: string, token?: string) =>
    invoke(getService(), async (service) => {
      await service.tunnel.configure(String(hostname || ''), token ? String(token) : undefined);
      return { status: service.status() };
    }),
  );

  ipcMain.handle('remote:set-cloudflared-mode', (_event, mode: 'manual' | 'automatic') =>
    invoke(getService(), async (service) => {
      service.cloudflared.setUpdateMode(mode);
      return { status: service.status() };
    }),
  );

  ipcMain.handle('remote:check-cloudflared', () =>
    invoke(getService(), async (service) => {
      await service.cloudflared.check();
      return { status: service.status() };
    }),
  );

  ipcMain.handle('remote:install-cloudflared', () =>
    invoke(getService(), async (service) => {
      await service.cloudflared.install();
      return { status: service.status() };
    }),
  );

  ipcMain.handle('remote:set-auth-mode', (_event, mode: 'bearer' | 'oauth') =>
    invoke(getService(), async (service) => ({ status: await service.access.setAuthMode(mode) })),
  );

  ipcMain.handle('remote:rotate-oauth-client', () =>
    invoke(getService(), async (service) => ({ status: await service.access.rotateOAuthClient() })),
  );
}
