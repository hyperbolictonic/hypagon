/**
 * The remote-access panel (Settings → Remote Access): status rendering and the panel loader.
 *
 * The element handles and the renderers live here; the action listeners live in
 * `remote-actions.ts` and import `remoteEls` from this module.
 */

/** When to use: the remote panel's remoteEnabledEl control. */
export const remoteEnabledEl = document.getElementById('settings-remote-enabled') as HTMLInputElement | null;
const remoteStatusEl = document.getElementById('settings-remote-status') as HTMLElement | null;
const remoteUrlEl = document.getElementById('settings-remote-url') as HTMLInputElement | null;
/** When to use: the remote panel's remoteTokenEl control. */
export const remoteTokenEl = document.getElementById('settings-remote-token') as HTMLInputElement | null;
const remoteTokenFileEl = document.getElementById('settings-remote-token-file') as HTMLElement | null;
/** When to use: the remote panel's remoteConfigEl control. */
export const remoteConfigEl = document.getElementById('settings-remote-config') as HTMLTextAreaElement | null;
const remoteResultEl = document.getElementById('settings-remote-result') as HTMLElement | null;
/** When to use: the remote panel's remoteCopyTokenEl control. */
export const remoteCopyTokenEl = document.getElementById('settings-remote-copy-token') as HTMLButtonElement | null;
/** When to use: the remote panel's remoteCopyConfigEl control. */
export const remoteCopyConfigEl = document.getElementById('settings-remote-copy-config') as HTMLButtonElement | null;
/** When to use: the remote panel's remoteRefreshEl control. */
export const remoteRefreshEl = document.getElementById('settings-remote-refresh') as HTMLButtonElement | null;
/** When to use: the remote panel's remoteRotateEl control. */
export const remoteRotateEl = document.getElementById('settings-remote-rotate') as HTMLButtonElement | null;
/** When to use: the remote panel's remoteDisconnectEl control. */
export const remoteDisconnectEl = document.getElementById('settings-remote-disconnect') as HTMLButtonElement | null;
/** When to use: the remote panel's remoteTunnelEnabledEl control. */
export const remoteTunnelEnabledEl = document.getElementById('settings-remote-tunnel-enabled') as HTMLInputElement | null;
const remoteTunnelStatusEl = document.getElementById('settings-remote-tunnel-status') as HTMLElement | null;
/** When to use: the remote panel's remoteTunnelHostnameEl control. */
export const remoteTunnelHostnameEl = document.getElementById('settings-remote-tunnel-hostname') as HTMLInputElement | null;
/** When to use: the remote panel's remoteTunnelTokenEl control. */
export const remoteTunnelTokenEl = document.getElementById('settings-remote-tunnel-token') as HTMLInputElement | null;
/** When to use: the remote panel's remoteTunnelSaveEl control. */
export const remoteTunnelSaveEl = document.getElementById('settings-remote-tunnel-save') as HTMLButtonElement | null;
const remoteCloudflaredEl = document.getElementById('settings-remote-cloudflared') as HTMLElement | null;
/** When to use: the remote panel's remoteCloudflaredModeEl control. */
export const remoteCloudflaredModeEl = document.getElementById('settings-remote-cloudflared-mode') as HTMLSelectElement | null;
/** When to use: the remote panel's remoteCloudflaredCheckEl control. */
export const remoteCloudflaredCheckEl = document.getElementById('settings-remote-cloudflared-check') as HTMLButtonElement | null;
/** When to use: the remote panel's remoteCloudflaredInstallEl control. */
export const remoteCloudflaredInstallEl = document.getElementById('settings-remote-cloudflared-install') as HTMLButtonElement | null;
/** When to use: the remote panel's remoteCloudflaredResultEl control. */
export const remoteCloudflaredResultEl = document.getElementById('settings-remote-cloudflared-result') as HTMLElement | null;
/** When to use: the remote panel's remoteAuthModeEl control. */
export const remoteAuthModeEl = document.getElementById('settings-remote-auth-mode') as HTMLSelectElement | null;
const remoteBearerSectionEl = document.getElementById('settings-remote-bearer-section') as HTMLElement | null;
const remoteOAuthSectionEl = document.getElementById('settings-remote-oauth-section') as HTMLElement | null;
/** When to use: the remote panel's remoteOAuthClientIdEl control. */
export const remoteOAuthClientIdEl = document.getElementById('settings-remote-oauth-client-id') as HTMLInputElement | null;
/** When to use: the remote panel's remoteOAuthClientSecretEl control. */
export const remoteOAuthClientSecretEl = document.getElementById('settings-remote-oauth-client-secret') as HTMLInputElement | null;
/** When to use: the remote panel's remoteOAuthConfigEl control. */
export const remoteOAuthConfigEl = document.getElementById('settings-remote-oauth-config') as HTMLTextAreaElement | null;
/** When to use: the remote panel's remoteCopyOAuthIdEl control. */
export const remoteCopyOAuthIdEl = document.getElementById('settings-remote-copy-oauth-id') as HTMLButtonElement | null;
/** When to use: the remote panel's remoteCopyOAuthSecretEl control. */
export const remoteCopyOAuthSecretEl = document.getElementById('settings-remote-copy-oauth-secret') as HTMLButtonElement | null;
/** When to use: the remote panel's remoteCopyOAuthConfigEl control. */
export const remoteCopyOAuthConfigEl = document.getElementById('settings-remote-copy-oauth-config') as HTMLButtonElement | null;
/** When to use: the remote panel's remoteRotateOAuthEl control. */
export const remoteRotateOAuthEl = document.getElementById('settings-remote-rotate-oauth') as HTMLButtonElement | null;

/** When to use: an action's outcome — one line in the panel's result box. */
export function showRemoteResult(kind: 'success' | 'error' | 'info', text: string): void {
  if (!remoteResultEl) return;
  remoteResultEl.className = `alert alert-${kind} alert-sm font-mono text-xs`;
  remoteResultEl.textContent = text;
  remoteResultEl.classList.remove('hidden');
}

/** When to use: the enabled/URL/token/auth summary block. */
export function renderRemoteStatus(status: { enabled: boolean; running: boolean; error?: string } | undefined): void {
  if (!remoteStatusEl) return;
  remoteStatusEl.classList.remove('badge-ghost', 'badge-success', 'badge-warning', 'badge-error');
  if (!status) {
    remoteStatusEl.textContent = 'not ready';
    remoteStatusEl.classList.add('badge-ghost');
    return;
  }
  if (status.running) {
    remoteStatusEl.textContent = 'running';
    remoteStatusEl.classList.add('badge-success');
  } else if (status.enabled) {
    remoteStatusEl.textContent = 'error';
    remoteStatusEl.classList.add('badge-error');
  } else {
    remoteStatusEl.textContent = 'off';
    remoteStatusEl.classList.add('badge-ghost');
  }
}

/** When to use: the tunnel block (hostname, state, error). */
export function renderTunnelStatus(tunnel: { enabled: boolean; running: boolean; state: string; available: boolean; binaryPath?: string; url?: string; error?: string } | undefined): void {
  if (!remoteTunnelStatusEl) return;
  remoteTunnelStatusEl.classList.remove('badge-ghost', 'badge-success', 'badge-warning', 'badge-error');
  if (!tunnel) {
    remoteTunnelStatusEl.textContent = 'unknown';
    remoteTunnelStatusEl.classList.add('badge-ghost');
    return;
  }
  if (tunnel.state === 'running') {
    remoteTunnelStatusEl.textContent = 'running';
    remoteTunnelStatusEl.classList.add('badge-success');
  } else if (tunnel.state === 'starting') {
    remoteTunnelStatusEl.textContent = 'starting';
    remoteTunnelStatusEl.classList.add('badge-warning');
  } else if (tunnel.state === 'error') {
    remoteTunnelStatusEl.textContent = 'error';
    remoteTunnelStatusEl.classList.add('badge-error');
  } else {
    remoteTunnelStatusEl.textContent = 'off';
    remoteTunnelStatusEl.classList.add('badge-ghost');
  }
  if (remoteTunnelEnabledEl) remoteTunnelEnabledEl.checked = tunnel.enabled;
}

/** When to use: the cloudflared binary block (mode, version, install state). */
export function renderCloudflaredStatus(cloudflared: {
  available: boolean;
  managed: boolean;
  source: 'managed' | 'system' | 'none';
  version?: string;
  path?: string;
  updateMode: 'manual' | 'automatic';
  latestVersion?: string;
  updateAvailable?: boolean;
  error?: string;
} | undefined): void {
  if (remoteCloudflaredEl) {
    if (!cloudflared) {
      remoteCloudflaredEl.textContent = 'cloudflared status unavailable';
    } else if (cloudflared.source === 'managed') {
      remoteCloudflaredEl.textContent = `managed cloudflared${cloudflared.version ? ` v${cloudflared.version}` : ''}`;
    } else if (cloudflared.source === 'system') {
      remoteCloudflaredEl.textContent = `system cloudflared: ${cloudflared.path || 'available'}`;
    } else {
      remoteCloudflaredEl.textContent = 'cloudflared not installed';
    }
    remoteCloudflaredEl.className = `label font-mono text-[10px] ${cloudflared?.available ? 'text-base-content/50' : 'text-warning'}`;
  }
  if (remoteCloudflaredModeEl) {
    remoteCloudflaredModeEl.value = cloudflared?.updateMode === 'automatic' ? 'automatic' : 'manual';
  }
  if (remoteCloudflaredInstallEl) {
    remoteCloudflaredInstallEl.textContent = cloudflared?.source === 'managed' ? 'UPDATE' : 'INSTALL';
  }
  if (remoteCloudflaredResultEl) {
    if (cloudflared?.updateAvailable === undefined) {
      remoteCloudflaredResultEl.textContent = '';
    } else {
      remoteCloudflaredResultEl.textContent = cloudflared.updateAvailable
        ? `update available${cloudflared.latestVersion ? `: v${cloudflared.latestVersion}` : ''}`
        : `up to date${cloudflared.latestVersion ? ` (v${cloudflared.latestVersion})` : ''}`;
    }
  }
}

/** When to use: the Settings → Remote tab is opened, and after every action. */
export async function loadRemotePanel(): Promise<void> {
  if (!remoteEnabledEl || !remoteUrlEl || !remoteTokenEl || !remoteConfigEl) return;
  try {
    const result = await window.electronAPI?.getRemoteInfo();
    if (!result?.ok || !result.status) {
      renderRemoteStatus(undefined);
      renderTunnelStatus(undefined);
      renderCloudflaredStatus(undefined);
      showRemoteResult('error', result?.error || 'Remote access is not ready yet.');
      return;
    }
    const status = result.status;
    remoteEnabledEl.checked = status.enabled;
    remoteUrlEl.value = status.url;
    remoteTokenEl.value = result.token || '';
    remoteConfigEl.value = result.config || '';
    if (remoteTokenFileEl) remoteTokenFileEl.textContent = status.tokenFile;
    if (remoteAuthModeEl) remoteAuthModeEl.value = status.authMode;
    if (remoteTunnelHostnameEl) remoteTunnelHostnameEl.value = result.tunnelHostname || '';
    if (remoteTunnelTokenEl) {
      remoteTunnelTokenEl.value = '';
      remoteTunnelTokenEl.placeholder = result.tunnelTokenConfigured ? 'configured — enter a new token to replace' : 'paste the tunnel token';
    }
    const oauthMode = status.authMode === 'oauth';
    if (remoteBearerSectionEl) remoteBearerSectionEl.classList.toggle('hidden', oauthMode);
    if (remoteOAuthSectionEl) remoteOAuthSectionEl.classList.toggle('hidden', !oauthMode);
    if (remoteRotateEl) remoteRotateEl.classList.toggle('hidden', oauthMode);
    if (remoteOAuthClientIdEl) remoteOAuthClientIdEl.value = result.oauthClient?.clientId || '';
    if (remoteOAuthClientSecretEl) remoteOAuthClientSecretEl.value = result.oauthClient?.clientSecret || '';
    if (remoteOAuthConfigEl) {
      remoteOAuthConfigEl.value = result.oauthClient
        ? JSON.stringify(
            {
              mcpServerUrl: status.url,
              clientId: result.oauthClient.clientId,
              clientSecret: result.oauthClient.clientSecret,
            },
            null,
            2,
          )
        : '';
    }
    renderRemoteStatus(status);
    renderTunnelStatus(status.tunnel);
    renderCloudflaredStatus(status.cloudflared);
    if (remoteTunnelEnabledEl) remoteTunnelEnabledEl.disabled = false;
    if (status.error || status.tunnel?.error || status.cloudflared?.error) {
      showRemoteResult('error', (status.error || status.tunnel?.error || status.cloudflared?.error || '').slice(-800));
    }
  } catch (err: any) {
    renderRemoteStatus(undefined);
    renderTunnelStatus(undefined);
    renderCloudflaredStatus(undefined);
    showRemoteResult('error', `Could not read remote status: ${err?.message || err}`);
  }
}
