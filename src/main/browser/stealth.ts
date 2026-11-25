/**
 * Presenting as the host browser: the UA plus the client-hint headers that go with it.
 *
 * Why a module: three surfaces inject a page that must look like the human's own
 * browser — browsing tabs, prerendered views and the research session — and they
 * were carrying three copies of the same four headers. One projection of the host
 * profile keeps them consistent.
 */
import type { HostBrowserProfile } from '../telemetry/host-fingerprint.js';

/** When to use: any request that must carry the host's client hints. */
export function stealthHeaders(
  profile: HostBrowserProfile,
  options: { mobile?: boolean } = {},
): Record<string, string> {
  const headers: Record<string, string> = {
    'User-Agent': profile.userAgent,
    'sec-ch-ua': profile.secChUa,
    'sec-ch-ua-platform': profile.secChUaPlatform,
  };
  // The research session predates the mobile hint; keep its header set unchanged.
  if (options.mobile !== false) headers['sec-ch-ua-mobile'] = '?0';
  return headers;
}

/** When to use: a `WebContents` that must present as the host browser. */
export function applyHostProfile(wc: Electron.WebContents, profile: HostBrowserProfile): void {
  wc.setUserAgent(profile.userAgent);
  applyStealthHeaders(wc.session, profile);
}

/** When to use: a bare session (the research view) that only needs the headers. */
export function applyStealthHeaders(
  session: Pick<Electron.Session, 'webRequest'>,
  profile: HostBrowserProfile,
  options: { mobile?: boolean } = {},
): void {
  session.webRequest.onBeforeSendHeaders((details, callback) => {
    Object.assign(details.requestHeaders, stealthHeaders(profile, options));
    callback({ requestHeaders: details.requestHeaders });
  });
}
