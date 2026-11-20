/**
 * The saved-wrapper list: rendering, filtering, selection and the auth-option refresh.
 */
import {
  wrapFieldAuthEl,
  wrapFieldNameEl,
  wrapWrapperBadgeEl,
  wrapWrapperDeleteEl,
  wrapWrapperFilterEl,
  wrapWrapperHeadingEl,
  wrapWrapperListEl,
  wrapWrapperModalEl,
  wrapWrapperResultEl,
  wrapWrapperSaveEl,
  wrapWrapperTitleEl,
} from './settings-wrap-dom';
import { loadWrapSettings, setAuthOptionsSink, setWrapperListSink, showWrapResult, syncWrapKind } from './settings-wrap-secrets';
import { wrapUi } from './settings-wrap-ui';
import { hostFromUrl, updateCredentialPanel, wrapperMethods } from './settings-wrap-modal';
import { wrapSecretNames, wrapState } from './settings-wrap-store';

/** When to use: a wrapper-panel helper. */
export const showWrapperResult = (kind: 'success' | 'error' | 'info', text: string) => {
  wrapWrapperResultEl.className = `alert alert-${kind} alert-sm font-mono text-xs mt-2`;
  wrapWrapperResultEl.textContent = text;
  wrapWrapperResultEl.classList.remove('hidden');
};

/** When to use: a wrapper-panel step. */
export function renderWrapWrappers(): void {
  wrapWrapperListEl.replaceChildren();
  const query = wrapWrapperFilterEl.value.trim().toLowerCase();
  const visible = query
    ? wrapState.wrappers.filter((wrapper) =>
        `${wrapper.id} ${wrapper.name} ${safeHostLabel(wrapper.request?.url)}`.toLowerCase().includes(query),
      )
    : wrapState.wrappers;

  if (!visible.length) {
    const empty = document.createElement('li');
    empty.className = 'font-mono text-[11px] text-base-content/50 px-1 py-2';
    empty.textContent = wrapState.wrappers.length
      ? 'No wrappers match that filter.'
      : 'No wrappers saved. Press NEW or ask an agent to create one.';
    wrapWrapperListEl.append(empty);
    return;
  }

  for (const wrapper of visible) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className =
      'w-full text-left rounded-box border px-3 py-2 transition-colors ' +
      (wrapper.id === wrapState.selectedId
        ? 'border-primary bg-primary/10'
        : 'border-base-100 bg-base-200/60 hover:bg-base-200');
    const id = document.createElement('div');
    id.className = 'font-mono text-xs text-base-content truncate';
    id.textContent = wrapper.id;
    const meta = document.createElement('div');
    meta.className = 'font-mono text-[10px] text-base-content/50 truncate';
    meta.textContent = `${wrapper.name} · ${wrapperMethods(wrapper).join('/')} ${safeHostLabel(wrapper.request?.url)}`;
    button.append(id, meta);
    button.addEventListener('click', () => selectWrapWrapper(wrapper.id));
    wrapWrapperListEl.append(button);
  }
}

/** When to use: a wrapper-panel step. */
export function selectWrapWrapper(id: string, open = true): void {
  const wrapper = wrapState.wrappers.find((entry) => entry.id === id);
  if (!wrapper) return;
  wrapUi.fillForm?.(wrapper);
  if (open) wrapUi.openModal?.();
}

/** When to use: a wrapper-panel step. */
export function newWrapWrapper(): void {
  wrapUi.fillForm?.(null);
  wrapUi.openModal?.();
  wrapFieldNameEl.focus();
}

/** When to use: a wrapper-panel step. */
export async function loadWrapWrappers(selectId?: string, open = true): Promise<void> {
  try {
    const wrappers = await window.electronAPI?.listWrapWrappers();
    if (!Array.isArray(wrappers)) return;
    wrapState.wrappers = wrappers;
    const wanted = selectId ?? wrapState.selectedId;
    const next = wanted ? wrappers.find((wrapper) => wrapper.id === wanted) : undefined;
    if (next) {
      selectWrapWrapper(next.id, open);
    } else {
      wrapState.selectedId = null;
      wrapWrapperHeadingEl.textContent = 'NEW WRAPPER';
      wrapWrapperTitleEl.textContent = 'Not saved';
      wrapWrapperBadgeEl.className = 'badge badge-ghost badge-xs font-mono hidden';
      wrapWrapperDeleteEl.disabled = true;
      wrapWrapperSaveEl.disabled = true;
      if (wrapWrapperModalEl.open) wrapWrapperModalEl.close();
      renderWrapWrappers();
    }
  } catch (err: any) {
    showWrapperResult('error', `Could not load wrappers: ${err?.message || err}`);
  }
}

/** When to use: a wrapper-panel step. */
export function populateAuthOptions(selected?: string): void {
  const current = selected !== undefined ? selected : wrapFieldAuthEl.value;
  const names = [...wrapSecretNames];
  if (current && current !== '__new__' && !names.includes(current)) names.unshift(current);

  wrapFieldAuthEl.replaceChildren();
  const none = document.createElement('option');
  none.value = '';
  none.textContent = 'No credential';
  wrapFieldAuthEl.append(none);

  for (const name of names) {
    const option = document.createElement('option');
    option.value = name;
    option.textContent = wrapSecretNames.includes(name) ? name : `${name} (missing)`;
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

/** When to use: a wrapper-panel step. */
export function slugifyWrapperId(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^[^a-z]+/, '')
    .replace(/[._-]{2,}/g, '-')
    .replace(/[._-]+$/g, '')
    .slice(0, 80);
}

/** When to use: a wrapper-panel step. */
export function safeHostLabel(url: unknown): string {
  try {
    return new URL(String(url || '')).host;
  } catch {
    return String(url || '');
  }
}

setAuthOptionsSink(populateAuthOptions);
setWrapperListSink(renderWrapWrappers);
