/**
 * Responsive / device emulation contract.
 *
 * The HUD toolbar and the agent-facing `browser_viewport` tool share this shape. Sizes are CSS
 * pixels; `deviceScaleFactor` is the emulated DPR. The page is rendered by Chromium's device
 * emulation (the same path DevTools' device toolbar uses) and letterboxed inside the browsing
 * area by `fitViewport`.
 */

/** When to use: reporting whether a viewport is taller than it is wide. */
export type Orientation = 'portrait' | 'landscape';

/** When to use: a selectable device preset — shipped with the app or saved by a human. */
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

/** When to use: the emulation applied to one tab — a profile's values, or a custom size. */
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

/** When to use: a rectangle in DIP — the browsing area, or the emulated frame inside it. */
export interface ViewportRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** When to use: the HUD and `browser_viewport` status read — spec, frame, scale and profiles. */
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

/** When to use: the device dropdown and preset lookup — the phones, tablets and desktop sizes shipped with the app. */
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

/** When to use: validating or clamping a custom width/height. */
export const MIN_VIEWPORT_DIMENSION = 200;
/** When to use: validating or clamping a custom width/height. */
export const MAX_VIEWPORT_DIMENSION = 5000;
/** When to use: validating or clamping a custom device scale factor. */
export const MIN_DEVICE_SCALE = 0.5;
/** When to use: validating or clamping a custom device scale factor. */
export const MAX_DEVICE_SCALE = 5;
/** When to use: the saved-device limit the profile store enforces. */
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

/** When to use: applying a preset — the spec a `DeviceProfile` emulates. */
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

/** When to use: a `browser_viewport` set — clamp the requested size and DPR into a usable spec. */
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

/** When to use: saving a device — validate a human's profile, or null when it is unusable. */
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

/** When to use: the status read and the rotate result. */
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

/** When to use: resolving a preset id from the catalogue. */
export function findProfile(profiles: DeviceProfile[], id: string): DeviceProfile | undefined {
  return profiles.find((profile) => profile.id === id);
}
