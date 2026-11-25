/**
 * Human input pacing (Settings -> Input).
 *
 * Owns the mouse speed, typing speed and click-dwell sliders. The values are
 * the profile the main process humanises the next input with.
 */
import type { ElectronAPI } from '../preload/index.js';
import { showAlert, validationMessage } from './settings-alert';

const api = (window as unknown as { electronAPI?: ElectronAPI }).electronAPI;

const inputForm = document.getElementById('settings-input-form') as HTMLFormElement | null;
const inputMouse = document.getElementById('input-mouse-speed') as HTMLInputElement | null;
const inputTyping = document.getElementById('input-typing-speed') as HTMLInputElement | null;
const inputDwell = document.getElementById('input-click-dwell') as HTMLInputElement | null;
const inputMouseValue = document.getElementById('input-mouse-value') as HTMLElement | null;
const inputTypingValue = document.getElementById('input-typing-value') as HTMLElement | null;
const inputDwellValue = document.getElementById('input-dwell-value') as HTMLElement | null;
const inputReset = document.getElementById('settings-input-reset') as HTMLButtonElement | null;
const inputResult = document.getElementById('settings-input-result') as HTMLElement | null;

function showInputResult(kind: 'success' | 'error' | 'info', text: string) {
  showAlert(inputResult, kind, text);
}

function syncInputLabels() {
  if (inputMouse && inputMouseValue) inputMouseValue.textContent = inputMouse.value;
  if (inputTyping && inputTypingValue) inputTypingValue.textContent = inputTyping.value;
  if (inputDwell && inputDwellValue) inputDwellValue.textContent = inputDwell.value;
}

function applyInputProfile(profile: { mouseSpeedPxPerSec: number; typingWpm: number; clickDwellMs: number }) {
  if (inputMouse) inputMouse.value = String(profile.mouseSpeedPxPerSec);
  if (inputTyping) inputTyping.value = String(profile.typingWpm);
  if (inputDwell) inputDwell.value = String(profile.clickDwellMs);
  syncInputLabels();
}

/** Read the input profile and paint the sliders. */
export async function loadInputSettings() {
  try {
    const profile = await api?.getInputProfile();
    if (profile) applyInputProfile(profile);
  } catch (err: any) {
    showInputResult('error', `Could not read the input profile: ${err?.message || err}`);
  }
}

/** Wire the pacing form once, after the settings modal markup exists. */
export function initInputSettings(): void {
  for (const slider of [inputMouse, inputTyping, inputDwell]) {
    slider?.addEventListener('input', syncInputLabels);
  }

  inputForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const result = await api?.saveInputProfile({
        mouseSpeedPxPerSec: Number(inputMouse?.value) || undefined,
        typingWpm: Number(inputTyping?.value) || undefined,
        clickDwellMs: inputDwell ? Number(inputDwell.value) : undefined,
      });
      if (result?.ok) {
        applyInputProfile(result.profile);
        showInputResult('success', 'Applied — the next click and keystroke use the new pacing.');
      } else {
        showInputResult('error', validationMessage(result));
      }
    } catch (err: any) {
      showInputResult('error', `Save failed: ${err?.message || err}`);
    }
  });

  inputReset?.addEventListener('click', () => {
    // Defaults mirror DEFAULT_INPUT_PROFILE in src/main/telemetry/input-profile.ts.
    applyInputProfile({ mouseSpeedPxPerSec: 1400, typingWpm: 220, clickDwellMs: 55 });
    showInputResult('info', 'Defaults restored in the form — press SAVE to apply.');
  });
}
