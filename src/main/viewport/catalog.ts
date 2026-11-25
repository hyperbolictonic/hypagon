/**
 * The device-preset catalogue: the built-ins plus the humans' saved profiles.
 *
 * Why a module: resolving a preset name, saving a custom device and deleting one are
 * the only operations that touch the profile store, and none of them cares which tab
 * is active or how the emulation is applied.
 */
import { BUILTIN_PROFILES, findProfile, specFromProfile, type DeviceProfile, type ViewportSpec } from '../../shared/viewport.js';
import type { DeviceProfileStore } from './profiles.js';

/** When to use: `ViewportController` — one catalogue per controller. */
export class ProfileCatalog {
  private readonly store: DeviceProfileStore;

  constructor(store: DeviceProfileStore) {
    this.store = store;
  }

  /** Every selectable device: the built-ins first, then the saved ones. */
  list(): DeviceProfile[] {
    return [...BUILTIN_PROFILES, ...this.store.list()];
  }

  /** Persist the current device under a human-chosen name. Humans only; not exposed to agents. */
  save(input: { name?: unknown; spec?: unknown }): { ok: boolean; profiles: DeviceProfile[] } {
    const saved = this.store.save(input);
    return { ok: Boolean(saved), profiles: this.list() };
  }

  /** Remove a saved device; a built-in id is not removable. */
  remove(id: unknown): { ok: boolean; profiles: DeviceProfile[] } {
    const ok = typeof id === 'string' ? this.store.remove(id) : false;
    return { ok, profiles: this.list() };
  }

  /** The spec for a preset id (or its display name), or a refusal naming the preset. */
  resolve(preset: string): ViewportSpec {
    const profile = findProfile(this.list(), preset);
    if (profile) return specFromProfile(profile);
    const byName = this.list().find((entry) => entry.name.toLowerCase() === preset.toLowerCase());
    if (!byName) throw new Error(`Unknown device preset "${preset}".`);
    return specFromProfile(byName);
  }
}
