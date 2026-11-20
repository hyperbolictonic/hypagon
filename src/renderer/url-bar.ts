/**
 * The address bar: manual navigation on submit, plus the back / forward / reload buttons.
 *
 * Owns its four controls; the entry point only imports it for the side effects.
 */
import { hideUrlSuggestions } from './url-suggestions';

const urlForm = document.getElementById('url-form') as HTMLFormElement;
const urlInput = document.getElementById('url-input') as HTMLInputElement;

// Form Submit (Manual Navigation)
urlForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  hideUrlSuggestions();
  const url = urlInput.value.trim();
  if (!url) return;
  if (window.electronAPI) {
    await window.electronAPI.navigate(url);
  }
});

// URL-bar suggestions: lexical history/bookmarks immediately, semantic recall after a debounce.
/** When to use: greying out Back when the active tab cannot go back. */
export const navBackBtn = document.getElementById('nav-back-btn') as HTMLButtonElement | null;
/** When to use: greying out Forward when the active tab cannot go forward. */
export const navForwardBtn = document.getElementById('nav-forward-btn') as HTMLButtonElement | null;
/** When to use: the reload control in the address bar. */
export const navReloadBtn = document.getElementById('nav-reload-btn') as HTMLButtonElement | null;

navBackBtn?.addEventListener('click', () => {
  void window.electronAPI?.goBack();
});
navForwardBtn?.addEventListener('click', () => {
  void window.electronAPI?.goForward();
});
navReloadBtn?.addEventListener('click', () => {
  void window.electronAPI?.reload();
});
