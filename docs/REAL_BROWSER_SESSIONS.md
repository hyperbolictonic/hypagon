# Real browser sessions — options, cookies and feasibility

**Status:** exploratory note · **Date:** 2026-11-17 · **Related:** [Research mode](./RESEARCH_STEALTH.md), [Control layer](./CONTROL_LAYER.md)

This note records a design discussion about letting Hypagon Gateway use a **real Chrome
instance** (independent profile or the user's own browser) instead of, or alongside, its
Electron `WebContentsView` tabs. Nothing here is implemented yet.

The motivation is fidelity: a real Chrome process has Chrome's renderer, fonts, codecs, GPU,
network stack and native DevTools. It also makes cookie/cache sharing with the user's everyday
browser practical — which is the main reason to consider an extension.

## The three viable shapes

| Shape | What runs | Fidelity | Custom shell | Cookie/cache source |
| --- | --- | --- | --- | --- |
| **A. Independent Chrome + CDP** | A second Chrome/Chrome for Testing with its own profile | Highest (real Chrome) | Chrome's UI | Seeded into the isolated profile |
| **B. Extension + native host** | The user's Chrome; Gateway brain runs locally | Highest (actual session) | Chrome's UI | Native live session |
| **C. Extension cookie sync** | Electron tabs remain; extension mirrors sessions | Electron renderer | Command Deck | Cookies (+ limited storage) |

The existing Electron browser stays the right default for the custom Command Deck experience.
A and B are fidelity modes; C is a convenience bridge.

## A. Independent Chrome instance

Chrome can run a second instance as long as it has its **own user-data directory**:

```text
<chrome>
  --user-data-dir=<userData>/gateway-chrome/<session-id>
  --remote-debugging-port=0
  --no-first-run
  --no-default-browser-check
  --remote-allow-origins=*
```

Then read `http://127.0.0.1:<port>/json/version` and attach over CDP.

**Constraints that matter**

- Since Chrome 136, `--remote-debugging-port` is **ignored for the default profile**. A dedicated
  `--user-data-dir` is mandatory; it is also the only way to run beside the user's normal Chrome
  without hitting the profile lock.
- Use `--remote-debugging-port=0` and parse the real port. Bind loopback only; CDP has no auth.
- Prefer **Chrome for Testing** pinned to a version for reproducibility, with `CHROME_PATH` as an
  override for a locally installed Chrome.
- Headed is materially better for fingerprints than `--headless=new`. Do not pass
  `--enable-automation` (`navigator.webdriver`, automation infobar).
- CDP allows one debugger client. Gateway and a user-opened DevTools cannot both own the tab.

**Gateway integration sketch**

1. `ChromeSessionManager`: locate Chrome, create a profile dir, spawn, read the CDP endpoint.
2. Generic CDP client (`chrome-remote-interface`/`ws`, or `puppeteer-core` for lifecycle).
3. Reuse the existing tool surface: navigate, act, marks, screenshots, network, cookies, viewport.
4. Kill the process and clean the profile on session close or app quit.
5. Optionally seed approved cookies into the isolated profile via CDP `Network.setCookies`.

No extension is required for this shape. It is the cheapest route to real-Chrome fidelity.

## B. Extension + native messaging host

An extension can provide UI, content scripts, tabs and `chrome.debugger`, but it cannot host the
MCP server or the filesystem/Cortex/media stack. Those stay in a native host.

- Extension: per-site permissions, DOM/marks, tabs, `chrome.debugger` for CDP-shaped work.
- Native host: the existing Node brain; Chrome starts it via native messaging; MCP clients
  connect to a localhost endpoint.
- Effort is dominated by native-messaging installers on three platforms.

Web Store risk is real: `chrome.debugger` + localhost bridge + remote AI control is exactly the
profile reviewers scrutinise. Realistic distribution is unpacked/self-hosted or enterprise policy.

## C. Cookie and cache sync

For "I'm already logged in" the useful data is cookies, not the HTTP cache.

**Extension route (recommended)**

- `chrome.cookies` reads and writes cookies, including `HttpOnly`, for permitted hosts.
- `chrome.cookies.onChanged` gives continuous deltas (adds, updates, removals) for approved sites.
- Mirror deltas into the `SessionVault`; do a **full snapshot on reconnect** and apply deltas after.
- Push over native messaging or a localhost WebSocket. Extensions cannot receive webhooks.
- MV3 service workers are evicted: queue deltas in `chrome.storage` and replay; a persistent
  native-messaging port is more reliable than a raw WebSocket.
- Partitioned cookies (CHIPS) need `partitionKey`; Electron's cookie support for partitions is
  weaker than Chrome's, so a few sites will not round-trip perfectly.
- `localStorage`/IndexedDB have no change events. Cookie-based auth syncs well; storage-based auth
  needs polling or a content-script hook and is fragile. Service-worker Cache Storage is out of reach.

**Do not scrape Chrome's cookie database**

- Windows: DPAPI, and Chrome 127+ App-Bound Encryption ties keys to Chrome's executable/service.
- macOS: Keychain; Linux: keyring or weak “basic” encryption.
- The DB is locked while Chrome runs.
- The HTTP cache (`Cache/Cache_Data`) is internal, versioned and not a portable session format.

**Continuous sync is one-way (Chrome → Gateway)**

Two rotating copies of a session drift. A cookie Gateway rotates may not be the one Chrome uses
next. Treat the Gateway jar as a consumer, never write back, and expose last-sync/revoke controls.

## How completely can a session be "spoofed"?

For many cookie-auth sites: close enough to work. For high-risk accounts: not guaranteed.

| Signal | Transferable? |
| --- | --- |
| Cookies (incl. `HttpOnly`), localStorage, sessionStorage | Yes, with caveats |
| UA / Client Hints / locale / timezone | Yes |
| Public IP | Yes if Gateway runs on the same machine |
| TLS/H2 fingerprint | Reasonably (real Chrome, or curl-impersonate static tier) |
| Canvas/fonts/GPU/codecs | Real Chrome is closer than Electron; still not identical |
| Passwordless/passkeys, WebAuthn, client certificates | No |
| IP-bound or device-attested sessions | No |
| JS-computed auth (e.g. YouTube `SAPISIDHASH`) | Must be computed per request; not a cookie |

Google/YouTube notes: auth cookies rotate frequently (`SIDCC`, `__Secure-*PSIDCC`), copied
sessions can trigger risk challenges, and YouTube APIs using `SAPISIDHASH` need that header
derived from `SAPISID`, origin and timestamp. Ordinary signed-in browsing is the realistic target.

## Recommendation

1. Ship **A (independent Chrome + CDP)** first: highest fidelity per unit of work, no store review.
2. Add **C (one-way cookie sync)** for the "already logged in" convenience, per-site and revocable.
3. Consider **B** only if the product must live inside the user's actual Chrome session.
4. Never copy or decrypt the profile's cookie database or cache.

**Security guardrails for all shapes:** loopback-only CDP/WS, random port, per-install token for
the bridge, extension-ID allowlist in the native host, encrypted session storage, redacted logs,
explicit consent per site, and a visible pause/revoke path. Cookies are bearer credentials.

## Effort estimates

- Independent Chrome session (navigate/act/screenshot/cookies/network): **3–7 days**
- Lifecycle hardening, profile seeding, per-session isolation: **~2 weeks**
- Extension cookie sync MVP (allowlist, deltas, vault, health probe): **3–5 days**
- Extension + native host with parity: **weeks to months**

## Open questions

- Is the product a custom-shell browser (stay Electron) or a fidelity-first agent (Chrome/CDP)?
- Should the isolated Chrome profile be seeded once, or resynced on every app start?
- Which domains are allowed to sync, and who owns the revoke UI?
- Do we need to support external Chrome only, or also Edge/Brave/Chromium builds?
