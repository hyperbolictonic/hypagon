/** When to use: rendering or reading the bundled cloudflared state. */
export interface RemoteCloudflaredStatus {
  available: boolean;
  managed: boolean;
  source: 'managed' | 'system' | 'none';
  version?: string;
  path?: string;
  updateMode: 'manual' | 'automatic';
  latestVersion?: string;
  updateAvailable?: boolean;
  error?: string;
}

/** When to use: reporting the tunnel URL/state on the remote panel and health. */
export interface RemoteTunnelStatus {
  enabled: boolean;
  running: boolean;
  state: 'stopped' | 'starting' | 'running' | 'error';
  available: boolean;
  binaryPath?: string;
  hostname?: string;
  tokenConfigured: boolean;
  url?: string;
  error?: string;
}

/** When to use: showing the remote gateway aggregate status (enabled, tunnel, clients). */
export interface RemoteStatus {
  enabled: boolean;
  running: boolean;
  port: number;
  localUrl: string;
  url: string;
  tokenFile: string;
  authMode: 'bearer' | 'oauth';
  tunnel: RemoteTunnelStatus;
  cloudflared: RemoteCloudflaredStatus;
  error?: string;
}

/** When to use: returning remote connection details (URL, token, tunnel) to the deck. */
export interface RemoteInfo {
  status: RemoteStatus;
  token: string;
  config: string;
  tunnelHostname: string;
  tunnelTokenConfigured: boolean;
  oauthClient?: {
    clientId: string;
    clientSecret: string;
    createdAt: string;
  };
}
