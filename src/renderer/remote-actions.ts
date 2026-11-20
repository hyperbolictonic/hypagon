/**
 * The remote-access panel's actions: enable/token, tunnel, cloudflared, OAuth and sessions.
 *
 * Each listener performs one IPC call and then re-reads the panel, so the UI always shows the
 * main process's answer rather than an optimistic guess.
 */
import * as panel from './remote-panel';

const {
  loadRemotePanel,
  renderCloudflaredStatus,
  showRemoteResult,
  remoteEnabledEl,
  remoteAuthModeEl,
  remoteCopyOAuthIdEl,
  remoteOAuthClientIdEl,
  remoteCopyOAuthSecretEl,
  remoteOAuthClientSecretEl,
  remoteCopyOAuthConfigEl,
  remoteOAuthConfigEl,
  remoteRotateOAuthEl,
  remoteTunnelEnabledEl,
  remoteTunnelHostnameEl,
  remoteTunnelTokenEl,
  remoteTunnelSaveEl,
  remoteCloudflaredModeEl,
  remoteCloudflaredCheckEl,
  remoteCloudflaredResultEl,
  remoteCloudflaredInstallEl,
  remoteRefreshEl,
  remoteCopyTokenEl,
  remoteTokenEl,
  remoteCopyConfigEl,
  remoteConfigEl,
  remoteRotateEl,
  remoteDisconnectEl,
} = panel;


remoteEnabledEl?.addEventListener('change', async () => {
  if (!remoteEnabledEl) return;
  const desired = remoteEnabledEl.checked;
  remoteEnabledEl.disabled = true;
  showRemoteResult('info', desired ? 'Starting the remote gateway…' : 'Stopping the remote gateway…');
  try {
    const result = await window.electronAPI?.setRemoteEnabled(desired);
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
  remoteAuthModeEl.disabled = true;
  try {
    const result = await window.electronAPI?.setRemoteAuthMode(mode);
    if (!result?.ok) showRemoteResult('error', result?.error || 'Could not change authentication mode.');
    else showRemoteResult('success', mode === 'oauth' ? 'OAuth 2.0 mode enabled. Use the client credentials in your OAuth-capable MCP client.' : 'Bearer-token mode enabled.');
  } catch (err: any) {
    showRemoteResult('error', `Could not change authentication mode: ${err?.message || err}`);
  } finally {
    remoteAuthModeEl.disabled = false;
    await loadRemotePanel();
  }
});

wireCopyButton(remoteCopyOAuthIdEl, () => remoteOAuthClientIdEl?.value || '', 'COPY');

wireCopyButton(remoteCopyOAuthSecretEl, () => remoteOAuthClientSecretEl?.value || '', 'COPY');

wireCopyButton(remoteCopyOAuthConfigEl, () => remoteOAuthConfigEl?.value || '', 'COPY CONFIG');

remoteRotateOAuthEl?.addEventListener('click', async () => {
  if (!window.confirm('Rotate the OAuth client? Existing OAuth authorizations will stop working.')) return;
  remoteRotateOAuthEl.disabled = true;
  try {
    const result = await window.electronAPI?.rotateOAuthClient();
    if (!result?.ok) showRemoteResult('error', result?.error || 'Could not rotate the OAuth client.');
    else showRemoteResult('success', 'OAuth client rotated. Update connected OAuth clients with the new credentials.');
  } catch (err: any) {
    showRemoteResult('error', `Could not rotate the OAuth client: ${err?.message || err}`);
  } finally {
    remoteRotateOAuthEl.disabled = false;
    await loadRemotePanel();
  }
});

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
      const saved = await window.electronAPI?.setRemoteTunnelConfig(hostname, token);
      if (!saved?.ok) {
        remoteTunnelEnabledEl.checked = false;
        showRemoteResult('error', saved?.error || 'Save the public hostname and tunnel token first.');
        return;
      }
    }
    const result = await window.electronAPI?.setRemoteTunnelEnabled(desired);
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
    const result = await window.electronAPI?.setRemoteTunnelConfig(hostname, token);
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

remoteCloudflaredModeEl?.addEventListener('change', async () => {
  const mode = remoteCloudflaredModeEl.value === 'automatic' ? 'automatic' : 'manual';
  remoteCloudflaredModeEl.disabled = true;
  try {
    const result = await window.electronAPI?.setCloudflaredMode(mode);
    if (!result?.ok) showRemoteResult('error', result?.error || 'Could not save the update mode.');
    else showRemoteResult('success', mode === 'automatic' ? 'Managed cloudflared updates will be checked at app startup.' : 'Managed cloudflared updates are manual.');
  } catch (err: any) {
    showRemoteResult('error', `Could not save the update mode: ${err?.message || err}`);
  } finally {
    remoteCloudflaredModeEl.disabled = false;
    await loadRemotePanel();
  }
});

remoteCloudflaredCheckEl?.addEventListener('click', async () => {
  remoteCloudflaredCheckEl.disabled = true;
  if (remoteCloudflaredResultEl) remoteCloudflaredResultEl.textContent = 'checking…';
  try {
    const result = await window.electronAPI?.checkCloudflared();
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

/**
 * When to use: one remote action — disable its button, run it, report the outcome, re-read the panel.
 */
async function runRemoteAction(input: {
  button?: HTMLButtonElement | null;
  run: () => Promise<{ ok?: boolean; error?: string } | undefined>;
  success: string;
  /** Sentence stem without a period; used for both the fallback and the exception message. */
  failure: string;
}): Promise<void> {
  if (input.button) input.button.disabled = true;
  try {
    const result = await input.run();
    if (!result?.ok) showRemoteResult('error', result?.error || `${input.failure}.`);
    else showRemoteResult('success', input.success);
  } catch (err: any) {
    showRemoteResult('error', `${input.failure}: ${err?.message || err}`);
  } finally {
    if (input.button) input.button.disabled = false;
    await loadRemotePanel();
  }
}

/** When to use: a copy button — copy the field's value, flash COPIED, then restore the label. */
function wireCopyButton(button: HTMLButtonElement | null, value: () => string, idle: string): void {
  if (!button) return;
  button.addEventListener('click', async () => {
    const copy = value();
    if (!copy) return;
    await window.electronAPI?.copyToClipboard(copy);
    button.textContent = 'COPIED';
    window.setTimeout(() => (button.textContent = idle), 1500);
  });
}


remoteCloudflaredInstallEl?.addEventListener('click', async () => {
  if (!window.confirm('Download and install the official cloudflared binary from Cloudflare GitHub releases?')) return;
  remoteCloudflaredInstallEl.disabled = true;
  if (remoteCloudflaredResultEl) remoteCloudflaredResultEl.textContent = 'downloading…';
  showRemoteResult('info', 'Downloading and verifying cloudflared…');
  await runRemoteAction({
    button: remoteCloudflaredInstallEl,
    run: () => window.electronAPI?.installCloudflared() as any,
    success: 'cloudflared is installed and verified.',
    failure: 'Could not install cloudflared',
  });
});

remoteRefreshEl?.addEventListener('click', () => void loadRemotePanel());

wireCopyButton(remoteCopyTokenEl, () => remoteTokenEl?.value || '', 'COPY');

wireCopyButton(remoteCopyConfigEl, () => remoteConfigEl?.value || '', 'COPY CONFIG');

remoteRotateEl?.addEventListener('click', async () => {
  if (!window.confirm('Rotate the remote token? Existing remote clients will stop working.')) return;
  await runRemoteAction({
    button: remoteRotateEl,
    run: () => window.electronAPI?.rotateRemoteToken() as any,
    success: 'Remote token rotated. Update any configured clients.',
    failure: 'Could not rotate the token',
  });
});

remoteDisconnectEl?.addEventListener('click', async () => {
  await runRemoteAction({
    button: remoteDisconnectEl,
    run: () => window.electronAPI?.disconnectRemoteSessions() as any,
    success: 'Remote sessions disconnected. The gateway is ready for a new client.',
    failure: 'Could not disconnect sessions',
  });
});
