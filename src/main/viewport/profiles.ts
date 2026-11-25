/**
 * Saved device profiles for the human Responsive toolbar.
 *
 * Built-ins live in `src/shared/viewport.ts`; this store only owns the profiles a person created.
 * It is deliberately separate from the agent-facing tool: agents set a viewport, humans curate a
 * list of devices they keep coming back to.
 */
import fs from 'node:fs';
import path from 'node:path';

import {
  MAX_CUSTOM_PROFILES,
  normalizeDeviceProfile,
  normalizeViewportSpec,
  type DeviceProfile,
} from '../../shared/viewport.js';

interface ProfileFile {
  schemaVersion: 1;
  profiles: DeviceProfile[];
}

/** When to use: the human Viewport toolbar — save and list custom device profiles. */
export class DeviceProfileStore {
  readonly file: string;
  #profiles: DeviceProfile[];

  constructor(file: string) {
    this.file = file;
    this.#profiles = this.#load();
  }

  #load(): DeviceProfile[] {
    try {
      const parsed = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      const list = Array.isArray(parsed) ? parsed : parsed?.profiles;
      if (!Array.isArray(list)) return [];
      const seen = new Set<string>();
      const profiles: DeviceProfile[] = [];
      for (const entry of list) {
        const profile = normalizeDeviceProfile(entry);
        if (!profile || profile.builtin || seen.has(profile.id)) continue;
        seen.add(profile.id);
        profiles.push(profile);
        if (profiles.length >= MAX_CUSTOM_PROFILES) break;
      }
      return profiles;
    } catch {
      // No file yet, or a corrupt one: start empty rather than block the toolbar.
      return [];
    }
  }

  #persist(): void {
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      const payload: ProfileFile = { schemaVersion: 1, profiles: this.#profiles };
      const temp = `${this.file}.${process.pid}.tmp`;
      fs.writeFileSync(temp, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
      fs.renameSync(temp, this.file);
    } catch {
      // Best effort, same policy as the other settings stores.
    }
  }

  #idFor(name: string): string {
    const slug = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'device';
    let id = `custom-${slug}`;
    let counter = 2;
    while (this.#profiles.some((profile) => profile.id === id)) id = `custom-${slug}-${counter++}`;
    return id;
  }

  list(): DeviceProfile[] {
    return this.#profiles.map((profile) => ({ ...profile }));
  }

  save(input: { name?: unknown; spec?: unknown }): DeviceProfile | null {
    const name = typeof input.name === 'string' ? input.name.trim().slice(0, 60) : '';
    if (!name) return null;
    const spec = normalizeViewportSpec(input.spec);

    // Saving under an existing custom name replaces that profile instead of piling up duplicates.
    const existing = this.#profiles.find((profile) => profile.name.toLowerCase() === name.toLowerCase());
    const profile: DeviceProfile = {
      id: existing?.id ?? this.#idFor(name),
      name,
      width: spec.width,
      height: spec.height,
      deviceScaleFactor: spec.deviceScaleFactor,
      mobile: spec.mobile,
      touch: spec.touch,
      ...(spec.userAgent ? { userAgent: spec.userAgent } : {}),
    };

    if (existing) this.#profiles = this.#profiles.map((entry) => (entry.id === existing.id ? profile : entry));
    else this.#profiles.push(profile);

    if (this.#profiles.length > MAX_CUSTOM_PROFILES) this.#profiles = this.#profiles.slice(-MAX_CUSTOM_PROFILES);
    this.#persist();
    return { ...profile };
  }

  remove(id: string): boolean {
    const before = this.#profiles.length;
    this.#profiles = this.#profiles.filter((profile) => profile.id !== id);
    if (this.#profiles.length === before) return false;
    this.#persist();
    return true;
  }
}
