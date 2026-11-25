/**
 * Hypagon REST credentials (Settings -> Wrappers -> Credentials).
 *
 * Owns the write-only secret form and list. The wrapper editor asks this
 * module for the current names and a reload after an inline create.
 */
import type { ElectronAPI } from '../preload/index.js';
import { showAlert, validationMessage } from './settings-alert';
import { initWrapWrappers, loadWrapWrappers, refreshWrapperAuthOptions } from './settings-wrap-wrappers';

const api = (window as unknown as { electronAPI?: ElectronAPI }).electronAPI;

const wrapWarningEl = document.getElementById('settings-wrap-warning') as HTMLElement;
const wrapFormEl = document.getElementById('settings-wrap-secret-form') as HTMLFormElement;
const wrapNameEl = document.getElementById('settings-wrap-name') as HTMLInputElement;
const wrapHeaderEl = document.getElementById('settings-wrap-header') as HTMLInputElement;
const wrapValueEl = document.getElementById('settings-wrap-value') as HTMLInputElement;
const wrapHostsEl = document.getElementById('settings-wrap-hosts') as HTMLInputElement;
const wrapPrefixEl = document.getElementById('settings-wrap-prefix') as HTMLInputElement;
const wrapKindEl = document.getElementById('settings-wrap-kind') as HTMLSelectElement;
const wrapOAuthEl = document.getElementById('settings-wrap-oauth') as HTMLElement;
const wrapTokenUrlEl = document.getElementById('settings-wrap-token-url') as HTMLInputElement;
const wrapClientIdEl = document.getElementById('settings-wrap-client-id') as HTMLInputElement;
const wrapScopeEl = document.getElementById('settings-wrap-scope') as HTMLInputElement;
const wrapResultEl = document.getElementById('settings-wrap-result') as HTMLElement;
const wrapRefreshEl = document.getElementById('settings-wrap-refresh') as HTMLButtonElement;
const wrapSaveEl = document.querySelector<HTMLButtonElement>('#settings-wrap-secret-form button[type="submit"]');
const wrapListEl = document.getElementById('settings-wrap-secret-list') as HTMLElement;
const wrapCancelEditEl = document.getElementById('settings-wrap-cancel-edit') as HTMLButtonElement;

const wrapSubTabs = Array.from(document.querySelectorAll<HTMLButtonElement>('[data-wrap-tab]'));
const wrapSubPanels = Array.from(document.querySelectorAll<HTMLElement>('[data-wrap-panel]'));



let wrapSecretsAvailable = true;
let wrapSecretNames: string[] = [];
let editingSecretName: string | null = null;

const showWrapResult = (kind: 'success' | 'error' | 'info', text: string) => {
  showAlert(wrapResultEl, kind, text);
};

/** Show the OAuth2 fields only when that credential type is selected. */
const syncWrapKind = () => {
  const oauth = wrapKindEl.value === 'oauth2';
  wrapOAuthEl.classList.toggle('hidden', !oauth);
  wrapValueEl.placeholder = oauth
    ? 'client secret; it is never shown again'
    : 'paste the credential; it is never shown again';
};

const renderWrapSecrets = (secrets: any[]) => {
  wrapListEl.replaceChildren();
  if (!secrets.length) {
    const empty = document.createElement('li');
    empty.className = 'font-mono text-[11px] text-base-content/50';
    empty.textContent = 'No secrets yet. Add one above; agents will see its name and allowed hosts.';
    wrapListEl.append(empty);
    return;
  }

  for (const secret of secrets) {
    const row = document.createElement('li');
    row.className =
      'flex items-center justify-between gap-3 rounded-box border border-base-100 bg-base-200/60 px-3 py-2';

    const text = document.createElement('div');
    text.className = 'min-w-0';
    const name = document.createElement('div');
    name.className = 'font-mono text-xs text-base-content';
    name.textContent = secret.name;
    const meta = document.createElement('div');
    meta.className = 'font-mono text-[10px] text-base-content/50 truncate';
    meta.textContent = `${secret.header}: ${secret.allowedHosts.join(', ')}`;
    text.append(name, meta);

    const actions = document.createElement('div');
    actions.className = 'flex items-center gap-1 shrink-0';

    const edit = document.createElement('button');
    edit.type = 'button';
    edit.className = 'btn btn-xs btn-ghost font-mono text-[10px]';
    edit.textContent = 'EDIT';
    edit.addEventListener('click', () => beginEditSecret(secret));

    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'btn btn-xs btn-ghost font-mono text-[10px]';
    remove.textContent = 'DELETE';
    remove.addEventListener('click', async () => {
      if (!window.confirm(`Delete secret "${secret.name}"? Wrappers using it will stop working.`)) return;
      const result = await api?.deleteWrapSecret(secret.name);
      showWrapResult(result?.ok ? 'success' : 'error', result?.ok ? `Deleted ${secret.name}.` : (result?.errors || []).join('; ') || 'Delete failed.');
      if (editingSecretName === secret.name) resetSecretForm();
      await loadWrapSettings();
    });

    actions.append(edit, remove);
    row.append(text, actions);
    wrapListEl.append(row);
  }
};

function beginEditSecret(secret: any): void {
  editingSecretName = secret.name;
  wrapNameEl.value = secret.name;
  wrapHeaderEl.value = secret.header;
  wrapHostsEl.value = (secret.allowedHosts || []).join(', ');
  wrapPrefixEl.value = secret.prefix;
  wrapValueEl.value = '';
  wrapKindEl.value = secret.kind === 'oauth2' ? 'oauth2' : 'static';
  wrapTokenUrlEl.value = secret.oauth2?.tokenUrl || '';
  wrapClientIdEl.value = secret.oauth2?.clientId || '';
  wrapScopeEl.value = secret.oauth2?.scope || '';
  syncWrapKind();
  wrapCancelEditEl.classList.remove('hidden');
  if (wrapSaveEl) wrapSaveEl.textContent = 'UPDATE SECRET';
  showWrapResult('info', `Editing ${secret.name}. Leave the value blank to keep the current credential.`);
  wrapNameEl.focus();
}

function resetSecretForm(): void {
  editingSecretName = null;
  wrapNameEl.value = '';
  wrapValueEl.value = '';
  wrapHostsEl.value = '';
  wrapHeaderEl.value = 'Authorization';
  wrapPrefixEl.value = 'Bearer ';
  wrapKindEl.value = 'static';
  wrapTokenUrlEl.value = '';
  wrapClientIdEl.value = '';
  wrapScopeEl.value = '';
  syncWrapKind();
  wrapCancelEditEl.classList.add('hidden');
  if (wrapSaveEl) wrapSaveEl.textContent = 'SAVE SECRET';
}

function showWrapSubTab(tab: string): void {
  for (const button of wrapSubTabs) {
    button.classList.toggle('tab-active', button.dataset.wrapTab === tab);
  }
  for (const panel of wrapSubPanels) {
    panel.classList.toggle('hidden', panel.dataset.wrapPanel !== tab);
  }
  if (tab === 'credentials') void loadWrapSettings();
  if (tab === 'wrappers') void loadWrapWrappers(undefined, false);
}


/** Read the credential list and repaint the secret panel and the editor picker. */
export async function loadWrapSettings(): Promise<void> {
  try {
    const data = await api?.listWrapSecrets();
    if (!data) return;
    wrapSecretsAvailable = Boolean(data.available);
    if (data.warning) {
      wrapWarningEl.textContent = data.warning;
      wrapWarningEl.classList.remove('hidden');
    } else {
      wrapWarningEl.classList.add('hidden');
    }
    if (wrapSaveEl) wrapSaveEl.disabled = !data.available;
    wrapSecretNames = (data.secrets || []).map((secret: any) => secret.name).filter(Boolean);
    renderWrapSecrets(data.secrets || []);
    refreshWrapperAuthOptions();
  } catch (err: any) {
    showWrapResult('error', `Could not load secrets: ${err?.message || err}`);
  }
}

/** Validate and submit the write-only credential form. */
async function submitSecretForm(event: Event): Promise<void> {
  event.preventDefault();
  const name = wrapNameEl.value.trim();
  const value = wrapValueEl.value;
  const allowedHosts = wrapHostsEl.value.trim();
  const editing = Boolean(editingSecretName) && editingSecretName === name;

  if (!name || !allowedHosts) {
    showWrapResult('error', 'Name and at least one allowed host are required.');
    return;
  }
  if (!value && !editing) {
    showWrapResult('error', 'Value is required for a new secret or a renamed secret.');
    return;
  }

  const kind = wrapKindEl.value === 'oauth2' ? 'oauth2' : 'static';
  const tokenUrl = wrapTokenUrlEl.value.trim();
  const clientId = wrapClientIdEl.value.trim();
  const scope = wrapScopeEl.value.trim();
  if (kind === 'oauth2' && (!tokenUrl || !clientId)) {
    showWrapResult('error', 'An OAuth2 credential needs a token URL and a client ID.');
    return;
  }

  if (wrapSaveEl) {
    wrapSaveEl.disabled = true;
    wrapSaveEl.classList.add('loading');
  }
  try {
    const header = wrapHeaderEl.value.trim() || 'Authorization';
    const prefix =
      header.toLowerCase() !== 'authorization' && wrapPrefixEl.value === 'Bearer ' ? '' : wrapPrefixEl.value;
    const result = await api?.setWrapSecret({
      name,
      value,
      allowedHosts,
      header,
      prefix,
      kind,
      ...(kind === 'oauth2' ? { tokenUrl, clientId, scope } : {}),
    });
    if (result?.ok) {
      resetSecretForm();
      showWrapResult('success', `Saved ${name}. Agents can reference it by name; the value stays here.`);
      await loadWrapSettings();
    } else {
      showWrapResult('error', validationMessage(result));
    }
  } catch (err: any) {
    showWrapResult('error', `Save failed: ${err?.message || err}`);
  } finally {
    if (wrapSaveEl) {
      wrapSaveEl.disabled = !wrapSecretsAvailable;
      wrapSaveEl.classList.remove('loading');
    }
  }
}

function bindSecretControls(): void {
  for (const button of wrapSubTabs) {
    button.addEventListener('click', () => showWrapSubTab(button.dataset.wrapTab || 'wrappers'));
  }

  wrapHeaderEl.addEventListener('change', () => {
    if (wrapHeaderEl.value.trim().toLowerCase() !== 'authorization' && wrapPrefixEl.value === 'Bearer ') {
      wrapPrefixEl.value = '';
    }
  });

  wrapRefreshEl.addEventListener('click', () => {
    void loadWrapSettings();
  });

  wrapFormEl.addEventListener('submit', submitSecretForm);
  wrapCancelEditEl.addEventListener('click', resetSecretForm);
  wrapKindEl.addEventListener('change', syncWrapKind);
}

/** Wire the credential panel and the wrapper editor once. */
export function initWrapSecrets(): void {
  bindSecretControls();
  initWrapWrappers({
    getSecretNames: () => wrapSecretNames,
    reloadSecrets: loadWrapSettings,
  });
}

/** The wrap subtab the user last selected (credentials or wrappers). */
export function activeWrapTab(): string | undefined {
  return wrapSubTabs.find((button) => button.classList.contains('tab-active'))?.dataset.wrapTab;
}
