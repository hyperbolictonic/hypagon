/**
 * The Hypagon REST secrets form (Settings → Wrappers → Credentials).
 *
 * Credentials are write-only from this panel: the form creates, edits and deletes named secrets,
 * and the list only ever shows names, headers and bound hosts. Handles come from the shared wrap
 * registry, since the wrapper modal reuses the same credential sub-form.
 */
import {
  wrapCancelEditEl,
  wrapClientIdEl,
  wrapCredentialValueEl,
  wrapFieldAuthEl,
  wrapFormEl,
  wrapHeaderEl,
  wrapHostsEl,
  wrapKindEl,
  wrapListEl,
  wrapNameEl,
  wrapOAuthEl,
  wrapPrefixEl,
  wrapRefreshEl,
  wrapResultEl,
  wrapSaveEl,
  wrapScopeEl,
  wrapTokenUrlEl,
  wrapValueEl,
  wrapWarningEl,
  wrapWrapperCancelEl,
  wrapWrapperCloseEl,
  wrapWrapperFilterEl,
  wrapWrapperModalEl,
  wrapWrapperResultEl,
} from './settings-wrap-dom';
import { wrapSecretNames } from './settings-wrap-store';

/** When to use: main registers the wrapper-side auth dropdown refresh here. */
let authOptionsSink: (value?: any) => void = () => {};

/** When to use: main registers the wrapper-list repaint here. */
let wrapperListSink: () => void = () => {};

/** When to use: once at boot, with the entry point's populateAuthOptions. */
export function setAuthOptionsSink(fn: (value?: any) => void): void {
  authOptionsSink = fn;
}

/** When to use: once at boot, with the entry point's wrapperListSink. */
export function setWrapperListSink(fn: () => void): void {
  wrapperListSink = fn;
}

let wrapSecretsAvailable = true;


let editingSecretName: string | null = null;

/** When to use: the secrets result line — one alert, plus a wrapper-list refresh. */
export const showWrapResult = (kind: 'success' | 'error' | 'info', text: string) => {
  wrapResultEl.className = `alert alert-${kind} alert-sm font-mono text-xs`;
  wrapResultEl.textContent = text;
  wrapResultEl.classList.remove('hidden');
};

/** When to use: the secret kind changed — show the OAuth fields. */
export const syncWrapKind = () => {
  const oauth = wrapKindEl.value === 'oauth2';
  wrapOAuthEl.classList.toggle('hidden', !oauth);
  wrapValueEl.placeholder = oauth
    ? 'client secret; it is never shown again'
    : 'paste the credential; it is never shown again';
};

/** When to use: the secret list changed — repaint the credentials list. */
export const renderWrapSecrets = (secrets: any[]) => {
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
      const result = await window.electronAPI?.deleteWrapSecret(secret.name);
      showWrapResult(result?.ok ? 'success' : 'error', result?.ok ? `Deleted ${secret.name}.` : (result?.errors || []).join('; ') || 'Delete failed.');
      if (editingSecretName === secret.name) resetSecretForm();
      await loadWrapSettings();
    });

    actions.append(edit, remove);
    row.append(text, actions);
    wrapListEl.append(row);
  }
};

/** When to use: the edit button on a saved secret. */
export function beginEditSecret(secret: any): void {
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

/** When to use: after save or cancel — clear the secret form. */
export function resetSecretForm(): void {
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

/** When to use: the Wrappers tab opens, or a secret is saved — refresh the secret list. */
export async function loadWrapSettings(): Promise<void> {
  try {
    const data = await window.electronAPI?.listWrapSecrets();
    if (!data) return;
    wrapSecretsAvailable = Boolean(data.available);
    if (data.warning) {
      wrapWarningEl.textContent = data.warning;
      wrapWarningEl.classList.remove('hidden');
    } else {
      wrapWarningEl.classList.add('hidden');
    }
    if (wrapSaveEl) wrapSaveEl.disabled = !data.available;
    wrapSecretNames.length = 0;
    wrapSecretNames.push(...(data.secrets || []).map((secret: any) => secret.name).filter(Boolean));
    renderWrapSecrets(data.secrets || []);
    if (wrapWrapperModalEl.open) authOptionsSink(wrapFieldAuthEl.value);
  } catch (err: any) {
    showWrapResult('error', `Could not load secrets: ${err?.message || err}`);
  }
}

wrapHeaderEl.addEventListener('change', () => {
  if (wrapHeaderEl.value.trim().toLowerCase() !== 'authorization' && wrapPrefixEl.value === 'Bearer ') {
    wrapPrefixEl.value = '';
  }
});

wrapRefreshEl.addEventListener('click', () => {
  void loadWrapSettings();
});

wrapFormEl.addEventListener('submit', async (event) => {
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
    const result = await window.electronAPI?.setWrapSecret({
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
      showWrapResult('error', (result?.errors || []).join('; ') || 'Save failed.');
    }
  } catch (err: any) {
    showWrapResult('error', `Save failed: ${err?.message || err}`);
  } finally {
    if (wrapSaveEl) {
      wrapSaveEl.disabled = !wrapSecretsAvailable;
      wrapSaveEl.classList.remove('loading');
    }
  }
});

wrapCancelEditEl.addEventListener('click', resetSecretForm);
wrapKindEl.addEventListener('change', syncWrapKind);

wrapWrapperFilterEl.addEventListener('input', wrapperListSink);

wrapWrapperCloseEl.addEventListener('click', () => wrapWrapperModalEl.close());
wrapWrapperCancelEl.addEventListener('click', () => wrapWrapperModalEl.close());
wrapWrapperModalEl.addEventListener('close', () => {
  wrapWrapperResultEl.classList.add('hidden');
  wrapCredentialValueEl.value = '';
});
