/**
 * Stable paths and OS-bound helpers used by the bootstrap.
 *
 * Installed builds copy the asar-unpacked MCP servers into userData, because `resources/` is
 * temporary for portable and AppImage builds. Secrets are encrypted with Electron's OS-backed
 * `safeStorage`; the cipher is created here so the settings IPC and the wrap executor agree.
 */
import { app, safeStorage } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import type { SecretCipher } from '../wrap/secrets.js';

/**
 * A stable path to the stdio MCP server for generated client configs.
 *
 * Installed builds copy the asar-unpacked file into userData: `resources/` is temporary for
 * portable and AppImage builds, so a config pointing inside it would break after the app exits.
 * The copy is refreshed whenever the bundled file is newer (i.e. after an update).
 */
const cachedServerPaths = new Map<string, string>();
/** When to use: resolving a bundled MCP server to a stable path (copied into userData when packaged). */
export function ensureBundledServerPath(filename: string): string {
  const cached = cachedServerPaths.get(filename);
  if (cached) return cached;

  const devPath = path.join(app.getAppPath(), 'bin', filename);
  if (!app.isPackaged) {
    cachedServerPaths.set(filename, devPath);
    return devPath;
  }

  const source = path.join(process.resourcesPath, 'app.asar.unpacked', 'bin', filename);
  const target = path.join(app.getPath('userData'), 'bin', filename);
  let resolved = source;
  try {
    const sourceMtime = fs.statSync(source).mtimeMs;
    const targetMtime = fs.existsSync(target) ? fs.statSync(target).mtimeMs : 0;
    if (targetMtime < sourceMtime) {
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.copyFileSync(source, target);
    }
    resolved = target;
  } catch {
    // Worst case, point at the bundled path: correct for installed (non-portable) builds.
  }
  cachedServerPaths.set(filename, resolved);
  return resolved;
}

/** When to use: the browser MCP server path for generated client configs. */
export function ensureMcpServerPath(): string {
  return ensureBundledServerPath('mcp-server.cjs');
}

/** When to use: the REST wrapper MCP server path for generated client configs. */
export function ensureWrapServerPath(): string {
  return ensureBundledServerPath('wrap-server.cjs');
}

/** When to use: the remote gateway server path when remote access is enabled. */
export function ensureRemoteServerPath(): string {
  return ensureBundledServerPath('remote-server.cjs');
}

/** When to use: the dev-logs MCP server path for generated client configs. */
export function ensureDevlogsServerPath(): string {
  return ensureBundledServerPath('devlogs-server.cjs');
}

/** When to use: the wrapper store, secrets, audit and token directory. */
export function wrapDir(): string {
  return path.join(app.getPath('userData'), 'wrap');
}

/** When to use: the remote-access settings and token directory. */
export function remoteDir(): string {
  return path.join(app.getPath('userData'), 'remote');
}

/** When to use: constructing the wrap secret store — Electron's OS-backed safeStorage, with a Linux basic_text refusal. */
export function createSecretCipher(): SecretCipher {
  let available = false;
  let warning = '';
  try {
    available = safeStorage.isEncryptionAvailable();
    const backend =
      process.platform === 'linux' ? String((safeStorage as any).getSelectedStorageBackend?.() || '') : '';
    if (backend === 'basic_text') {
      available = false;
      warning =
        'The Linux keyring is reporting basic_text, which is not encryption. Install a keyring (GNOME Keyring or KWallet) and restart to enable secrets.';
    } else if (!available) {
      warning = 'OS-backed encryption is unavailable in this session, so secrets are disabled.';
    }
  } catch (err: any) {
    warning = `OS-backed encryption is unavailable: ${err?.message || err}`;
  }

  return {
    available: () => available,
    warning,
    encrypt: (value: string) => safeStorage.encryptString(value).toString('base64'),
    decrypt: (payload: string) => safeStorage.decryptString(Buffer.from(payload, 'base64')),
  };
}

/** When to use: the window/taskbar icon — the same mark the installer, tray and notifications use. */
/**
 * Window / taskbar icon — the same mark the installer, tray and notifications use.
 *
 * The packaged app reads it from inside the asar; development reads the repo copy.
 */
export function resolveBrandIcon(): string | undefined {
  const candidates = [
    path.join(app.getAppPath(), 'public/assets/brand/hypagon-gateway-primary.png'),
    path.join(app.getAppPath(), 'dist/assets/brand/hypagon-gateway-primary.png'),
  ];
  return candidates.find((candidate) => fs.existsSync(candidate));
}
