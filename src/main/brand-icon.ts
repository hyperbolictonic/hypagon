/**
 * The brand mark for main-process surfaces (window icon, tray, notifications).
 *
 * Why one module: the tray, the human-in-the-loop notifications and the
 * BrowserWindow icon each re-derived the same two-candidate lookup (packaged
 * app reads the asset from inside the asar; development reads the repo copy),
 * and a rename of the asset would have needed three edits.
 */
import fs from 'node:fs';
import path from 'node:path';
import { app, nativeImage } from 'electron';

/** When to use: a surface that needs the asset path itself (window icon). */
export function brandIconPath(): string | undefined {
  const candidates = [
    path.join(app.getAppPath(), 'public/assets/brand/hypagon-gateway-primary.png'),
    path.join(app.getAppPath(), 'dist/assets/brand/hypagon-gateway-primary.png'),
  ];
  return candidates.find((candidate) => fs.existsSync(candidate));
}

/**
 * When to use: a tray/HIL icon — the brand mark at the requested square size,
 * or an empty image when no asset ships so the surface degrades gracefully.
 */
export function brandIcon(size: number): Electron.NativeImage {
  const file = brandIconPath();
  if (!file) return nativeImage.createEmpty();
  try {
    const img = nativeImage.createFromPath(file);
    if (!img.isEmpty()) return img.resize({ width: size, height: size });
  } catch {
    // Fall through to the empty image.
  }
  return nativeImage.createEmpty();
}
