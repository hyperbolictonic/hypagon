/**
 * Hypagon REST wrapper editor (Settings -> Wrappers).
 *
 * Owns the wrapper list, the modal form and the inline credential picker. The
 * credential list itself belongs to the settings panel; this module reads the
 * current names through `WrapWrapperDeps` and asks for a reload after the
 * editor creates a credential inline.
 */
import type { ElectronAPI } from '../preload/index.js';
import { showAlert, validationMessage } from './settings-alert';
import {
  ensureCredential,
  getSelectedAuth,
  initWrapAuth,
  populateAuthOptions,
  prefillCredentialHost,
  resetCredentialPanel,
} from './settings-wrap-auth';

const api = (window as unknown as { electronAPI?: ElectronAPI }).electronAPI;

/** Editor dependencies: the credential names and a reload after an inline create. */
export interface WrapWrapperDeps {
  /** Credential names currently available to wrappers. */
  getSecretNames(): string[];
  /** Re-read the credential list after the editor creates one. */
  reloadSecrets(): Promise<void>;
}

let initialized = false;


const wrapWrapperModalEl = document.getElementById('wrap-wrapper-modal') as HTMLDialogElement;
const wrapWrapperCloseEl = document.getElementById('settings-wrap-wrapper-close') as HTMLButtonElement;
const wrapWrapperCancelEl = document.getElementById('settings-wrap-wrapper-cancel') as HTMLButtonElement;
const wrapWrapperListEl = document.getElementById('settings-wrap-wrapper-list') as HTMLElement;
const wrapWrapperFilterEl = document.getElementById('settings-wrap-wrapper-filter') as HTMLInputElement;
const wrapWrapperHeadingEl = document.getElementById('settings-wrap-wrapper-heading') as HTMLElement;
const wrapWrapperTitleEl = document.getElementById('settings-wrap-wrapper-title') as HTMLElement;
const wrapWrapperBadgeEl = document.getElementById('settings-wrap-wrapper-badge') as HTMLElement;
const wrapWrapperFormEl = document.getElementById('settings-wrap-wrapper-form') as HTMLFormElement;
const wrapWrapperResultEl = document.getElementById('settings-wrap-wrapper-result') as HTMLElement;
const wrapWrapperSaveEl = document.getElementById('settings-wrap-wrapper-save') as HTMLButtonElement;
const wrapWrapperDeleteEl = document.getElementById('settings-wrap-wrapper-delete') as HTMLButtonElement;
const wrapWrapperNewEl = document.getElementById('settings-wrap-wrapper-new') as HTMLButtonElement;
const wrapWrapperRefreshEl = document.getElementById('settings-wrap-wrapper-refresh') as HTMLButtonElement;

const wrapFieldNameEl = document.getElementById('settings-wrap-field-name') as HTMLInputElement;
const wrapFieldIdEl = document.getElementById('settings-wrap-field-id') as HTMLInputElement;
const wrapFieldDescriptionEl = document.getElementById('settings-wrap-field-description') as HTMLInputElement;
const wrapFieldMethodEl = document.getElementById('settings-wrap-field-method') as HTMLSelectElement;
const wrapFieldUrlEl = document.getElementById('settings-wrap-field-url') as HTMLInputElement;
const wrapFieldMutatingEl = document.getElementById('settings-wrap-field-mutating') as HTMLInputElement;

function selectedWrapMethods(): string[] {
  return Array.from(wrapFieldMethodEl.selectedOptions).map((option) => option.value);
}

function setWrapMethods(methods: string[]): void {
  const wanted = new Set(methods.length ? methods : ['GET']);
  for (const option of Array.from(wrapFieldMethodEl.options)) {
    option.selected = wanted.has(option.value);
  }
}

function wrapperMethods(wrapper: any): string[] {
  const methods = Array.isArray(wrapper?.request?.methods) ? wrapper.request.methods : [];
  if (methods.length) return methods.map((method: string) => String(method).toUpperCase());
  return [String(wrapper?.request?.method || 'GET').toUpperCase()];
}

const wrapFieldInputSchemaEl = document.getElementById('settings-wrap-field-input-schema') as HTMLTextAreaElement;
const wrapFieldQueryEl = document.getElementById('settings-wrap-field-query') as HTMLTextAreaElement;
const wrapFieldHeadersEl = document.getElementById('settings-wrap-field-headers') as HTMLTextAreaElement;
const wrapFieldBodyEl = document.getElementById('settings-wrap-field-body') as HTMLTextAreaElement;
const wrapFieldBodyFormatEl = document.getElementById('settings-wrap-field-body-format') as HTMLSelectElement;
const wrapFieldResponseEl = document.getElementById('settings-wrap-field-response') as HTMLTextAreaElement;
const wrapFieldNotesEl = document.getElementById('settings-wrap-field-notes') as HTMLInputElement;

let wrapWrappers: any[] = [];

let selectedWrapperId: string | null = null;

let wrapperIdTouched = false;

const DEFAULT_INPUT_SCHEMA = {
  type: 'object',
  properties: {},
  additionalProperties: false,
};


const showWrapperResult = (kind: 'success' | 'error' | 'info', text: string) => {
  showAlert(wrapWrapperResultEl, kind, text, 'mt-2');
};

function renderWrapWrappers(): void {
  wrapWrapperListEl.replaceChildren();
  const query = wrapWrapperFilterEl.value.trim().toLowerCase();
  const visible = query
    ? wrapWrappers.filter((wrapper) =>
        `${wrapper.id} ${wrapper.name} ${safeHostLabel(wrapper.request?.url)}`.toLowerCase().includes(query),
      )
    : wrapWrappers;

  if (!visible.length) {
    const empty = document.createElement('li');
    empty.className = 'font-mono text-[11px] text-base-content/50 px-1 py-2';
    empty.textContent = wrapWrappers.length
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
      (wrapper.id === selectedWrapperId
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

function safeHostLabel(url: unknown): string {
  try {
    return new URL(String(url || '')).host;
  } catch {
    return String(url || '');
  }
}

function openWrapWrapperModal(): void {
  if (!wrapWrapperModalEl.open) wrapWrapperModalEl.showModal();
}

function slugifyWrapperId(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^[^a-z]+/, '')
    .replace(/[._-]{2,}/g, '-')
    .replace(/[._-]+$/g, '')
    .slice(0, 80);
}

function prettyJson(value: unknown): string {
  return value === undefined ? '' : JSON.stringify(value, null, 2);
}

function setWrapperForm(wrapper: any | null): void {
  wrapWrapperResultEl.classList.add('hidden');
  resetCredentialPanel();

  if (wrapper) {
    selectedWrapperId = wrapper.id;
    wrapWrapperHeadingEl.textContent = 'EDIT WRAPPER';
    wrapWrapperTitleEl.textContent = wrapper.id;
    const bits = [wrapperMethods(wrapper).join('/')];
    if (wrapper.mutating) bits.push('mutating');
    if (wrapper.request?.auth) bits.push(`secret: ${wrapper.request.auth}`);
    wrapWrapperBadgeEl.textContent = bits.join(' · ');
    wrapWrapperBadgeEl.className = 'badge badge-ghost badge-xs font-mono';

    wrapFieldNameEl.value = wrapper.name || '';
    wrapFieldIdEl.value = wrapper.id || '';
    wrapFieldIdEl.disabled = true;
    wrapperIdTouched = true;
    wrapFieldDescriptionEl.value = wrapper.description || '';
    setWrapMethods(wrapperMethods(wrapper));
    wrapFieldUrlEl.value = wrapper.request?.url || '';
    wrapFieldMutatingEl.checked = Boolean(wrapper.mutating);
    wrapFieldInputSchemaEl.value = prettyJson(wrapper.inputSchema || DEFAULT_INPUT_SCHEMA);
    wrapFieldQueryEl.value = prettyJson(wrapper.request?.query);
    wrapFieldHeadersEl.value = prettyJson(wrapper.request?.headers);
    wrapFieldBodyEl.value = prettyJson(wrapper.request?.body);
    wrapFieldBodyFormatEl.value = wrapper.request?.bodyFormat || '';
    wrapFieldResponseEl.value = prettyJson(wrapper.response);
    wrapFieldNotesEl.value = wrapper.notes || '';
    wrapWrapperDeleteEl.disabled = false;
    populateAuthOptions(wrapper.request?.auth || '');
  } else {
    selectedWrapperId = null;
    wrapWrapperHeadingEl.textContent = 'NEW WRAPPER';
    wrapWrapperTitleEl.textContent = 'Not saved';
    wrapWrapperBadgeEl.className = 'badge badge-ghost badge-xs font-mono hidden';
    wrapFieldNameEl.value = '';
    wrapFieldIdEl.value = '';
    wrapFieldIdEl.disabled = false;
    wrapperIdTouched = false;
    wrapFieldDescriptionEl.value = '';
    setWrapMethods(['GET']);
    wrapFieldUrlEl.value = '';
    wrapFieldMutatingEl.checked = false;
    wrapFieldInputSchemaEl.value = prettyJson(DEFAULT_INPUT_SCHEMA);
    wrapFieldQueryEl.value = '';
    wrapFieldHeadersEl.value = '';
    wrapFieldBodyEl.value = '';
    wrapFieldBodyFormatEl.value = '';
    wrapFieldResponseEl.value = '';
    wrapFieldNotesEl.value = '';
    wrapWrapperDeleteEl.disabled = true;
    populateAuthOptions('');
  }

  wrapWrapperSaveEl.disabled = false;
  renderWrapWrappers();
}

function selectWrapWrapper(id: string, open = true): void {
  const wrapper = wrapWrappers.find((entry) => entry.id === id);
  if (!wrapper) return;
  setWrapperForm(wrapper);
  if (open) openWrapWrapperModal();
}

function newWrapWrapper(): void {
  setWrapperForm(null);
  openWrapWrapperModal();
  wrapFieldNameEl.focus();
}

/** Load the wrapper list from the main process and optionally open one. */
export async function loadWrapWrappers(selectId?: string, open = true): Promise<void> {
  try {
    const wrappers = await api?.listWrapWrappers();
    if (!Array.isArray(wrappers)) return;
    wrapWrappers = wrappers;
    const wanted = selectId ?? selectedWrapperId;
    const next = wanted ? wrappers.find((wrapper) => wrapper.id === wanted) : undefined;
    if (next) {
      selectWrapWrapper(next.id, open);
    } else {
      selectedWrapperId = null;
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


function readJsonField(
  element: HTMLTextAreaElement,
  label: string,
  fallback?: unknown,
): { ok: true; value: unknown } | { ok: false; error: string } {
  const text = element.value.trim();
  if (!text) return { ok: true, value: fallback };
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch (err: any) {
    return { ok: false, error: `${label}: ${err?.message || err}` };
  }
}


function bindWrapperListControls(): void {
  wrapWrapperFilterEl.addEventListener('input', renderWrapWrappers);

  wrapWrapperCloseEl.addEventListener('click', () => wrapWrapperModalEl.close());
  wrapWrapperCancelEl.addEventListener('click', () => wrapWrapperModalEl.close());
  wrapWrapperModalEl.addEventListener('close', () => {
    wrapWrapperResultEl.classList.add('hidden');
    resetCredentialPanel();
  });

  wrapWrapperRefreshEl.addEventListener('click', () => {
    void loadWrapWrappers(undefined, false);
  });

  wrapWrapperNewEl.addEventListener('click', newWrapWrapper);

  wrapFieldNameEl.addEventListener('input', () => {
    if (!wrapperIdTouched) wrapFieldIdEl.value = slugifyWrapperId(wrapFieldNameEl.value);
  });

  wrapFieldIdEl.addEventListener('input', () => {
    wrapperIdTouched = wrapFieldIdEl.value.trim().length > 0;
  });

  wrapFieldMethodEl.addEventListener('change', () => {
    const methods = selectedWrapMethods();
    wrapFieldMutatingEl.checked = methods.some((method) => !['GET', 'HEAD'].includes(method));
  });

  wrapFieldUrlEl.addEventListener('input', prefillCredentialHost);
  wrapFieldUrlEl.addEventListener('blur', prefillCredentialHost);
}

interface WrapperFormValues {
  name: string;
  id: string;
  url: string;
  methods: string[];
  description: string;
  inputSchema: unknown;
  query?: unknown;
  headers?: unknown;
  body?: unknown;
  response?: unknown;
}

function readWrapperForm(): { ok: true; value: WrapperFormValues } | { ok: false; error: string } {
  const name = wrapFieldNameEl.value.trim();
  const id = wrapFieldIdEl.value.trim();
  const url = wrapFieldUrlEl.value.trim();
  const methods = selectedWrapMethods();
  const description = wrapFieldDescriptionEl.value.trim();

  const errors: string[] = [];
  if (!name) errors.push('Name is required.');
  if (!id) errors.push('ID is required.');
  if (!url) errors.push('URL is required.');
  if (methods.length === 0) errors.push('Select at least one HTTP method.');

  const inputSchema = readJsonField(wrapFieldInputSchemaEl, 'Input schema', DEFAULT_INPUT_SCHEMA);
  const query = readJsonField(wrapFieldQueryEl, 'Query template');
  const headers = readJsonField(wrapFieldHeadersEl, 'Headers');
  const body = readJsonField(wrapFieldBodyEl, 'Body template');
  const response = readJsonField(wrapFieldResponseEl, 'Response recipe');

  for (const result of [inputSchema, query, headers, body, response]) {
    if (!result.ok) errors.push(result.error);
  }
  if (errors.length) return { ok: false, error: errors.join(' ') };

  return {
    ok: true,
    value: {
      name,
      id,
      url,
      methods,
      description,
      inputSchema: inputSchema.ok ? inputSchema.value : DEFAULT_INPUT_SCHEMA,
      query: query.ok ? query.value : undefined,
      headers: headers.ok ? headers.value : undefined,
      body: body.ok ? body.value : undefined,
      response: response.ok ? response.value : undefined,
    },
  };
}

function buildWrapper(values: WrapperFormValues, auth: string): Record<string, unknown> {
  const original = selectedWrapperId
    ? wrapWrappers.find((wrapper) => wrapper.id === selectedWrapperId)
    : undefined;
  const preferred = original?.request?.method;
  const primaryMethod =
    typeof preferred === 'string' && values.methods.includes(preferred.toUpperCase())
      ? preferred.toUpperCase()
      : values.methods[0];
  const orderedMethods = [primaryMethod, ...values.methods.filter((method) => method !== primaryMethod)];

  const request: Record<string, unknown> = { method: primaryMethod, url: values.url };
  if (orderedMethods.length > 1) request.methods = orderedMethods;
  if (auth) request.auth = auth;
  if (values.query !== undefined) request.query = values.query;
  if (values.headers !== undefined) request.headers = values.headers;
  if (values.body !== undefined) request.body = values.body;
  if (wrapFieldBodyFormatEl.value) request.bodyFormat = wrapFieldBodyFormatEl.value;
  if (original?.request?.timeoutMs) request.timeoutMs = original.request.timeoutMs;

  const wrapper: Record<string, unknown> = {
    schemaVersion: 1,
    id: values.id,
    name: values.name,
    request,
    inputSchema: values.inputSchema,
    mutating: wrapFieldMutatingEl.checked,
  };
  if (values.description) wrapper.description = values.description;
  if (values.response !== undefined) wrapper.response = values.response;
  if (wrapFieldNotesEl.value.trim()) wrapper.notes = wrapFieldNotesEl.value.trim();
  if (original?.exposeAsTool !== undefined) wrapper.exposeAsTool = original.exposeAsTool;
  if (original?.lastVerified !== undefined) wrapper.lastVerified = original.lastVerified;
  return wrapper;
}

function bindWrapperForm(): void {
  wrapWrapperFormEl.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = readWrapperForm();
    if (!form.ok) {
      showWrapperResult('error', form.error);
      return;
    }

    wrapWrapperSaveEl.disabled = true;
    wrapWrapperSaveEl.classList.add('loading');
    try {
      const credential = await ensureCredential(getSelectedAuth(), form.value.url);
      if (!credential.ok) {
        showWrapperResult('error', credential.error);
        return;
      }

      const result = await api?.saveWrapWrapper(buildWrapper(form.value, credential.name));
      if (result?.ok) {
        const savedId = result.wrapper?.id || form.value.id;
        await loadWrapWrappers(savedId, false);
        wrapWrapperModalEl.close();
      } else {
        showWrapperResult('error', validationMessage(result));
      }
    } catch (err: any) {
      showWrapperResult('error', `Save failed: ${err?.message || err}`);
    } finally {
      wrapWrapperSaveEl.disabled = false;
      wrapWrapperSaveEl.classList.remove('loading');
    }
  });

  wrapWrapperDeleteEl.addEventListener('click', async () => {
    if (!selectedWrapperId) return;
    if (!window.confirm(`Delete wrapper "${selectedWrapperId}"? Credentials are kept.`)) return;
    const result = await api?.deleteWrapWrapper(selectedWrapperId);
    if (result?.ok) {
      await loadWrapWrappers(undefined, false);
      wrapWrapperModalEl.close();
    } else {
      showWrapperResult('error', (result?.errors || []).join('; ') || 'Delete failed.');
    }
  });
}

/** Wire the wrapper editor once, after the settings modal's DOM exists. */
export function initWrapWrappers(next: WrapWrapperDeps): void {
  if (initialized) return;
  initialized = true;
  if (!wrapWrapperModalEl || !wrapWrapperFormEl) return;
  initWrapAuth({
    getSecretNames: next.getSecretNames,
    reloadSecrets: next.reloadSecrets,
    getUrl: () => wrapFieldUrlEl.value,
  });
  bindWrapperListControls();
  bindWrapperForm();
}

/** Repaint the credential picker after the credential list changed. */
export function refreshWrapperAuthOptions(): void {
  if (wrapWrapperModalEl.open) populateAuthOptions();
}

/** Close the editor when the settings modal itself closes. */
export function closeWrapWrapperModal(): void {
  if (wrapWrapperModalEl.open) wrapWrapperModalEl.close();
}
