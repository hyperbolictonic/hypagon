import fs from 'node:fs';
import path from 'node:path';
import { createTokenFile, readTokenFile } from '../token-file.ts';

/** When to use: resolve the remote gateway's capability-token path under its data directory. */
export function remoteTokenFile(remoteDir: string): string {
  return path.join(remoteDir, 'token');
}

/** When to use: rotate the remote-gateway token on app start. The caller owns the directory. */
export function createRemoteToken(remoteDir: string): string {
  fs.mkdirSync(remoteDir, { recursive: true });
  return createTokenFile(remoteTokenFile(remoteDir));
}

/** When to use: authenticate a remote request against the token file on disk. */
export function readRemoteToken(file: string): string | undefined {
  return readTokenFile(file);
}
