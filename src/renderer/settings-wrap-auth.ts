/**
 * Credential picker inside the wrapper editor.
 *
 * A wrapper either references an existing credential by name or creates one
 * inline. The credential list belongs to the settings panel, so this module
 * reads the current names through `WrapAuthDeps` and asks for a reload after
 * an inline create.
 */
import type { ElectronAPI } from '../preload/index.js';

const api = (window as unknown as { electronAPI?: ElectronAPI }).electronAPI;

/** Credential-picker dependencies: current names, reload, and the URL used to prefill a host. */
export interface WrapAuthDeps {
  /** Credential names currently available to wrappers. */
  getSecretNames(): string[];
  /** Re-read the credential list after an inline create. */
  reloadSecrets(): Promise<void>;
  /** Current wrapper URL, used to prefill the new credential's host. */
  getUrl(): string;
}

let deps: WrapAuthDeps | null = null;

const wrapFieldAuthEl = document.getElementById('settings-wrap-field-auth') as HTMLSelectElement | null;
const wrapCredentialPanelEl = document.getElementById('settings-wrap-credential-panel') as HTMLElement | null;
const wrapCredentialNameEl = document.getElementById('settings-wrap-credential-name') as HTMLInputElement | null;
const wrapCredentialValueEl = document.getElementById('settings-wrap-credential-value') as HTMLInputElement | null;
const wrapCredentialHostsEl = document.getElementById('settings-wrap-credential-hosts') as HTMLInputElement | null;
const wrapCredentialHeaderEl = document.getElementById('settings-wrap-credential-header') as HTMLInputElement | null;
const wrapCredentialPrefixEl = document.getElementById('settings-wrap-credential-prefix') as HTMLInputElement | null;

function hostFromUrl(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}

/** Repaint the credential dropdown from the current secret names. */
export function populateAuthOptions(selected?: string): void {
  if (!wrapFieldAuthEl) return;
  const current = selected !== undefined ? selected : wrapFieldAuthEl.value;
  const known = deps?.getSecretNames() ?? [];
  const names = [...known];
  if (current && current !== '__new__' && !names.includes(current)) names.unshift(current);

  wrapFieldAuthEl.replaceChildren();
  const none = document.createElement('option');
  none.value = '';
  none.textContent = 'No credential';
  wrapFieldAuthEl.append(none);

  for (const name of names) {
    const option = document.createElement('option');
    option.value = name;
    option.textContent = known.includes(name) ? name : `${name} (missing)`;
    wrapFieldAuthEl.append(option);
  }

  const add = document.createElement('option');
  add.value = '__new__';
  add.textContent = '+ New credential…';
  wrapFieldAuthEl.append(add);

  wrapFieldAuthEl.value =
    current === '__new__' || current === '' || names.includes(current) ? current : '';
  updateCredentialPanel();
}

/** Show the inline credential fields only when "+ New credential" is selected. */
export function updateCredentialPanel(): void {
  if (!wrapFieldAuthEl || !wrapCredentialPanelEl) return;
  const isNew = wrapFieldAuthEl.value === '__new__';
  wrapCredentialPanelEl.classList.toggle('hidden', !isNew);
  if (isNew && wrapCredentialHostsEl && !wrapCredentialHostsEl.value) {
    const host = hostFromUrl(deps?.getUrl() ?? '');
    if (host) wrapCredentialHostsEl.value = host;
  }
}

/** Clear the inline credential fields without touching the saved list. */
export function resetCredentialPanel(): void {
  if (wrapCredentialNameEl) wrapCredentialNameEl.value = '';
  if (wrapCredentialValueEl) wrapCredentialValueEl.value = '';
  if (wrapCredentialHostsEl) wrapCredentialHostsEl.value = '';
  if (wrapCredentialHeaderEl) wrapCredentialHeaderEl.value = 'Authorization';
  if (wrapCredentialPrefixEl) wrapCredentialPrefixEl.value = 'Bearer ';
}

/** Current credential selection; `__new__` means the inline form is active. */
export function getSelectedAuth(): string {
  return wrapFieldAuthEl?.value ?? '';
}

/** Prefill the credential host when the wrapper URL changes. */
export function prefillCredentialHost(): void {
  if (wrapFieldAuthEl?.value !== '__new__' || wrapCredentialHostsEl?.value.trim()) return;
  const host = hostFromUrl(deps?.getUrl() ?? '');
  if (host && wrapCredentialHostsEl) wrapCredentialHostsEl.value = host;
}

/** Create the inline credential and return the name the wrapper should reference. */
export async function ensureCredential(
  auth: string,
  url: string,
): Promise<{ ok: true; name: string } | { ok: false; error: string }> {
  if (auth !== '__new__') return { ok: true, name: auth };

  const credentialName = wrapCredentialNameEl?.value.trim() ?? '';
  const credentialValue = wrapCredentialValueEl?.value ?? '';
  const allowedHosts = wrapCredentialHostsEl?.value.trim() || hostFromUrl(url);
  if (!credentialName || !credentialValue || !allowedHosts) {
    return { ok: false, error: 'New credential needs a name, value, and allowed host.' };
  }

  const header = wrapCredentialHeaderEl?.value.trim() || 'Authorization';
  const prefix =
    header.toLowerCase() !== 'authorization' && wrapCredentialPrefixEl?.value === 'Bearer '
      ? ''
      : wrapCredentialPrefixEl?.value ?? '';
  const credential = await api?.setWrapSecret({
    name: credentialName,
    value: credentialValue,
    allowedHosts,
    header,
    prefix,
  });
  if (!credential?.ok) {
    return {
      ok: false,
      error: `Credential rejected: ${(credential?.errors || []).join('; ') || 'unknown error'}`,
    };
  }

  await deps?.reloadSecrets();
  if (wrapFieldAuthEl) wrapFieldAuthEl.value = credentialName;
  updateCredentialPanel();
  return { ok: true, name: credentialName };
}

/** Bind the picker's own change handlers; the wrapper form binds the URL field. */
export function initWrapAuth(next: WrapAuthDeps): void {
  deps = next;
  wrapFieldAuthEl?.addEventListener('change', updateCredentialPanel);
  wrapCredentialHeaderEl?.addEventListener('change', () => {
    if (!wrapCredentialHeaderEl || !wrapCredentialPrefixEl) return;
    if (
      wrapCredentialHeaderEl.value.trim().toLowerCase() !== 'authorization' &&
      wrapCredentialPrefixEl.value === 'Bearer '
    ) {
      wrapCredentialPrefixEl.value = '';
    }
  });
}
