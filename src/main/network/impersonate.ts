/**
 * Static fetch tier: a Chrome-identical TLS/H2 request without launching a browser.
 *
 * `hypagon-scrap`'s pinned curl-impersonate build reproduces the `curl_cffi` fingerprint
 * (JA4 + Akamai H2), so a static page can be fetched cheaply and still look like Chrome at the
 * network layer. This is deliberately a *tier*, not a replacement for rendering: any challenge,
 * error, or JS-only shell escalates to the real Chromium path.
 */
import { existsSync } from 'node:fs';
import { CurlImpersonateTransport, curlImpersonateBinaryPath } from 'hypagon-scrap';

export interface StaticFetchResult {
  status: number;
  headers: Record<string, string>;
  body: string;
  url: string;
  elapsedMs: number;
}

export type StaticFetchOutcome =
  | { kind: 'ok'; result: StaticFetchResult }
  | { kind: 'blocked'; status: number; reason: string }
  | { kind: 'unavailable'; reason: string }
  | { kind: 'error'; reason: string };

let client: CurlImpersonateTransport | null = null;
let unavailableReason: string | null = null;

/**
 * The impersonate profile fixes the TLS/H2 fingerprint (and the Chrome major). The user agent and
 * `sec-ch-ua-platform` must describe the *host*, not the profile's built-in platform — otherwise a
 * Linux box claims to be macOS, which is exactly the kind of inconsistency anti-bot systems look
 * for. TLS is platform-independent, so overriding these two headers does not desync the fingerprint.
 */
export function hostPlatformHeaders(chromeMajor: string): Record<string, string> {
  const engine = `AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chromeMajor}.0.0.0 Safari/537.36`;
  switch (process.platform) {
    case 'win32':
      return {
        'user-agent': `Mozilla/5.0 (Windows NT 10.0; Win64; x64) ${engine}`,
        'sec-ch-ua-platform': '"Windows"',
      };
    case 'darwin':
      return {
        'user-agent': `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) ${engine}`,
        'sec-ch-ua-platform': '"macOS"',
      };
    default:
      return {
        'user-agent': `Mozilla/5.0 (X11; Linux x86_64) ${engine}`,
        'sec-ch-ua-platform': '"Linux"',
      };
  }
}

function resolveProfile(): { profile: string; chromeMajor: string } {
  const profile = process.env.HYPAGON_SCRAP_PROFILE || 'chrome152';
  const match = /^chrome(\d+)/.exec(profile);
  return { profile, chromeMajor: match?.[1] ?? '152' };
}

export function impersonateAvailable(): boolean {
  if (unavailableReason) return false;
  try {
    return existsSync(curlImpersonateBinaryPath());
  } catch {
    return false;
  }
}

function getClient(): CurlImpersonateTransport | null {
  if (client) return client;
  if (!impersonateAvailable()) {
    unavailableReason =
      'curl-impersonate binary not installed (run `pnpm exec hypagon-scrap-fetch-curl`)';
    return null;
  }
  client = new CurlImpersonateTransport({ profile: resolveProfile().profile });
  return client;
}

/**
 * Hard statuses and explicit Cloudflare interstitial markers.
 *
 * Deliberately conservative: a page that merely mentions "captcha" is not a challenge, so the
 * text markers are only trusted when the response actually comes from Cloudflare.
 */
export function isChallenge(
  status: number,
  headers: Record<string, string>,
  body: string,
): boolean {
  if (status === 403 || status === 429 || status === 503) return true;

  const server = (headers.server || '').toLowerCase();
  const head = body.slice(0, 4000).toLowerCase();
  return (
    server.includes('cloudflare') &&
    /cf-chl|challenge-platform|just a moment|attention required/.test(head)
  );
}

export async function fetchStatic(
  url: string,
  opts: { timeoutMs?: number; cookieHeader?: string } = {},
): Promise<StaticFetchOutcome> {
  const transport = getClient();
  if (!transport) return { kind: 'unavailable', reason: unavailableReason! };

  // Only override headers we must. The impersonate profile owns `sec-ch-ua` / `sec-fetch`; the
  // UA and platform are overridden to describe the host OS (see hostPlatformHeaders).
  const { chromeMajor } = resolveProfile();
  const headers: Record<string, string> = hostPlatformHeaders(chromeMajor);
  if (opts.cookieHeader) headers.cookie = opts.cookieHeader;

  try {
    const response = await transport.request({
      url,
      timeoutMs: opts.timeoutMs ?? 15000,
      headers,
    });
    const body = new TextDecoder().decode(response.body);

    if (isChallenge(response.status, response.headers, body)) {
      return {
        kind: 'blocked',
        status: response.status,
        reason: `challenge page (${response.status})`,
      };
    }

    return {
      kind: 'ok',
      result: {
        status: response.status,
        headers: response.headers,
        body,
        url: response.url,
        elapsedMs: response.elapsedMs,
      },
    };
  } catch (error: any) {
    return { kind: 'error', reason: error?.message || String(error) };
  }
}
