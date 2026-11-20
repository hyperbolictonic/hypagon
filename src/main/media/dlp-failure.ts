/**
 * One vocabulary for a failed yt-dlp run.
 *
 * Three call sites read the same `CommandResult` (metadata, captions, downloads) and
 * must report the same thing: a timeout says the tool did not finish, and a non-zero
 * exit quotes the last few stderr lines rather than dumping the whole log.
 *
 * When to use: after `runYtDlpProcess` returns, to build the `{ ok: false, code, error }`
 * the media surface publishes.
 */

/** When to use: reporting a run that hit its ceiling — the code is always `TIMEOUT`. */
export function timeoutFailure(timeoutMs: number, what: string): { ok: false; code: string; error: string } {
  return { ok: false, code: 'TIMEOUT', error: `${what} did not finish in ${timeoutMs / 1000}s` };
}

/** When to use: quoting the end of a failed run's stderr, where the reason usually is. */
export function stderrDetail(stderr: string, lines = 4, chars = 500): string {
  return stderr.trim().split(/\r?\n/u).slice(-lines).join(' ').slice(0, chars);
}
