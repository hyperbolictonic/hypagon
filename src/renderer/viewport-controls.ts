/**
 * Human-facing Responsive device controls, rendered inside the Command Deck.
 *
 * The deck is its own native view, so these controls can live inline without the popup-window
 * workaround the old top-toolbar button needed. Agents use the smaller `browser_viewport` tool.
 *
 * Why this file is a class: the panel has one piece of state (`current`, `profiles`, and the
 * `suppress` flag that stops an input change from re-triggering the set it just caused) and
 * four render/apply rules over it. One object keeps them together, and `initViewportControls`
 * only resolves the nodes and wires the events.
 */
import type { ElectronAPI } from '../preload/index.js';
import type { DeviceProfile, ViewportState } from '../shared/viewport.js';
import { byId } from './dom.js';

const api = (window as unknown as { electronAPI?: ElectronAPI }).electronAPI;

/** When to use: `ViewportControls` — the nodes the deck renders. */
interface ViewportNodes {
  presetSelect: HTMLSelectElement;
  fitButton: HTMLButtonElement | null;
  editButton: HTMLButtonElement | null;
  detail: HTMLElement | null;
  widthInput: HTMLInputElement | null;
  heightInput: HTMLInputElement | null;
  dprInput: HTMLInputElement | null;
  mobileInput: HTMLInputElement | null;
  touchInput: HTMLInputElement | null;
  rotateButton: HTMLButtonElement | null;
  saveButton: HTMLButtonElement | null;
  fitDetailButton: HTMLButtonElement | null;
  profilesList: HTMLElement | null;
  devtoolsButton: HTMLButtonElement | null;
}

/** When to use: `initViewportControls` — one controller per deck. */
class ViewportControls {
  private readonly nodes: ViewportNodes;
  private current: ViewportState | null = null;
  private profiles: DeviceProfile[] = [];
  /** True while `applyState` writes the inputs, so their change events are ignored. */
  private suppress = false;

  constructor(nodes: ViewportNodes) {
    this.nodes = nodes;
  }

  /** Wire every control in the panel. */
  wire(): void {
    const n = this.nodes;

    n.presetSelect.addEventListener('change', () => {
      if (this.suppress) return;
      if (n.presetSelect.value === '__off__') {
        void api?.resetViewport().then((state) => this.applyState(state));
        return;
      }
      if (!n.presetSelect.value) return;
      void this.applyPreset(n.presetSelect.value);
    });
    for (const input of [n.widthInput, n.heightInput, n.dprInput]) {
      input?.addEventListener('change', () => void this.applyCustom());
    }
    for (const input of [n.mobileInput, n.touchInput]) {
      input?.addEventListener('change', () => void this.applyCustom());
    }

    n.fitButton?.addEventListener('click', async () => this.applyState(await api?.resetViewport()));
    n.fitDetailButton?.addEventListener('click', async () => this.applyState(await api?.resetViewport()));
    n.rotateButton?.addEventListener('click', async () => this.applyState(await api?.setViewport({ action: 'rotate' })));
    n.saveButton?.addEventListener('click', () => void this.saveCurrent());
    n.editButton?.addEventListener('click', () => this.toggleDetail());
    n.devtoolsButton?.addEventListener('click', () => void api?.openDevTools());

    // Ask the main process for the current state once the deck is up.
    api?.getViewport?.().then((state) => this.applyState(state)).catch(() => undefined);
  }

  /** Render a state: the detail inputs, the preset list and the saved-device rows. */
  applyState(state: ViewportState | null | undefined): void {
    if (!state) return;
    this.current = state;
    this.profiles = state.profiles ?? this.profiles;

    this.writeDetail(state);
    this.populatePresets();
    this.nodes.presetSelect.value = !state.active
      ? '__off__'
      : state.spec && this.profiles.some((profile) => profile.id === state.spec?.profileId)
        ? state.spec.profileId
        : '';
    this.renderProfiles();
  }

  /** The OFF buttons and the width/height/dpr/mobile/touch inputs for one state. */
  private writeDetail(state: ViewportState): void {
    const n = this.nodes;
    const spec = state.spec;

    this.suppress = true;
    for (const button of [n.fitButton, n.fitDetailButton]) {
      if (!button) continue;
      button.textContent = 'OFF';
      button.disabled = !state.active;
      button.title = state.active ? 'Switch off device emulation' : 'No device emulation is active';
    }
    if (state.active && spec) {
      if (n.widthInput) n.widthInput.value = String(spec.width);
      if (n.heightInput) n.heightInput.value = String(spec.height);
      if (n.dprInput) n.dprInput.value = String(spec.deviceScaleFactor);
      if (n.mobileInput) n.mobileInput.checked = spec.mobile;
      if (n.touchInput) n.touchInput.checked = spec.touch;
    } else {
      if (n.widthInput) n.widthInput.value = '';
      if (n.heightInput) n.heightInput.value = '';
      if (n.dprInput) n.dprInput.value = '1';
      if (n.mobileInput) n.mobileInput.checked = false;
      if (n.touchInput) n.touchInput.checked = false;
    }
    this.suppress = false;
  }

  /** The preset dropdown: off, custom size, the built-in devices and the saved ones. */
  private populatePresets(): void {
    const select = this.nodes.presetSelect;
    const previous = select.value;
    select.replaceChildren();

    const off = document.createElement('option');
    off.value = '__off__';
    off.textContent = 'Off — full browser area';
    select.appendChild(off);

    const custom = document.createElement('option');
    custom.value = '';
    custom.textContent = 'Custom size';
    select.appendChild(custom);

    for (const group of [
      { label: 'Devices', list: this.profiles.filter((profile) => profile.builtin) },
      { label: 'Saved', list: this.profiles.filter((profile) => !profile.builtin) },
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
      select.appendChild(optgroup);
    }
    if (previous && this.profiles.some((profile) => profile.id === previous)) select.value = previous;
  }

  /** The saved-device rows, each with an apply button and a delete button. */
  private renderProfiles(): void {
    const host = this.nodes.profilesList;
    if (!host) return;
    host.replaceChildren();

    const custom = this.profiles.filter((profile) => !profile.builtin);
    if (custom.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'px-2 py-1 text-[10px] text-base-content/40';
      empty.textContent = 'No saved devices yet.';
      host.appendChild(empty);
      return;
    }

    for (const profile of custom) {
      const row = document.createElement('div');
      row.className = 'flex items-center gap-1';

      const apply = document.createElement('button');
      apply.type = 'button';
      apply.className = 'btn btn-ghost btn-xs flex-1 justify-start font-mono text-[10px]';
      apply.textContent = `${profile.name} · ${profile.width}×${profile.height}`;
      apply.addEventListener('click', () => void this.applyPreset(profile.id));

      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'btn btn-ghost btn-xs text-error';
      remove.textContent = '×';
      remove.title = `Delete ${profile.name}`;
      remove.addEventListener('click', async () => {
        const result = await api?.deleteDeviceProfile(profile.id);
        if (!result) return;
        this.profiles = result.profiles;
        this.renderProfiles();
        this.populatePresets();
      });

      row.append(apply, remove);
      host.appendChild(row);
    }
  }

  /** Apply a preset by id. */
  private async applyPreset(id: string): Promise<void> {
    if (!id) return;
    this.applyState(await api?.setViewport({ action: 'set', preset: id }));
  }

  /** Apply the typed width/height (and the dpr/mobile/touch flags). */
  private async applyCustom(): Promise<void> {
    if (this.suppress) return;
    const width = Number(this.nodes.widthInput?.value);
    const height = Number(this.nodes.heightInput?.value);
    if (!Number.isFinite(width) || !Number.isFinite(height) || width < 200 || height < 200) return;
    this.applyState(
      await api?.setViewport({
        action: 'set',
        width,
        height,
        deviceScaleFactor: Number(this.nodes.dprInput?.value) || 1,
        mobile: this.nodes.mobileInput?.checked ?? false,
        touch: this.nodes.touchInput?.checked ?? false,
      }),
    );
  }

  /** Save the active device under a human-chosen name. */
  private async saveCurrent(): Promise<void> {
    const spec = this.current?.spec;
    if (!spec) return;
    const name = window.prompt('Save this device as', `${spec.width}×${spec.height} device`);
    if (!name?.trim()) return;
    const result = await api?.saveDeviceProfile({ name: name.trim(), spec });
    if (!result) return;
    this.profiles = result.profiles;
    this.renderProfiles();
    this.populatePresets();
  }

  /** Show or hide the custom-size detail panel. */
  private toggleDetail(): void {
    const { detail, editButton } = this.nodes;
    if (!detail || !editButton) return;
    const hidden = detail.classList.toggle('hidden');
    editButton.textContent = hidden ? 'EDIT' : 'CLOSE';
    editButton.classList.toggle('btn-active', !hidden);
  }
}

/** When to use: booting the human Viewport toolbar — wire the device list and the resize actions. */
export function initViewportControls(): void {
  const presetSelect = byId<HTMLSelectElement>('viewport-preset');
  if (!presetSelect) return;

  const controls = new ViewportControls({
    presetSelect,
    fitButton: byId<HTMLButtonElement>('viewport-fit'),
    editButton: byId<HTMLButtonElement>('viewport-edit'),
    detail: byId<HTMLElement>('viewport-detail'),
    widthInput: byId<HTMLInputElement>('viewport-width'),
    heightInput: byId<HTMLInputElement>('viewport-height'),
    dprInput: byId<HTMLInputElement>('viewport-dpr'),
    mobileInput: byId<HTMLInputElement>('viewport-mobile'),
    touchInput: byId<HTMLInputElement>('viewport-touch'),
    rotateButton: byId<HTMLButtonElement>('viewport-rotate'),
    saveButton: byId<HTMLButtonElement>('viewport-save'),
    fitDetailButton: byId<HTMLButtonElement>('viewport-fit-detail'),
    profilesList: byId<HTMLElement>('viewport-profiles'),
    devtoolsButton: byId<HTMLButtonElement>('devtools-btn'),
  });

  controls.wire();

  (window as unknown as { __applyViewportState?: (state: ViewportState) => void }).__applyViewportState = (state) =>
    controls.applyState(state);
}
