/**
 * The `app:connect-info` payload.
 *
 * Why a module: the main process produces it, the preload types it and the
 * Settings → MCP Clients panel reads it. It used to be declared in the preload
 * and again, field for field, in the renderer — so a new field could be added to
 * one copy and silently dropped by the other.
 */

/** When to use: any code that types the `app:connect-info` response. */
export interface ConnectInfo {
  platform: string;
  version: string;
  bridgeUrl: string;
  bridgePort: number;
  serverPath: string;
  serverExists: boolean;
  wrapServerPath: string;
  wrapServerExists: boolean;
  devlogsServerPath: string;
  devlogsServerExists: boolean;
  devlogsDir: string;
  devMode: boolean;
  wrapTokenFile: string;
  runtimePath: string;
  packaged: boolean;
  homedir: string;
}
