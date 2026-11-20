/**
 * The app's brand icon on disk, shared by the tray and the notifier.
 *
 * Dev and packaged builds keep the asset in different folders; one lookup keeps both
 * call sites from drifting.
 *
 * When to use: building a nativeImage for the tray or a toast icon.
 */

import fs from 'node:fs';
import path from 'node:path';
import { app } from 'electron';

/** When to use: locating the primary brand PNG for the current build (null when absent). */
export function brandIconPath(): string | null {
  const candidates = [
    path.join(app.getAppPath(), 'public/assets/brand/hypagon-gateway-primary.png'),
    path.join(app.getAppPath(), 'dist/assets/brand/hypagon-gateway-primary.png'),
  ];

  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}
