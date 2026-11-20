/**
 * The wrapper modal's buttons: new, refresh, filter, close/cancel, and save/delete.
 */
import {
  wrapCredentialHeaderEl,
  wrapCredentialHostsEl,
  wrapCredentialPrefixEl,
  wrapFieldAuthEl,
  wrapFieldIdEl,
  wrapFieldMethodEl,
  wrapFieldMutatingEl,
  wrapFieldNameEl,
  wrapFieldUrlEl,
  wrapWrapperDeleteEl,
  wrapWrapperFormEl,
  wrapWrapperModalEl,
  wrapWrapperNewEl,
  wrapWrapperRefreshEl,
  wrapWrapperSaveEl,
} from './settings-wrap-dom';
import { loadWrapWrappers, newWrapWrapper, populateAuthOptions, renderWrapWrappers, showWrapperResult, slugifyWrapperId } from './settings-wrap-list';
import { buildWrapperPayload, hostFromUrl, openWrapWrapperModal, readWrapperForm, resolveWrapperAuth, selectedWrapMethods, setWrapperForm, updateCredentialPanel } from './settings-wrap-modal';
import { loadWrapSettings } from './settings-wrap-secrets';
import { wrapState } from './settings-wrap-store';

wrapWrapperRefreshEl.addEventListener('click', () => {
  void loadWrapWrappers(undefined, false);
});

wrapWrapperNewEl.addEventListener('click', newWrapWrapper);

wrapFieldNameEl.addEventListener('input', () => {
  if (!wrapState.idTouched) wrapFieldIdEl.value = slugifyWrapperId(wrapFieldNameEl.value);
});

wrapFieldNameEl.addEventListener('input', () => {
  if (!wrapState.idTouched) wrapFieldIdEl.value = slugifyWrapperId(wrapFieldNameEl.value);
});

wrapFieldIdEl.addEventListener('input', () => {
  wrapState.idTouched = wrapFieldIdEl.value.trim().length > 0;
});

wrapFieldMethodEl.addEventListener('change', () => {
  const methods = selectedWrapMethods();
  wrapFieldMutatingEl.checked = methods.some((method) => !['GET', 'HEAD'].includes(method));
});

wrapFieldAuthEl.addEventListener('change', updateCredentialPanel);

/** When to use: a wrapper-panel helper. */
export const prefillCredentialHost = () => {
  if (wrapFieldAuthEl.value === '__new__' && !wrapCredentialHostsEl.value.trim()) {
    const host = hostFromUrl(wrapFieldUrlEl.value);
    if (host) wrapCredentialHostsEl.value = host;
  }
};

wrapFieldUrlEl.addEventListener('input', prefillCredentialHost);
wrapFieldUrlEl.addEventListener('blur', prefillCredentialHost);

wrapCredentialHeaderEl.addEventListener('change', () => {
  if (
    wrapCredentialHeaderEl.value.trim().toLowerCase() !== 'authorization' &&
    wrapCredentialPrefixEl.value === 'Bearer '
  ) {
    wrapCredentialPrefixEl.value = '';
  }
});

wrapFieldUrlEl.addEventListener('blur', prefillCredentialHost);

wrapCredentialHeaderEl.addEventListener('change', () => {
  if (
    wrapCredentialHeaderEl.value.trim().toLowerCase() !== 'authorization' &&
    wrapCredentialPrefixEl.value === 'Bearer '
  ) {
    wrapCredentialPrefixEl.value = '';
  }
});

wrapWrapperFormEl.addEventListener('submit', async (event) => {
  event.preventDefault();

  const form = readWrapperForm();
  if (form.errors.length) {
    showWrapperResult('error', form.errors.join(' '));
    return;
  }

  wrapWrapperSaveEl.disabled = true;
  wrapWrapperSaveEl.classList.add('loading');
  try {
    const auth = await resolveWrapperAuth(wrapFieldAuthEl.value, form.url);
    if (auth === null) return;

    const result = await window.electronAPI?.saveWrapWrapper(buildWrapperPayload(form, auth));
    if (result?.ok) {
      const savedId = result.wrapper?.id || form.id;
      await loadWrapWrappers(savedId, false);
      wrapWrapperModalEl.close();
    } else {
      showWrapperResult('error', (result?.errors || []).join('; ') || 'Save failed.');
    }
  } catch (err: any) {
    showWrapperResult('error', `Save failed: ${err?.message || err}`);
  } finally {
    wrapWrapperSaveEl.disabled = false;
    wrapWrapperSaveEl.classList.remove('loading');
  }
});

wrapWrapperDeleteEl.addEventListener('click', async () => {
  if (!wrapState.selectedId) return;
  if (!window.confirm(`Delete wrapper "${wrapState.selectedId}"? Credentials are kept.`)) return;
  const result = await window.electronAPI?.deleteWrapWrapper(wrapState.selectedId);
  if (result?.ok) {
    await loadWrapWrappers(undefined, false);
    wrapWrapperModalEl.close();
  } else {
    showWrapperResult('error', (result?.errors || []).join('; ') || 'Delete failed.');
  }
});
