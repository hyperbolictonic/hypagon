/**
 * Redacted, append-only audit trail for outbound wrapper calls.
 *
 * It records what an operator needs to debug a wrapper — wrapper id, method,
 * host, status, bytes, duration, error code — and never headers, bodies, query
 * strings, or secret values.
 *
 * The file is bounded: the active segment rotates at 1 MB to `<file>.1`, and
 * reads take the newest slice instead of the whole history.
 */

import fs from 'node:fs';
import path from 'node:path';

const MAX_BYTES = 1_000_000;
const MAX_READ_BYTES = 512_000;

/** When to use: one audit row — wrapper, host, status, bytes, duration and error code. */
export interface WrapAuditEntry {
  at: string;
  wrapper: string;
  host: string;
  method: string;
  status?: number;
  ok: boolean;
  bytes?: number;
  durationMs?: number;
  code?: string;
}

/** When to use: the executor's audit sink — one redacted row per wrapper call. */
export class WrapAuditLog {
  readonly file: string;

  constructor(file: string) {
    this.file = file;
  }

  append(entry: Omit<WrapAuditEntry, 'at'>): void {
    const row: WrapAuditEntry = { at: new Date().toISOString(), ...entry };
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      this.rotateIfNeeded();
      fs.appendFileSync(this.file, `${JSON.stringify(row)}\n`, { encoding: 'utf8', mode: 0o600 });
    } catch {
      // Best effort: an audit write must never fail a request.
    }
  }

  list(limit = 50): WrapAuditEntry[] {
    const count = Number.isFinite(limit) ? Math.min(500, Math.max(1, Math.floor(limit))) : 50;
    let text: string;
    try {
      text = this.readTail();
    } catch {
      return [];
    }
    return text
      .split(/\r?\n/)
      .filter(Boolean)
      .slice(-count)
      .map((line) => {
        try {
          return JSON.parse(line) as WrapAuditEntry;
        } catch {
          return undefined;
        }
      })
      .filter((entry): entry is WrapAuditEntry => Boolean(entry));
  }

  /** Keep the active segment bounded; the previous one stays as `<file>.1`. */
  private rotateIfNeeded(): void {
    try {
      if (fs.statSync(this.file).size < MAX_BYTES) return;
      const previous = `${this.file}.1`;
      try {
        fs.unlinkSync(previous);
      } catch {
        // No previous segment.
      }
      fs.renameSync(this.file, previous);
    } catch {
      // No file yet, or a refused rename: keep appending to the active file.
    }
  }

  /** Read at most the newest MAX_READ_BYTES; a partial first line is dropped. */
  private readTail(): string {
    const fd = fs.openSync(this.file, 'r');
    try {
      const { size } = fs.fstatSync(fd);
      const start = Math.max(0, size - MAX_READ_BYTES);
      const length = size - start;
      const buffer = Buffer.alloc(length);
      let offset = 0;
      while (offset < length) {
        const read = fs.readSync(fd, buffer, offset, length - offset, start + offset);
        if (read <= 0) break;
        offset += read;
      }
      const text = buffer.toString('utf8');
      if (start === 0) return text;
      const newline = text.indexOf('\n');
      return newline === -1 ? '' : text.slice(newline + 1);
    } finally {
      fs.closeSync(fd);
    }
  }
}
