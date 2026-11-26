import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const COMMON_PATHS = [
  path.join(process.env.ProgramFiles || 'C:\\Program Files', 'cloudflared', 'cloudflared.exe'),
  '/opt/homebrew/bin/cloudflared',
  '/usr/local/bin/cloudflared',
  '/usr/bin/cloudflared',
  path.join(os.homedir(), '.local', 'bin', 'cloudflared'),
];

function usable(file: string): boolean {
  try {
    if (!fs.statSync(file).isFile()) return false;
    if (process.platform !== 'win32') fs.accessSync(file, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

/** Find cloudflared without installing or downloading it. */
export function findCloudflared(explicit?: string, managedPath?: string): string | undefined {
  const configured = explicit?.trim();
  if (configured) {
    if (configured.includes(path.sep) || configured.includes('/')) {
      return usable(configured) ? configured : undefined;
    }
    const fromPath = searchPath(configured);
    return fromPath || (usable(configured) ? configured : undefined);
  }

  if (managedPath && usable(managedPath)) return managedPath;
  const fromPath = searchPath('cloudflared');
  if (fromPath) return fromPath;
  return COMMON_PATHS.find(usable);
}

function searchPath(command: string): string | undefined {
  const raw = process.env.PATH || '';
  const lower = command.toLowerCase();
  const exts =
    process.platform === 'win32'
      ? (process.env.PATHEXT || '.COM;.EXE;.BAT;.CMD')
          .split(';')
          .map((extension) => extension.trim().toLowerCase())
          .filter(Boolean)
          .map((extension) => (extension.startsWith('.') ? extension : `.${extension}`))
      : [];
  const names =
    exts.length > 0 && !exts.some((extension) => lower.endsWith(extension))
      ? [command, ...exts.map((extension) => `${command}${extension}`)]
      : [command];
  for (const directory of raw.split(path.delimiter)) {
    if (!directory) continue;
    for (const name of names) {
      const candidate = path.join(directory, name);
      if (usable(candidate)) return candidate;
    }
  }
  return undefined;
}
