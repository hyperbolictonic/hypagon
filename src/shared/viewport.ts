/**
 * Responsive / device emulation contract.
 *
 * The HUD toolbar and the agent-facing `browser_viewport` tool share this shape. Sizes are CSS
 * pixels; `deviceScaleFactor` is the emulated DPR. The page is rendered by Chromium's device
 * emulation (the same path DevTools' device toolbar uses) and letterboxed inside the browsing
 * area by `fitViewport`.
 */

/** When to use: label the current device orientation in the HUD and tool results. */
export type Orientation = 'portrait' | 'landscape';

/** When to use: describe one emulated device, built-in or human-added, in the profile picker. */
export interface DeviceProfile {
  id: string;
  name: string;
  /** CSS pixels, portrait orientation. */
  width: number;
  height: number;
  deviceScaleFactor: number;
  mobile: boolean;
  touch: boolean;
  /** Optional UA override for sites that branch on a mobile UA. */
  userAgent?: string;
  /** Built-ins are shipped with the app and cannot be deleted. */
  builtin?: boolean;
}

/** When to use: carry the active emulation settings between the HUD, IPC and `browser_viewport`. */
export interface ViewportSpec {
  /** Profile id, or `custom` after the human edits width/height/DPR by hand. */
  profileId: string;
  width: number;
  height: number;
  deviceScaleFactor: number;
  mobile: boolean;
  touch: boolean;
  userAgent?: string;
}

/** When to use: place the native browsing view inside the letterboxed emulation area. */
export interface ViewportRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** When to use: read emulation as one snapshot - active spec, frame, scale and profile list. */
export interface ViewportState {
  active: boolean;
  spec: ViewportSpec | null;
  orientation: Orientation;
  /** Space available to the browsing view, in DIP. */
  available: { width: number; height: number };
  /** Where the emulated view sits inside the available space, in DIP. */
  frame: ViewportRect;
  /** 1 when the device fits at 100%, otherwise the shrink factor applied by emulation. */
  scale: number;
  profiles: DeviceProfile[];
}

/** When to use: seed the profile picker; these ship with the app and cannot be deleted. */
export const BUILTIN_PROFILES: DeviceProfile[] = [
  {
    id: 'iphone-15',
    name: 'iPhone 15',
    width: 393,
    height: 852,
    deviceScaleFactor: 3,
    mobile: true,
    touch: true,
    builtin: true,
  },
  {
    id: 'iphone-15-pro-max',
    name: 'iPhone 15 Pro Max',
    width: 430,
    height: 932,
    deviceScaleFactor: 3,
    mobile: true,
    touch: true,
    builtin: true,
  },
  {
    id: 'pixel-8',
    name: 'Pixel 8',
    width: 412,
    height: 915,
    deviceScaleFactor: 2.625,
    mobile: true,
    touch: true,
    builtin: true,
  },
  {
    id: 'galaxy-s24',
    name: 'Galaxy S24',
    width: 360,
    height: 780,
    deviceScaleFactor: 3,
    mobile: true,
    touch: true,
    builtin: true,
  },
  {
    id: 'ipad-mini',
    name: 'iPad mini',
    width: 744,
    height: 1133,
    deviceScaleFactor: 2,
    mobile: true,
    touch: true,
    builtin: true,
  },
  {
    id: 'ipad-air',
    name: 'iPad Air',
    width: 820,
    height: 1180,
    deviceScaleFactor: 2,
    mobile: true,
    touch: true,
    builtin: true,
  },
  {
    id: 'laptop',
    name: 'Laptop 1280',
    width: 1280,
    height: 800,
    deviceScaleFactor: 1,
    mobile: false,
    touch: false,
    builtin: true,
  },
  {
    id: 'desktop',
    name: 'Desktop 1440',
    width: 1440,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false,
    touch: false,
    builtin: true,
  },
];

/** When to use: clamp width/height so an emulated page stays renderable. */
export const MIN_VIEWPORT_DIMENSION = 200;
/** When to use: clamp width/height to the largest sane emulated device. */
export const MAX_VIEWPORT_DIMENSION = 5000;
/** When to use: clamp an emulated DPR below the smallest useful value. */
export const MIN_DEVICE_SCALE = 0.5;
/** When to use: clamp an emulated DPR above the largest useful value. */
export const MAX_DEVICE_SCALE = 5;
/** When to use: cap how many human-added profiles are stored in settings. */
export const MAX_CUSTOM_PROFILES = 50;

/** Empty space kept around the emulated device inside the browsing area. */
export const VIEWPORT_MARGIN = 16;

function clampNumber(value: unknown, fallback: number, min: number, max: number): number {
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(max, Math.max(min, numeric));
}

function clampDimension(value: unknown, fallback: number): number {
  return Math.round(clampNumber(value, fallback, MIN_VIEWPORT_DIMENSION, MAX_VIEWPORT_DIMENSION));
}

function clampDeviceScale(value: unknown, fallback: number): number {
  return Math.round(clampNumber(value, fallback, MIN_DEVICE_SCALE, MAX_DEVICE_SCALE) * 100) / 100;
}

/** When to use: turn a stored device profile into the active emulation spec. */
export function specFromProfile(profile: DeviceProfile): ViewportSpec {
  return {
    profileId: profile.id,
    width: profile.width,
    height: profile.height,
    deviceScaleFactor: profile.deviceScaleFactor,
    mobile: profile.mobile,
    touch: profile.touch,
    ...(profile.userAgent ? { userAgent: profile.userAgent } : {}),
  };
}

/** When to use: validate untrusted input (IPC, bridge, settings file) before applying emulation. */
export function normalizeViewportSpec(input: unknown, fallback?: ViewportSpec): ViewportSpec {
  const source = input && typeof input === 'object' && !Array.isArray(input) ? (input as Record<string, unknown>) : {};
  const base = fallback ?? specFromProfile(BUILTIN_PROFILES[0]!);
  const width = clampDimension(source.width, base.width);
  const height = clampDimension(source.height, base.height);
  return {
    profileId: typeof source.profileId === 'string' && source.profileId ? source.profileId : 'custom',
    width,
    height,
    deviceScaleFactor: clampDeviceScale(source.deviceScaleFactor, base.deviceScaleFactor),
    mobile: typeof source.mobile === 'boolean' ? source.mobile : base.mobile,
    touch: typeof source.touch === 'boolean' ? source.touch : base.touch,
    ...(typeof source.userAgent === 'string' && source.userAgent ? { userAgent: source.userAgent } : {}),
  };
}

/** When to use: validate a custom profile before saving it to settings. */
export function normalizeDeviceProfile(input: unknown): DeviceProfile | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const source = input as Record<string, unknown>;
  const id = typeof source.id === 'string' ? source.id.trim() : '';
  const name = typeof source.name === 'string' ? source.name.trim() : '';
  if (!id || !name) return null;
  const width = clampDimension(source.width, 0);
  const height = clampDimension(source.height, 0);
  if (!width || !height) return null;
  return {
    id,
    name: name.slice(0, 60),
    width,
    height,
    deviceScaleFactor: clampDeviceScale(source.deviceScaleFactor, 1),
    mobile: source.mobile !== false,
    touch: source.touch !== false,
    ...(typeof source.userAgent === 'string' && source.userAgent ? { userAgent: source.userAgent } : {}),
    ...(source.builtin === true ? { builtin: true } : {}),
  };
}

/** When to use: label the current spec portrait or landscape for the HUD. */
export function orientationOf(spec: ViewportSpec): Orientation {
  return spec.width > spec.height ? 'landscape' : 'portrait';
}

/** Swap width/height, keeping the physical device size. */
export function rotateSpec(spec: ViewportSpec): ViewportSpec {
  return {
    ...spec,
    profileId: spec.profileId === 'custom' ? 'custom' : `${spec.profileId}@rotated`,
    width: spec.height,
    height: spec.width,
  };
}

/**
 * Fit an emulated device inside the browsing area.
 *
 * `scale` is the factor passed to Chromium's emulation so a tall phone still fits a short window.
 * The frame is the centered rectangle the native view must occupy; input and screenshots stay in
 * CSS pixels and map to the frame through this scale.
 */
export function fitViewport(
  spec: ViewportSpec,
  available: { width: number; height: number },
): { frame: ViewportRect; scale: number } {
  const maxWidth = Math.max(MIN_VIEWPORT_DIMENSION, available.width - VIEWPORT_MARGIN * 2);
  const maxHeight = Math.max(MIN_VIEWPORT_DIMENSION, available.height - VIEWPORT_MARGIN * 2);
  const scale = Math.min(1, maxWidth / spec.width, maxHeight / spec.height);
  const width = Math.max(1, Math.round(spec.width * scale));
  const height = Math.max(1, Math.round(spec.height * scale));
  return {
    frame: {
      x: Math.max(0, Math.round((available.width - width) / 2)),
      y: Math.max(0, Math.round((available.height - height) / 2)),
      width,
      height,
    },
    scale: Math.round(scale * 1000) / 1000,
  };
}

/** When to use: resolve a profile id against the merged built-in and custom list. */
export function findProfile(profiles: DeviceProfile[], id: string): DeviceProfile | undefined {
  return profiles.find((profile) => profile.id === id);
}
