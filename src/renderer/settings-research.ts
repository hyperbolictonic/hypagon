/**
 * The research / stealth settings tab: search engines, proxy, cooldowns, crawl limits and HIL.
 *
 * Owns its element handles and its two handlers. `loadResearchSettings` is exported for the
 * settings tab switcher, so this module has no dependency on the entry point.
 */

const researchFormEl = document.getElementById('settings-research-form') as HTMLFormElement;
  const researchEnabledEl = document.getElementById('settings-research-enabled') as HTMLInputElement;
  const researchEnginesEl = document.getElementById('settings-research-engines') as HTMLInputElement;
  const researchUrlTemplateEl = document.getElementById('settings-research-url-template') as HTMLInputElement;
  const researchProxyEl = document.getElementById('settings-research-proxy') as HTMLInputElement;
  const researchCooldownEl = document.getElementById('settings-research-cooldown') as HTMLInputElement;
  const researchDelayEl = document.getElementById('settings-research-delay') as HTMLInputElement;
  const researchConcurrencyEl = document.getElementById('settings-research-concurrency') as HTMLInputElement;
  const researchPreferLlmEl = document.getElementById('settings-research-prefer-llm') as HTMLInputElement;
  const researchMaxPagesEl = document.getElementById('settings-research-max-pages') as HTMLInputElement;
  const researchMaxSourcesEl = document.getElementById('settings-research-max-sources') as HTMLInputElement;
  const researchMaxResultsEl = document.getElementById('settings-research-max-results') as HTMLInputElement;
  const researchActivateEl = document.getElementById('settings-research-activate-view') as HTMLInputElement;
const researchPreferStaticEl = document.getElementById('settings-research-prefer-static') as HTMLInputElement;
const researchHumanEl = document.getElementById('settings-research-human') as HTMLInputElement;
const researchHilTimeoutEl = document.getElementById('settings-research-hil-timeout') as HTMLInputElement;
  const researchResultEl = document.getElementById('settings-research-result') as HTMLElement;
  const researchResetEl = document.getElementById('settings-research-reset') as HTMLButtonElement;

  const showResearchResult = (kind: 'success' | 'error' | 'info', text: string) => {
    researchResultEl.className = `alert alert-${kind} alert-sm font-mono text-xs`;
    researchResultEl.textContent = text;
    researchResultEl.classList.remove('hidden');
  };

  /** When to use: the Settings → Research tab is opened — read the saved stealth settings. */
export async function loadResearchSettings(): Promise<void> {
    try {
      const settings = await window.electronAPI?.getResearchSettings();
      if (!settings) return;
      researchEnabledEl.checked = Boolean(settings.enabled);
      researchEnginesEl.value = Array.isArray(settings.engineChain) ? settings.engineChain.join(', ') : '';
      researchUrlTemplateEl.value = settings.urlTemplate || '';
      researchProxyEl.value = settings.proxyUrl || '';
      researchCooldownEl.value = String(settings.domainCooldownSec ?? 300);
      researchDelayEl.value = String(settings.delayMs ?? 1000);
      researchConcurrencyEl.value = String(settings.crawlConcurrency ?? 1);
      researchPreferLlmEl.checked = settings.preferLlm !== false;
      researchPreferStaticEl.checked = settings.preferStatic !== false;
      researchHumanEl.checked = settings.humanInLoop !== false;
      researchHilTimeoutEl.value = String(settings.hilTimeoutSec ?? 300);
      researchMaxPagesEl.value = String(settings.defaultMaxPages ?? 5);
      researchMaxSourcesEl.value = String(settings.defaultMaxSources ?? 5);
      researchMaxResultsEl.value = String(settings.searchMaxResults ?? 8);
      researchActivateEl.checked = settings.activateView !== false;
    } catch (err: any) {
      showResearchResult('error', `Could not load research settings: ${err?.message || err}`);
    }
  }

  researchFormEl.addEventListener('submit', async (event) => {
    event.preventDefault();
    const submit = researchFormEl.querySelector<HTMLButtonElement>('button[type="submit"]');
    if (submit) {
      submit.disabled = true;
      submit.classList.add('loading');
    }
    try {
      const result = await window.electronAPI?.saveResearchSettings({
        enabled: researchEnabledEl.checked,
        engineChain: researchEnginesEl.value,
        urlTemplate: researchUrlTemplateEl.value.trim(),
        proxyUrl: researchProxyEl.value.trim(),
        domainCooldownSec: Number(researchCooldownEl.value) || 300,
        delayMs: Number(researchDelayEl.value) || 0,
        crawlConcurrency: Number(researchConcurrencyEl.value) || 1,
        preferLlm: researchPreferLlmEl.checked,
        preferStatic: researchPreferStaticEl.checked,
        humanInLoop: researchHumanEl.checked,
        hilTimeoutSec: Number(researchHilTimeoutEl.value) || 300,
        defaultMaxPages: Number(researchMaxPagesEl.value) || 5,
        defaultMaxSources: Number(researchMaxSourcesEl.value) || 5,
        searchMaxResults: Number(researchMaxResultsEl.value) || 8,
        activateView: researchActivateEl.checked,
      });
      if (result?.ok) {
        showResearchResult('success', 'Research stealth settings saved. They apply to the next search/crawl.');
        await loadResearchSettings();
      } else {
        showResearchResult('error', (result?.errors || []).join('; ') || 'Save failed.');
      }
    } catch (err: any) {
      showResearchResult('error', `Save failed: ${err?.message || err}`);
    } finally {
      if (submit) {
        submit.disabled = false;
        submit.classList.remove('loading');
      }
    }
  });

  researchResetEl.addEventListener('click', async () => {
    if (!window.confirm('Clear research cookies, cache, and domain cooldowns?')) return;
    try {
      const result = await window.electronAPI?.resetResearchSession();
      showResearchResult(result?.ok ? 'success' : 'error', result?.ok ? 'Research session cleared.' : result?.error || 'Reset failed.');
    } catch (err: any) {
      showResearchResult('error', `Reset failed: ${err?.message || err}`);
    }
  });
