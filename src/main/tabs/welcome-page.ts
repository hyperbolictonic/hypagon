/**
 * The welcome/manual page a fresh tab shows.
 *
 * Why a module: the candidate list is about how the app is packaged (dev server,
 * dist, cwd), which has nothing to do with tab lifecycle.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

/** When to use: a tab with no URL, or the last tab being reset to the manual. */
export function welcomePagePath(): string {
  const candidates = [
    path.join(here, '../../public/welcome.html'),
    path.join(here, '../../dist/welcome.html'),
    path.join(here, '../../../public/welcome.html'),
    path.join(here, '../../../dist/welcome.html'),
    path.join(process.cwd(), 'public/welcome.html'),
    path.join(process.cwd(), 'dist/welcome.html'),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return candidates[0];
}
