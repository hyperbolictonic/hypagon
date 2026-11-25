/**
 * Classify a one-shot yt-dlp run into the media surface's error shape.
 *
 * Metadata, captions and previews all run the same one-shot process and all
 * have to tell three cases apart: the timeout, the response cap, and a non-zero
 * exit that may be a signed-out session. The wording differs per call site; the
 * classification does not.
 */
import { needsLogin } from './auth.ts';
import type { CommandResult } from './exec.ts';

/** The per-call wording for a failed one-shot run. */
export interface ProcessFailureCopy {
  /** Timeout sentence, without the seconds ("... did not answer within" → "... within 20s"). */
  timeout: string;
  /** Trailing stderr lines kept for the detail. */
  detailLines: number;
  /** Characters of the joined stderr kept. */
  detailChars: number;
  /** Error when the site wants a login and stderr says nothing useful. */
  loginFallback?: string;
  /** Error when the run simply failed and stderr says nothing useful. */
  exitFallback?: string;
}

/** When to use: mapping a `CommandResult` to the media error result, or null on success. */
export function processFailure(
  result: CommandResult,
  copy: ProcessFailureCopy,
  options: { timeoutMs: number; overflowError?: string },
): { ok: false; code: string; error: string } | null {
  if (result.timedOut) {
    return { ok: false, code: 'TIMEOUT', error: `${copy.timeout} ${options.timeoutMs / 1000}s` };
  }
  if (result.overflowed && options.overflowError) {
    return { ok: false, code: 'RESPONSE_TOO_LARGE', error: options.overflowError };
  }
  if (result.code === 0) return null;

  const detail = result.stderr.trim().split(/\r?\n/u).slice(-copy.detailLines).join(' ').slice(0, copy.detailChars);
  const exitFallback = copy.exitFallback ?? `The downloader exited with code ${result.code ?? 'unknown'}`;
  if (needsLogin(result.stderr)) {
    return { ok: false, code: 'LOGIN_REQUIRED', error: detail || copy.loginFallback || exitFallback };
  }
  return { ok: false, code: 'EXTRACT_FAILED', error: detail || exitFallback };
}
