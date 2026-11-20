/**
 * The wrapper form engine: opening the modal, filling it, and turning its fields into a wrapper.
 */
import {
  wrapCredentialHeaderEl,
  wrapCredentialHostsEl,
  wrapCredentialNameEl,
  wrapCredentialPanelEl,
  wrapCredentialPrefixEl,
  wrapCredentialValueEl,
  wrapFieldAuthEl,
  wrapFieldBodyEl,
  wrapFieldBodyFormatEl,
  wrapFieldDescriptionEl,
  wrapFieldHeadersEl,
  wrapFieldIdEl,
  wrapFieldInputSchemaEl,
  wrapFieldMethodEl,
  wrapFieldMutatingEl,
  wrapFieldNameEl,
  wrapFieldNotesEl,
  wrapFieldQueryEl,
  wrapFieldResponseEl,
  wrapFieldUrlEl,
  wrapWrapperBadgeEl,
  wrapWrapperDeleteEl,
  wrapWrapperHeadingEl,
  wrapWrapperModalEl,
  wrapWrapperResultEl,
  wrapWrapperSaveEl,
  wrapWrapperTitleEl,
} from './settings-wrap-dom';
import { loadWrapSettings, showWrapResult } from './settings-wrap-secrets';
import { wrapUi } from './settings-wrap-ui';
import { wrapState } from './settings-wrap-store';

/** When to use: a wrapper-panel step. */
export function openWrapWrapperModal(): void {
  if (!wrapWrapperModalEl.open) wrapWrapperModalEl.showModal();
}

/** When to use: a wrapper-panel step. */
export function setWrapperForm(wrapper: any | null): void {
  wrapWrapperResultEl.classList.add('hidden');
  resetCredentialPanel();

  if (wrapper) {
    wrapState.selectedId = wrapper.id;
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
    wrapState.idTouched = true;
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
    wrapUi.refreshAuthOptions?.(wrapper.request?.auth || '');
  } else {
    wrapState.selectedId = null;
    wrapWrapperHeadingEl.textContent = 'NEW WRAPPER';
    wrapWrapperTitleEl.textContent = 'Not saved';
    wrapWrapperBadgeEl.className = 'badge badge-ghost badge-xs font-mono hidden';
    wrapFieldNameEl.value = '';
    wrapFieldIdEl.value = '';
    wrapFieldIdEl.disabled = false;
    wrapState.idTouched = false;
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
    wrapUi.refreshAuthOptions?.('');
  }

  wrapWrapperSaveEl.disabled = false;
  wrapUi.refreshList?.();
}

/** When to use: a wrapper-panel step. */
export function readWrapperForm() {
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

  const inputSchemaResult = readJsonField(wrapFieldInputSchemaEl, 'Input schema', DEFAULT_INPUT_SCHEMA);
  const queryResult = readJsonField(wrapFieldQueryEl, 'Query template');
  const headersResult = readJsonField(wrapFieldHeadersEl, 'Headers');
  const bodyResult = readJsonField(wrapFieldBodyEl, 'Body template');
  const responseResult = readJsonField(wrapFieldResponseEl, 'Response recipe');

  for (const result of [inputSchemaResult, queryResult, headersResult, bodyResult, responseResult]) {
    if (!result.ok) errors.push(result.error);
  }

  const original = wrapState.selectedId ? wrapState.wrappers.find((wrapper) => wrapper.id === wrapState.selectedId) : undefined;
  const preferred = original?.request?.method;
  const primaryMethod =
    typeof preferred === 'string' && methods.includes(preferred.toUpperCase())
      ? preferred.toUpperCase()
      : methods[0];
  const orderedMethods = [primaryMethod, ...methods.filter((method) => method !== primaryMethod)];

  return {
    name,
    id,
    url,
    methods,
    description,
    errors,
    original,
    primaryMethod,
    orderedMethods,
    inputSchemaValue: inputSchemaResult.ok ? inputSchemaResult.value : DEFAULT_INPUT_SCHEMA,
    queryValue: queryResult.ok ? queryResult.value : undefined,
    headersValue: headersResult.ok ? headersResult.value : undefined,
    bodyValue: bodyResult.ok ? bodyResult.value : undefined,
    responseValue: responseResult.ok ? responseResult.value : undefined,
  };
}

/** When to use: a wrapper-panel step. */
export async function resolveWrapperAuth(auth: string, url: string): Promise<string | null> {
  if (auth !== '__new__') return auth;

  const credentialName = wrapCredentialNameEl.value.trim();
  const credentialValue = wrapCredentialValueEl.value;
  const allowedHosts = wrapCredentialHostsEl.value.trim() || hostFromUrl(url);
  if (!credentialName || !credentialValue || !allowedHosts) {
    wrapUi.showResult?.('error', 'New credential needs a name, value, and allowed host.');
    return null;
  }

  const header = wrapCredentialHeaderEl.value.trim() || 'Authorization';
  const prefix =
    header.toLowerCase() !== 'authorization' && wrapCredentialPrefixEl.value === 'Bearer '
      ? ''
      : wrapCredentialPrefixEl.value;
  const credential = await window.electronAPI?.setWrapSecret({
    name: credentialName,
    value: credentialValue,
    allowedHosts,
    header,
    prefix,
  });
  if (!credential?.ok) {
    wrapUi.showResult?.('error', `Credential rejected: ${(credential?.errors || []).join('; ') || 'unknown error'}`);
    return null;
  }

  await loadWrapSettings();
  wrapFieldAuthEl.value = credentialName;
  updateCredentialPanel();
  return credentialName;
}

/** When to use: a wrapper-panel step. */
export function buildWrapperPayload(form: ReturnType<typeof readWrapperForm>, auth: string): Record<string, unknown> {
  const request: Record<string, unknown> = { method: form.primaryMethod, url: form.url };
  if (form.orderedMethods.length > 1) request.methods = form.orderedMethods;
  if (auth && auth !== '__new__') request.auth = auth;
  if (form.queryValue !== undefined) request.query = form.queryValue;
  if (form.headersValue !== undefined) request.headers = form.headersValue;
  if (form.bodyValue !== undefined) request.body = form.bodyValue;
  if (wrapFieldBodyFormatEl.value) request.bodyFormat = wrapFieldBodyFormatEl.value;
  if (form.original?.request?.timeoutMs) request.timeoutMs = form.original.request.timeoutMs;

  const wrapper: Record<string, unknown> = {
    schemaVersion: 1,
    id: form.id,
    name: form.name,
    request,
    inputSchema: form.inputSchemaValue,
    mutating: wrapFieldMutatingEl.checked,
  };
  if (form.description) wrapper.description = form.description;
  if (form.responseValue !== undefined) wrapper.response = form.responseValue;
  if (wrapFieldNotesEl.value.trim()) wrapper.notes = wrapFieldNotesEl.value.trim();
  if (form.original?.exposeAsTool !== undefined) wrapper.exposeAsTool = form.original.exposeAsTool;
  if (form.original?.lastVerified !== undefined) wrapper.lastVerified = form.original.lastVerified;
  return wrapper;
}

/** When to use: a wrapper-panel step. */
export function readJsonField(
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

/** When to use: a wrapper-panel step. */
export function selectedWrapMethods(): string[] {
  return Array.from(wrapFieldMethodEl.selectedOptions).map((option) => option.value);
}

/** When to use: a wrapper-panel step. */
export function setWrapMethods(methods: string[]): void {
  const wanted = new Set(methods.length ? methods : ['GET']);
  for (const option of Array.from(wrapFieldMethodEl.options)) {
    option.selected = wanted.has(option.value);
  }
}

/** When to use: a wrapper-panel step. */
export function wrapperMethods(wrapper: any): string[] {
  const methods = Array.isArray(wrapper?.request?.methods) ? wrapper.request.methods : [];
  if (methods.length) return methods.map((method: string) => String(method).toUpperCase());
  return [String(wrapper?.request?.method || 'GET').toUpperCase()];
}

/** When to use: a wrapper-panel step. */
export function resetCredentialPanel(): void {
  wrapCredentialNameEl.value = '';
  wrapCredentialValueEl.value = '';
  wrapCredentialHostsEl.value = '';
  wrapCredentialHeaderEl.value = 'Authorization';
  wrapCredentialPrefixEl.value = 'Bearer ';
}

/** When to use: a wrapper-panel step. */
export function prettyJson(value: unknown): string {
  return value === undefined ? '' : JSON.stringify(value, null, 2);
}

/** When to use: a wrapper-panel helper. */
export const DEFAULT_INPUT_SCHEMA = {
  type: 'object',
  properties: {},
  additionalProperties: false,
};

/** When to use: a wrapper-panel step. */
export function hostFromUrl(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}

/** When to use: a wrapper-panel step. */
export function updateCredentialPanel(): void {
  const isNew = wrapFieldAuthEl.value === '__new__';
  wrapCredentialPanelEl.classList.toggle('hidden', !isNew);
  if (isNew && !wrapCredentialHostsEl.value) {
    const host = hostFromUrl(wrapFieldUrlEl.value);
    if (host) wrapCredentialHostsEl.value = host;
  }
}
