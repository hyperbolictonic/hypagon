/**
 * How a renderer's `window.open()` / `target="_blank"` request should be handled.
 *
 * A sign-in popup must be a real child `BrowserWindow`, not a managed tab. OAuth providers
 * finish a popup flow with `window.opener.postMessage(...)` and `window.close()`; a managed
 * tab is created separately after the request is denied, so it has no opener at all. The
 * provider's message is then dropped and the original page never learns that sign-in
 * succeeded — the flow stalls on the callback page.
 *
 * Ordinary links keep the tab treatment. Only requests that Chromium already classified as
 * popups, form POSTs (whose body would be lost by re-issuing the URL as a GET), and known
 * OAuth/SAML authorization URLs are promoted to a window.
 */

export interface WindowOpenRequest {
  url: string;
  disposition: string;
  features: string;
  postBody?: unknown;
}

/** First host labels that are dedicated identity endpoints (`accounts.google.com`, ...). */
const AUTH_HOST_LABELS = new Set(['accounts', 'login', 'signin', 'signon', 'sso', 'auth']);

/** Identity providers whose registrable domain is not a generic `login.` subdomain. */
const AUTH_HOST_SUFFIXES = [
  'appleid.apple.com',
  'idmsa.apple.com',
  'microsoftonline.com',
  'okta.com',
  'okta-emea.com',
  'oktapreview.com',
  'auth0.com',
  'onelogin.com',
  'pingidentity.com',
  'pingone.com',
  'duosecurity.com',
  'jumpcloud.com',
  'sailpoint.com',
];

/** Authorization endpoints (`/oauth2/authorize`, `/o/oauth2/v2/auth`, `/saml/SSO`, ...). */
const AUTH_PATH = /(^|\/)(authorize|authorization|auth|openid|saml|sso|signin|sign-in)(\/|$)/i;

/** Query parameters that only appear on an authorization request. */
const AUTH_PARAMS = ['client_id', 'redirect_uri', 'response_type', 'saml_request'];

/**
 * True when the URL looks like an interactive sign-in or authorization endpoint. Used as a
 * fallback for providers that ask for a popup with `target="_blank"` instead of `window.open`
 * features, where Chromium reports a plain foreground-tab disposition.
 */
export function isAuthPopupUrl(rawUrl: string): boolean {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return false;

  const host = url.hostname.toLowerCase();
  if (AUTH_HOST_LABELS.has(host.split('.')[0])) return true;
  if (AUTH_HOST_SUFFIXES.some((suffix) => host === suffix || host.endsWith(`.${suffix}`))) {
    return true;
  }
  if (AUTH_PATH.test(url.pathname)) return true;
  return AUTH_PARAMS.some((name) => url.searchParams.has(name));
}

/** True when this request needs a real window to keep its opener relationship intact. */
export function isPopupWindowRequest(request: WindowOpenRequest): boolean {
  // Chromium uses `new-window` once the page asks for popup chrome or sizing.
  if (request.disposition === 'new-window') return true;
  // A features string is how `window.open(url, name, 'width=...')` requests a popup.
  if (request.features.trim() !== '') return true;
  // Re-opening a POST target as a tab would silently downgrade it to a GET.
  if (request.postBody) return true;
  return isAuthPopupUrl(request.url);
}

export interface PopupSize {
  width: number;
  height: number;
}

/** Window size requested by a `window.open` features string, clamped to something usable. */
export function popupWindowSize(features: string): PopupSize {
  let width = 520;
  let height = 720;

  for (const part of features.split(',')) {
    const separator = part.indexOf('=');
    if (separator === -1) continue;
    const key = part.slice(0, separator).trim().toLowerCase();
    const value = Number.parseInt(part.slice(separator + 1).trim(), 10);
    if (!Number.isFinite(value) || value <= 0) continue;
    if (key === 'width' || key === 'innerwidth') width = value;
    if (key === 'height' || key === 'innerheight') height = value;
  }

  return {
    width: Math.min(Math.max(width, 320), 1600),
    height: Math.min(Math.max(height, 320), 1400),
  };
}
