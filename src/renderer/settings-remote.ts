/**
 * Remote MCP gateway settings (Settings -> Remote).
 *
 * Owns the gateway switch, bearer/OAuth credentials, the named tunnel, the
 * managed cloudflared binary and the generated client config. The panel is
 * static markup; every element is optional so a restricted build can omit it.
 */
import type { ElectronAPI } from '../preload/index.js';
import { showAlert } from './settings-alert';

const api = (window as unknown as { electronAPI?: ElectronAPI }).electronAPI;

const remoteEnabledEl = document.getElementById('settings-remote-enabled') as HTMLInputElement | null;
const remoteStatusEl = document.getElementById('settings-remote-status') as HTMLElement | null;
const remoteUrlEl = document.getElementById('settings-remote-url') as HTMLInputElement | null;
const remoteTokenEl = document.getElementById('settings-remote-token') as HTMLInputElement | null;
const remoteTokenFileEl = document.getElementById('settings-remote-token-file') as HTMLElement | null;
const remoteConfigEl = document.getElementById('settings-remote-config') as HTMLTextAreaElement | null;
const remoteResultEl = document.getElementById('settings-remote-result') as HTMLElement | null;
const remoteCopyTokenEl = document.getElementById('settings-remote-copy-token') as HTMLButtonElement | null;
const remoteCopyConfigEl = document.getElementById('settings-remote-copy-config') as HTMLButtonElement | null;
const remoteRefreshEl = document.getElementById('settings-remote-refresh') as HTMLButtonElement | null;
const remoteRotateEl = document.getElementById('settings-remote-rotate') as HTMLButtonElement | null;
const remoteDisconnectEl = document.getElementById('settings-remote-disconnect') as HTMLButtonElement | null;
const remoteTunnelEnabledEl = document.getElementById('settings-remote-tunnel-enabled') as HTMLInputElement | null;
const remoteTunnelStatusEl = document.getElementById('settings-remote-tunnel-status') as HTMLElement | null;
const remoteTunnelHostnameEl = document.getElementById('settings-remote-tunnel-hostname') as HTMLInputElement | null;
const remoteTunnelTokenEl = document.getElementById('settings-remote-tunnel-token') as HTMLInputElement | null;
const remoteTunnelSaveEl = document.getElementById('settings-remote-tunnel-save') as HTMLButtonElement | null;
const remoteCloudflaredEl = document.getElementById('settings-remote-cloudflared') as HTMLElement | null;
const remoteCloudflaredModeEl = document.getElementById('settings-remote-cloudflared-mode') as HTMLSelectElement | null;
const remoteCloudflaredCheckEl = document.getElementById('settings-remote-cloudflared-check') as HTMLButtonElement | null;
const remoteCloudflaredInstallEl = document.getElementById('settings-remote-cloudflared-install') as HTMLButtonElement | null;
const remoteCloudflaredResultEl = document.getElementById('settings-remote-cloudflared-result') as HTMLElement | null;
const remoteAuthModeEl = document.getElementById('settings-remote-auth-mode') as HTMLSelectElement | null;
const remoteBearerSectionEl = document.getElementById('settings-remote-bearer-section') as HTMLElement | null;
const remoteOAuthSectionEl = document.getElementById('settings-remote-oauth-section') as HTMLElement | null;
const remoteOAuthClientIdEl = document.getElementById('settings-remote-oauth-client-id') as HTMLInputElement | null;
const remoteOAuthClientSecretEl = document.getElementById('settings-remote-oauth-client-secret') as HTMLInputElement | null;
const remoteOAuthConfigEl = document.getElementById('settings-remote-oauth-config') as HTMLTextAreaElement | null;
const remoteCopyOAuthIdEl = document.getElementById('settings-remote-copy-oauth-id') as HTMLButtonElement | null;
const remoteCopyOAuthSecretEl = document.getElementById('settings-remote-copy-oauth-secret') as HTMLButtonElement | null;
const remoteCopyOAuthConfigEl = document.getElementById('settings-remote-copy-oauth-config') as HTMLButtonElement | null;
const remoteRotateOAuthEl = document.getElementById('settings-remote-rotate-oauth') as HTMLButtonElement | null;

function showRemoteResult(kind: 'success' | 'error' | 'info', text: string): void {
  showAlert(remoteResultEl, kind, text);
}

function renderRemoteStatus(status: { enabled: boolean; running: boolean; error?: string } | undefined): void {
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

function renderTunnelStatus(tunnel: { enabled: boolean; running: boolean; state: string; available: boolean; binaryPath?: string; url?: string; error?: string } | undefined): void {
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

function renderCloudflaredStatus(cloudflared: {
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

/** Read the gateway, tunnel and cloudflared status and paint the panel. */
export async function loadRemotePanel(): Promise<void> {
  if (!remoteEnabledEl || !remoteUrlEl || !remoteTokenEl || !remoteConfigEl) return;
  try {
    const result = await api?.getRemoteInfo();
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

/**
 * One remote-panel action envelope: disable the control, call, report the
 * outcome, and reload the panel. The mutation buttons differed only in the
 * call and the two messages.
 */
async function withRemoteButton(
  button: HTMLButtonElement | HTMLSelectElement | null,
  call: () => Promise<any> | undefined,
  messages: { failure: string; success: string | ((result: any) => string) },
): Promise<void> {
  if (button) button.disabled = true;
  try {
    const result = await call();
    if (!result?.ok) showRemoteResult('error', result?.error || messages.failure);
    else showRemoteResult('success', typeof messages.success === 'function' ? messages.success(result) : messages.success);
  } catch (err: any) {
    showRemoteResult('error', `${messages.failure}: ${err?.message || err}`);
  } finally {
    if (button) button.disabled = false;
    await loadRemotePanel();
  }
}

/** Copy a field to the clipboard and flash the button label. */
function bindCopyButton(
  button: HTMLElement | null | undefined,
  read: () => string,
  idle: string,
  copied = 'COPIED',
): void {
  button?.addEventListener('click', async () => {
    const value = read();
    if (!value) return;
    await api?.copyToClipboard(value);
    button.textContent = copied;
    window.setTimeout(() => (button.textContent = idle), 1500);
  });
}

function bindGatewayControls(): void {
  remoteEnabledEl?.addEventListener('change', async () => {
    if (!remoteEnabledEl) return;
    const desired = remoteEnabledEl.checked;
    remoteEnabledEl.disabled = true;
    showRemoteResult('info', desired ? 'Starting the remote gateway…' : 'Stopping the remote gateway…');
    try {
      const result = await api?.setRemoteEnabled(desired);
      if (!result?.ok) {
        remoteEnabledEl.checked = !desired;
        showRemoteResult('error', result?.error || 'Could not change remote access.');
      } else {
        showRemoteResult('success', desired ? 'Remote gateway is running.' : 'Remote gateway is stopped.');
      }
    } catch (err: any) {
      remoteEnabledEl.checked = !desired;
      showRemoteResult('error', `Could not change remote access: ${err?.message || err}`);
    } finally {
      remoteEnabledEl.disabled = false;
      await loadRemotePanel();
    }
  });

  remoteAuthModeEl?.addEventListener('change', async () => {
    if (!remoteAuthModeEl) return;
    const mode = remoteAuthModeEl.value === 'oauth' ? 'oauth' : 'bearer';
    await withRemoteButton(remoteAuthModeEl, () => api?.setRemoteAuthMode(mode), {
      failure: 'Could not change authentication mode.',
      success: mode === 'oauth'
        ? 'OAuth 2.0 mode enabled. Use the client credentials in your OAuth-capable MCP client.'
        : 'Bearer-token mode enabled.',
    });
  });

  bindCopyButton(remoteCopyOAuthIdEl, () => remoteOAuthClientIdEl?.value || '', 'COPY');

  bindCopyButton(remoteCopyOAuthSecretEl, () => remoteOAuthClientSecretEl?.value || '', 'COPY');

  bindCopyButton(remoteCopyOAuthConfigEl, () => remoteOAuthConfigEl?.value || '', 'COPY CONFIG');

  remoteRotateOAuthEl?.addEventListener('click', async () => {
    if (!window.confirm('Rotate the OAuth client? Existing OAuth authorizations will stop working.')) return;
    await withRemoteButton(remoteRotateOAuthEl, () => api?.rotateOAuthClient(), {
      failure: 'Could not rotate the OAuth client.',
      success: 'OAuth client rotated. Update connected OAuth clients with the new credentials.',
    });
  });
}

function bindTunnelControls(): void {
  remoteTunnelEnabledEl?.addEventListener('change', async () => {
    if (!remoteTunnelEnabledEl) return;
    const desired = remoteTunnelEnabledEl.checked;
    remoteTunnelEnabledEl.disabled = true;
    showRemoteResult('info', desired ? 'Saving tunnel configuration…' : 'Stopping the named tunnel…');
    let succeeded = false;
    try {
      if (desired) {
        const hostname = remoteTunnelHostnameEl?.value.trim() || '';
        const token = remoteTunnelTokenEl?.value.trim() || undefined;
        const saved = await api?.setRemoteTunnelConfig(hostname, token);
        if (!saved?.ok) {
          remoteTunnelEnabledEl.checked = false;
          showRemoteResult('error', saved?.error || 'Save the public hostname and tunnel token first.');
          return;
        }
      }
      const result = await api?.setRemoteTunnelEnabled(desired);
      if (!result?.ok) {
        remoteTunnelEnabledEl.checked = !desired;
        showRemoteResult('error', result?.error || 'Could not change the named tunnel.');
        return;
      }
      succeeded = true;
      showRemoteResult('success', desired ? 'Named tunnel is running. The config now uses the public URL.' : 'Named tunnel stopped. The config uses the loopback URL.');
    } catch (err: any) {
      remoteTunnelEnabledEl.checked = !desired;
      showRemoteResult('error', `Could not change the named tunnel: ${err?.message || err}`);
    } finally {
      remoteTunnelEnabledEl.disabled = false;
      if (succeeded) await loadRemotePanel();
    }
  });

  remoteTunnelSaveEl?.addEventListener('click', async () => {
    const hostname = remoteTunnelHostnameEl?.value.trim() || '';
    const token = remoteTunnelTokenEl?.value.trim() || undefined;
    remoteTunnelSaveEl.disabled = true;
    showRemoteResult('info', 'Saving tunnel configuration…');
    let succeeded = false;
    try {
      const result = await api?.setRemoteTunnelConfig(hostname, token);
      if (!result?.ok) {
        showRemoteResult('error', result?.error || 'Could not save the tunnel configuration.');
        return;
      }
      succeeded = true;
      showRemoteResult('success', 'Tunnel configuration saved.');
    } catch (err: any) {
      showRemoteResult('error', `Could not save the tunnel configuration: ${err?.message || err}`);
    } finally {
      remoteTunnelSaveEl.disabled = false;
      if (succeeded) await loadRemotePanel();
    }
  });
}

function bindCloudflaredControls(): void {
  remoteCloudflaredModeEl?.addEventListener('change', async () => {
    const mode = remoteCloudflaredModeEl?.value === 'automatic' ? 'automatic' : 'manual';
    await withRemoteButton(remoteCloudflaredModeEl, () => api?.setCloudflaredMode(mode), {
      failure: 'Could not save the update mode.',
      success: mode === 'automatic'
        ? 'Managed cloudflared updates will be checked at app startup.'
        : 'Managed cloudflared updates are manual.',
    });
  });

  remoteCloudflaredCheckEl?.addEventListener('click', async () => {
    remoteCloudflaredCheckEl.disabled = true;
    if (remoteCloudflaredResultEl) remoteCloudflaredResultEl.textContent = 'checking…';
    try {
      const result = await api?.checkCloudflared();
      if (!result?.ok || !result.status) {
        showRemoteResult('error', result?.error || 'Could not check cloudflared.');
      } else {
        renderCloudflaredStatus(result.status.cloudflared);
        const cf = result.status.cloudflared;
        showRemoteResult('info', cf.updateAvailable ? `cloudflared update available${cf.latestVersion ? `: v${cf.latestVersion}` : ''}.` : 'cloudflared is up to date.');
      }
    } catch (err: any) {
      showRemoteResult('error', `Could not check cloudflared: ${err?.message || err}`);
    } finally {
      remoteCloudflaredCheckEl.disabled = false;
      await loadRemotePanel();
    }
  });

  remoteCloudflaredInstallEl?.addEventListener('click', async () => {
    if (!window.confirm('Download and install the official cloudflared binary from Cloudflare GitHub releases?')) return;
    if (remoteCloudflaredResultEl) remoteCloudflaredResultEl.textContent = 'downloading…';
    showRemoteResult('info', 'Downloading and verifying cloudflared…');
    await withRemoteButton(remoteCloudflaredInstallEl, () => api?.installCloudflared(), {
      failure: 'Could not install cloudflared.',
      success: 'cloudflared is installed and verified.',
    });
  });
}

function bindTokenControls(): void {
  remoteRefreshEl?.addEventListener('click', () => void loadRemotePanel());

  bindCopyButton(remoteCopyTokenEl, () => remoteTokenEl?.value || '', 'COPY');

  bindCopyButton(remoteCopyConfigEl, () => remoteConfigEl?.value || '', 'COPY CONFIG');

  remoteRotateEl?.addEventListener('click', async () => {
    if (!window.confirm('Rotate the remote token? Existing remote clients will stop working.')) return;
    await withRemoteButton(remoteRotateEl, () => api?.rotateRemoteToken(), {
      failure: 'Could not rotate the token.',
      success: 'Remote token rotated. Update any configured clients.',
    });
  });

  remoteDisconnectEl?.addEventListener('click', async () => {
    await withRemoteButton(remoteDisconnectEl, () => api?.disconnectRemoteSessions(), {
      failure: 'Could not disconnect sessions.',
      success: 'Remote sessions disconnected. The gateway is ready for a new client.',
    });
  });
}

/** Wire the panel once, after the settings modal markup exists. */
export function initRemotePanel(): void {
  bindGatewayControls();
  bindTunnelControls();
  bindCloudflaredControls();
  bindTokenControls();
}
