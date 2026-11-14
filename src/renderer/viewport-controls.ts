/**
 * Human-facing Responsive device controls, rendered inside the Command Deck.
 *
 * The deck is its own native view, so these controls can live inline without the popup-window
 * workaround the old top-toolbar button needed. Agents use the smaller `browser_viewport` tool.
 */
import type { ElectronAPI } from '../preload/index.js';
import type { DeviceProfile, ViewportState } from '../shared/viewport.js';

const api = (window as unknown as { electronAPI?: ElectronAPI }).electronAPI;
const byId = <T extends HTMLElement>(id: string): T | null => document.getElementById(id) as T | null;

export function initViewportControls(): void {
  const presetSelect = byId<HTMLSelectElement>('viewport-preset');
  const fitButton = byId<HTMLButtonElement>('viewport-fit');
  const editButton = byId<HTMLButtonElement>('viewport-edit');
  const status = byId<HTMLElement>('viewport-status');
  const detail = byId<HTMLElement>('viewport-detail');
  const widthInput = byId<HTMLInputElement>('viewport-width');
  const heightInput = byId<HTMLInputElement>('viewport-height');
  const dprInput = byId<HTMLInputElement>('viewport-dpr');
  const mobileInput = byId<HTMLInputElement>('viewport-mobile');
  const touchInput = byId<HTMLInputElement>('viewport-touch');
  const rotateButton = byId<HTMLButtonElement>('viewport-rotate');
  const saveButton = byId<HTMLButtonElement>('viewport-save');
  const fitDetailButton = byId<HTMLButtonElement>('viewport-fit-detail');
  const profilesList = byId<HTMLElement>('viewport-profiles');
  const devtoolsButton = byId<HTMLButtonElement>('devtools-btn');

  if (!presetSelect) return;

  let current: ViewportState | null = null;
  let profiles: DeviceProfile[] = [];
  let suppress = false;

  const renderProfiles = (): void => {
    if (!profilesList) return;
    profilesList.replaceChildren();
    const custom = profiles.filter((profile) => !profile.builtin);
    if (custom.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'px-2 py-1 text-[10px] text-base-content/40';
      empty.textContent = 'No saved devices yet.';
      profilesList.appendChild(empty);
      return;
    }
    for (const profile of custom) {
      const row = document.createElement('div');
      row.className = 'flex items-center gap-1';
      const apply = document.createElement('button');
      apply.type = 'button';
      apply.className = 'btn btn-ghost btn-xs flex-1 justify-start font-mono text-[10px]';
      apply.textContent = `${profile.name} · ${profile.width}×${profile.height}`;
      apply.addEventListener('click', () => void applyPreset(profile.id));
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'btn btn-ghost btn-xs text-error';
      remove.textContent = '×';
      remove.title = `Delete ${profile.name}`;
      remove.addEventListener('click', async () => {
        const result = await api?.deleteDeviceProfile(profile.id);
        if (result) {
          profiles = result.profiles;
          renderProfiles();
          populatePresets();
        }
      });
      row.append(apply, remove);
      profilesList.appendChild(row);
    }
  };

  const populatePresets = (): void => {
    const previous = presetSelect.value;
    presetSelect.replaceChildren();
    const auto = document.createElement('option');
    auto.value = '';
    auto.textContent = 'Custom / fit';
    presetSelect.appendChild(auto);
    for (const group of [
      { label: 'Devices', list: profiles.filter((profile) => profile.builtin) },
      { label: 'Saved', list: profiles.filter((profile) => !profile.builtin) },
    ]) {
      if (group.list.length === 0) continue;
      const optgroup = document.createElement('optgroup');
      optgroup.label = group.label;
      for (const profile of group.list) {
        const option = document.createElement('option');
        option.value = profile.id;
        option.textContent = `${profile.name} · ${profile.width}×${profile.height}`;
        optgroup.appendChild(option);
      }
      presetSelect.appendChild(optgroup);
    }
    if (previous && profiles.some((profile) => profile.id === previous)) presetSelect.value = previous;
  };

  const applyState = (state: ViewportState | null | undefined): void => {
    if (!state) return;
    current = state;
    profiles = state.profiles ?? profiles;

    suppress = true;
    const spec = state.spec;
    if (status) {
      status.textContent = state.active && spec ? `${spec.width}×${spec.height} @${spec.deviceScaleFactor}x` : 'off';
      status.className = `badge badge-xs font-mono ${state.active ? 'badge-accent' : 'badge-ghost'}`;
      status.title = state.active
        ? `Emulated viewport, fit at ${Math.round(state.scale * 100)}% of the browsing area`
        : 'Full browser area';
    }
    if (state.active && spec) {
      if (widthInput) widthInput.value = String(spec.width);
      if (heightInput) heightInput.value = String(spec.height);
      if (dprInput) dprInput.value = String(spec.deviceScaleFactor);
      if (mobileInput) mobileInput.checked = spec.mobile;
      if (touchInput) touchInput.checked = spec.touch;
    } else {
      if (widthInput) widthInput.value = '';
      if (heightInput) heightInput.value = '';
      if (dprInput) dprInput.value = '1';
      if (mobileInput) mobileInput.checked = false;
      if (touchInput) touchInput.checked = false;
    }
    suppress = false;

    populatePresets();
    presetSelect.value = spec && profiles.some((profile) => profile.id === spec.profileId) ? spec.profileId : '';
    renderProfiles();
  };

  const applyPreset = async (id: string): Promise<void> => {
    if (!id) return;
    applyState(await api?.setViewport({ action: 'set', preset: id }));
  };

  const applyCustom = async (): Promise<void> => {
    if (suppress) return;
    const width = Number(widthInput?.value);
    const height = Number(heightInput?.value);
    if (!Number.isFinite(width) || !Number.isFinite(height) || width < 200 || height < 200) return;
    applyState(
      await api?.setViewport({
        action: 'set',
        width,
        height,
        deviceScaleFactor: Number(dprInput?.value) || 1,
        mobile: mobileInput?.checked ?? false,
        touch: touchInput?.checked ?? false,
      }),
    );
  };

  const saveCurrent = async (): Promise<void> => {
    const spec = current?.spec;
    if (!spec) return;
    const name = window.prompt('Save this device as', `${spec.width}×${spec.height} device`);
    if (!name?.trim()) return;
    const result = await api?.saveDeviceProfile({ name: name.trim(), spec });
    if (result) {
      profiles = result.profiles;
      renderProfiles();
      populatePresets();
    }
  };

  presetSelect.addEventListener('change', () => {
    if (!suppress) void applyPreset(presetSelect.value);
  });
  for (const input of [widthInput, heightInput, dprInput]) {
    input?.addEventListener('change', () => void applyCustom());
  }
  for (const input of [mobileInput, touchInput]) {
    input?.addEventListener('change', () => void applyCustom());
  }

  fitButton?.addEventListener('click', async () => applyState(await api?.resetViewport()));
  fitDetailButton?.addEventListener('click', async () => applyState(await api?.resetViewport()));
  rotateButton?.addEventListener('click', async () => applyState(await api?.setViewport({ action: 'rotate' })));
  saveButton?.addEventListener('click', () => void saveCurrent());
  editButton?.addEventListener('click', () => {
    if (!detail) return;
    const hidden = detail.classList.toggle('hidden');
    editButton.textContent = hidden ? 'EDIT' : 'CLOSE';
    editButton.classList.toggle('btn-active', !hidden);
  });
  devtoolsButton?.addEventListener('click', () => void api?.openDevTools());

  api?.getViewport?.().then(applyState).catch(() => undefined);

  (window as unknown as { __applyViewportState?: (state: ViewportState) => void }).__applyViewportState = applyState;
}
