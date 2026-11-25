/** When to use: the Remote settings panel — whether cloudflared exists, and how it updates. */
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

/** When to use: the Remote panel and `remote_status` — the tunnel state, hostname and error. */
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

/** When to use: `remote_status` and Settings — the gateway plus both cloudflared and tunnel halves. */
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

/** When to use: the connect-info read — everything a client needs to point at this app. */
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
