/**
 * Shadow Walk settings (Settings -> Shadow).
 *
 * Owns the shadow-DOM traversal toggles, the frame/screenshot caps, the
 * tab-walk policy and the patch-detection probe.
 */
import type { ElectronAPI } from '../preload/index.js';
import { showAlert, validationMessage } from './settings-alert';

const api = (window as unknown as { electronAPI?: ElectronAPI }).electronAPI;

const shadowFormEl = document.getElementById('settings-shadow-form') as HTMLFormElement;
const shadowEnabledEl = document.getElementById('shadow-enabled') as HTMLInputElement;
const shadowAxSealedEl = document.getElementById('shadow-ax-sealed') as HTMLInputElement;
const shadowDeepOpenEl = document.getElementById('shadow-deep-open') as HTMLInputElement;
const shadowComponentSurfaceEl = document.getElementById('shadow-component-surface') as HTMLInputElement;
const shadowPartHighlightEl = document.getElementById('shadow-part-highlight') as HTMLInputElement;
const shadowCdpStyleEl = document.getElementById('shadow-cdp-style') as HTMLInputElement;
const shadowTabWalkEl = document.getElementById('shadow-tab-walk') as HTMLInputElement;
const shadowTabStepsEl = document.getElementById('shadow-tab-steps') as HTMLInputElement;
const shadowTabRestoreEl = document.getElementById('shadow-tab-restore') as HTMLInputElement;
const shadowFrameGeometryEl = document.getElementById('shadow-frame-geometry') as HTMLInputElement;
const shadowFrameControlsEl = document.getElementById('shadow-frame-controls') as HTMLInputElement;
const shadowFrameScreenshotsEl = document.getElementById('shadow-frame-screenshots') as HTMLInputElement;
const shadowMaxFramesEl = document.getElementById('shadow-max-frames') as HTMLInputElement;
const shadowMaxControlsEl = document.getElementById('shadow-max-controls') as HTMLInputElement;
const shadowShotSideEl = document.getElementById('shadow-shot-side') as HTMLInputElement;
const shadowForceOpenEl = document.getElementById('shadow-force-open') as HTMLInputElement;
const shadowDetectEl = document.getElementById('settings-shadow-detect') as HTMLButtonElement;
const shadowDetectResultEl = document.getElementById('settings-shadow-detect-result') as HTMLElement;
const shadowPatchChip = document.getElementById('shadow-patch-chip') as HTMLElement | null;
const shadowResetEl = document.getElementById('settings-shadow-reset') as HTMLButtonElement;
const shadowResultEl = document.getElementById('settings-shadow-result') as HTMLElement;
let shadowLoaded: any = null;

const showShadowResult = (kind: 'success' | 'error' | 'info', text: string) => {
  showAlert(shadowResultEl, kind, text);
};

const refreshShadowPatchChip = (settings?: any) => {
  if (!shadowPatchChip) return;
  const armed = settings ? settings.enabled !== false && settings.shadow?.forceOpen === true : false;
  shadowPatchChip.classList.toggle('hidden', !armed);
};

/** Read the Shadow Walk settings and paint the form. */
export async function loadShadowWalkSettings(): Promise<void> {
  try {
    const settings = await api?.getShadowWalkSettings();
    if (!settings) return;
    shadowLoaded = settings;
    shadowEnabledEl.checked = settings.enabled !== false;
    shadowAxSealedEl.checked = settings.shadow?.axSealed !== false;
    shadowDeepOpenEl.checked = settings.shadow?.deepOpenRoots !== false;
    shadowComponentSurfaceEl.checked = settings.shadow?.componentSurface !== false;
    shadowPartHighlightEl.checked = settings.shadow?.partHighlight === true;
    shadowCdpStyleEl.checked = settings.shadow?.cdpStyleMatch === true;
    shadowTabWalkEl.checked = settings.shadow?.tabWalk !== false;
    shadowTabStepsEl.value = String(settings.shadow?.tabWalkMaxSteps ?? 8);
    shadowTabRestoreEl.checked = settings.shadow?.tabWalkRestoreFocus !== false;
    shadowFrameGeometryEl.checked = settings.frames?.geometry !== false;
    shadowFrameControlsEl.checked = settings.frames?.controls !== false;
    shadowFrameScreenshotsEl.checked = settings.frames?.screenshots !== false;
    shadowMaxFramesEl.value = String(settings.frames?.maxFrames ?? 6);
    shadowMaxControlsEl.value = String(settings.frames?.maxControls ?? 40);
    shadowShotSideEl.value = String(settings.frames?.screenshotMaxSide ?? 1024);
    shadowForceOpenEl.checked = settings.shadow?.forceOpen === true;
    refreshShadowPatchChip(settings);
  } catch (err: any) {
    showShadowResult('error', `Could not load Shadow Walk settings: ${err?.message || err}`);
  }
}

/** Validate and save the Shadow Walk settings. */
async function submitShadowForm(event: Event): Promise<void> {
  event.preventDefault();
  const submit = shadowFormEl.querySelector<HTMLButtonElement>('button[type="submit"]');
  if (submit) {
    submit.disabled = true;
    submit.classList.add('loading');
  }
  try {
    const base = shadowLoaded || {};
    if (shadowForceOpenEl.checked && base.shadow?.forceOpen !== true) {
      const confirmed = window.confirm(
        'Force-open changes attachShadow({mode:"closed"}) to open at document start. The page can detect it. Apply on the next navigation?'
      );
      if (!confirmed) {
        showShadowResult('info', 'Force-open was not enabled.');
        return;
      }
    }
    const result = await api?.saveShadowWalkSettings({
      enabled: shadowEnabledEl.checked,
      shadow: {
        ...(base.shadow || {}),
        deepOpenRoots: shadowDeepOpenEl.checked,
        axSealed: shadowAxSealedEl.checked,
        componentSurface: shadowComponentSurfaceEl.checked,
        partHighlight: shadowPartHighlightEl.checked,
        cdpStyleMatch: shadowCdpStyleEl.checked,
        tabWalk: shadowTabWalkEl.checked,
        tabWalkMaxSteps: Number(shadowTabStepsEl.value) || 8,
        tabWalkRestoreFocus: shadowTabRestoreEl.checked,
        forceOpen: shadowForceOpenEl.checked,
      },
      frames: {
        ...(base.frames || {}),
        geometry: shadowFrameGeometryEl.checked,
        controls: shadowFrameControlsEl.checked,
        screenshots: shadowFrameScreenshotsEl.checked,
        maxFrames: Number(shadowMaxFramesEl.value) || 6,
        maxControls: Number(shadowMaxControlsEl.value) || 40,
        screenshotMaxSide: Number(shadowShotSideEl.value) || 1024,
      },
      cloneLab: base.cloneLab || { enabled: false },
    });
    if (result?.ok) {
      shadowLoaded = result.settings;
      refreshShadowPatchChip(result.settings);
      showShadowResult('success', 'Shadow Walk settings saved. They apply to the next MCP call.');
    } else {
      showShadowResult('error', validationMessage(result));
    }
  } catch (err: any) {
    showShadowResult('error', `Save failed: ${err?.message || err}`);
  } finally {
    if (submit) {
      submit.disabled = false;
      submit.classList.remove('loading');
    }
  }
}

/** Wire the Shadow Walk form and probe once. */
export function initShadowWalkSettings(): void {
  shadowFormEl.addEventListener('submit', submitShadowForm);

  shadowResetEl.addEventListener('click', async () => {
    try {
      const result = await api?.resetShadowWalkSettings();
      if (result?.ok) {
        await loadShadowWalkSettings();
        refreshShadowPatchChip(result.settings);
        showShadowResult('success', 'Shadow Walk defaults restored.');
      } else {
        showShadowResult('error', validationMessage(result, 'Reset failed.'));
      }
    } catch (err: any) {
      showShadowResult('error', `Reset failed: ${err?.message || err}`);
    }
  });

  shadowDetectEl.addEventListener('click', async () => {
    try {
      const result = await api?.detectShadowPatch();
      const text = result
        ? `${result.applied ? 'APPLIED' : result.armed ? 'ARMED (reload to apply)' : 'NOT APPLIED'} · detectable=${result.detectable} · ${result.note}`
        : 'Detection returned no result.';
      shadowDetectResultEl.className = `alert ${result?.detectable ? 'alert-error' : 'alert-ghost'} alert-sm font-mono text-[10px]`;
      shadowDetectResultEl.textContent = text;
      shadowDetectResultEl.classList.remove('hidden');
    } catch (err: any) {
      shadowDetectResultEl.className = 'alert alert-warning alert-sm font-mono text-[10px]';
      shadowDetectResultEl.textContent = `Detection failed: ${err?.message || err}`;
      shadowDetectResultEl.classList.remove('hidden');
    }
  });

  void api
    ?.getShadowWalkSettings()
    .then((settings) => refreshShadowPatchChip(settings))
    .catch(() => undefined);

}
