# Extraction and reuse map

**Status:** architecture note · **Date:** 2026-11-17 · **Related:** [Real browser sessions](./REAL_BROWSER_SESSIONS.md), [Codebase map](./CODEBASE.md), [Control layer](./CONTROL_LAYER.md)

This note maps which parts of Hypagon Gateway are reusable in another app, which parts are
application-specific, and a concrete order for extracting a headless core. It is a plan, not an
implementation.

The short version: **do not rewrite the web stack.** Extract a `core` and keep the Electron app as
one host. HG is a strong foundation for the tool half of an internet-using agent; it is not a
general agent framework.

---

## 1. Current shape

```text
Electron shell (Command Deck, tabs, tray, updater, menus, HIL UI)
        │
        ├── BrowserChassis (~4.2k lines; state + tabs + research + viewport + policy)
        │      ├── TabManager / WebContentsView
        │      ├── Primitives / Marks / Shadow Walk / Frames / Network / Input
        │      ├── Search → Crawler → Researcher → Anchors
        │      ├── SessionVault / Cortex / Wrap / Media / Decide / JEV
        │      └── HTTP bridge / IPC
        │
        ├── MCP servers (stdio + HTTP) → tool catalog → bridge
        └── packages/ (@kuang/recipe, mcp-http, mcp-oauth, cloudflared, cloudflared-tunnel)
```

The reusable seams are real, but they are **inside** the app: `CrawlerDeps`, `SearchHubDeps`,
`PrimitivesHost`, `LlmSurfaceDeps`, injected stores. The main blocker is `BrowserChassis`, which
wires domain logic to Electron, state and UI.

---

## 2. Module map

### 2.1 Directly reusable today

| Module | Reuse | Notes |
| --- | --- | --- |
| `packages/recipe` | ✅ drop-in | Pure JSON→Markdown; no network/FS/Electron |
| `packages/mcp-http` | ✅ drop-in | Injected MCP server factory, auth, sessions, SSE |
| `packages/mcp-oauth` | ✅ drop-in | Generic OAuth authorization server |
| `packages/cloudflared` | ✅ drop-in | Managed binary, checksums, lifecycle |
| `packages/cloudflared-tunnel` | ✅ drop-in | Tunnel orchestration |
| `src/main/wrap/*` | ✅ Node | Wrapper format, executor, render, secrets, audit |
| `src/main/harvester/markdown.ts` | ✅ Node | HTML/DOM → Markdown |
| `src/main/search/*` | ✅ Node | `SearchHubDeps.load` is injected |
| `src/main/crawl/crawler.ts` | ✅ Node | `CrawlerDeps` is fully injected |
| `src/main/research/*` | ✅ Node | `ResearcherDeps`; anchors; tier policy |
| `src/main/network/impersonate.ts` | ✅ Node | Static tier; needs pinned binary |
| `src/main/llm/*` | ✅ Node | `LlmSurfaceDeps` |
| `src/main/cortex/*` | ✅ Node | LanceDB; storage dir injected |
| `src/main/media/*` | ⚠️ mostly | Some Electron imports for notifications/dialogs |
| `src/main/session/*` | ⚠️ types only | Electron types; storage semantics reusable |
| `src/main/decide/*`, `src/main/jev/*` | ✅ Node | Model calls, guards, compaction |
| `src/main/drive/*` | ⚠️ depends on Primitives | Observe→decide→act loop; reusable after the browser seam |

### 2.2 Reusable behind a browser abstraction

These import Electron **types only**, but call Electron/CDP behaviour (`wc.debugger`,
`executeJavaScript`, `capturePage`, `sendInputEvent`). They need a `BrowserTarget` adapter, not a
rewrite:

- `src/main/primitives/*` — `PrimitivesHost` is already the seam.
- `src/main/marks/*`, `shadow-walk/*`, `browser/frames*`, `network/*`, `telemetry/input-simulator`.
- `src/main/tabs/*`, `viewport/*`, `zoom/*` — tab/view orchestration and emulation.
- `src/main/snapshots/*`, `prerender/*`, `shield/*` — browser-specific behaviour.
- `src/main/downloads/*`, `scripts/*`, `tools/*` — Electron-adjacent.

### 2.3 Application-only

- `browser-chassis.ts` (state, wiring, research, viewport, HIL, policy in one object)
- Command Deck / sidebar / orb / settings UI (`index.html`, `src/renderer/*`, `ui/menu-popup`)
- Tray, auto-update, recording, native menus, session partitions, HIL toast/modal
- `http-bridge.ts` routes (thin, but hand-wired to Chassis)
- `src/main/index.ts` lifecycle

### 2.4 Import coupling at a glance

- **Runtime `electron` imports:** `hil`, `llm`, `media`, `menu`, `prerender`, `recording`,
  `snapshots`, `telemetry`, `tools`, `tray`, `ui`, `updates`.
- **Type-only `electron` imports (behaviour-coupled):** `browser`, `downloads`, `marks`,
  `network`, `primitives`, `scripts`, `session`, `shadow-walk`, `shield`, `tabs`, `viewport`.
- **No Electron imports:** `collaboration`, `cortex`, `crawl`, `decide`, `diagnostics`, `drive`,
  `harvester`, `input`, `jev`, `recipes`, `remote`, `research`, `search`, `settings`, `utils`,
  `wrap`, `zoom`.

---

## 3. Target package graph

```text
                    @hg/agent (loop, planning, context)
                                │
             ┌──────────────────┼──────────────────┐
         @hg/mcp            @hg/research        @hg/wrap
             │                  │                  │
         @hg/core ──────── @hg/browser ─────── @hg/primitives
             │                  │                  │
        @hg/memory         adapters:           @hg/dom
        @hg/session        electron | chrome   (marks, harvester,
        @hg/media          cdp | playwright      shadow, frames)
             │
        @hg/transport (mcp-http, mcp-oauth, cloudflared)
```

Rules:

- `@hg/core` has **no Electron, no browser, no network** imports. Types, policy, errors, IDs.
- `@hg/browser` defines `BrowserTarget`; adapters live beside it.
- `@hg/primitives` depends on `@hg/browser` and `@hg/dom`, never on Electron.
- `@hg/research` depends on `@hg/browser` (or a narrower `Fetcher`/`PageReader`) and `@hg/core`.
- `@hg/mcp` depends on `@hg/core` and a `ToolRuntime` interface; it never imports Chassis.
- The Electron app depends on packages; packages never depend on the app.

Namespace decision (resolved 2026-11-26): publish as `@hyperbolictonic/*` (the npm user scope). No
npm org is required, and the scope matches the GitHub owner, so npm and GitHub Packages can use the
same names. See §10.

---

## 4. Core interfaces to freeze

```ts
// @hg/core
export interface BrowserTarget {
  readonly id: string;
  readonly kind: 'electron' | 'chrome-cdp' | 'playwright';
  navigate(url: string): Promise<void>;
  evaluate<T>(script: string, opts?: { userGesture?: boolean }): Promise<T>;
  screenshot(opts?: { fullPage?: boolean }): Promise<{ png: Buffer; width: number; height: number }>;
  input(event: InputEvent): Promise<void>;
  cookies: CookieJar;
  network: NetworkTap;
  close(): Promise<void>;
}

export interface PageReader {
  markdown(url: string, opts?: { selector?: string }): Promise<PageRead>;
  html(url: string): Promise<string>;
}

export interface Fetcher {
  tryLlm?(url: string): Promise<{ content: string; via: string } | null>;
  fetchStatic?(url: string): Promise<StaticResult | { ok: false; reason: string; disabled?: boolean }>;
  render(url: string, opts?: RenderOptions): Promise<RenderResult>;
}

export interface ToolRuntime {
  invoke(tool: string, args: unknown): Promise<unknown>;
  list(): ToolDescriptor[];
}

export interface AgentLoop {
  step(state: AgentState): Promise<AgentAction>;
}
```

`PrimitivesHost` moves to `@hg/primitives` and replaces `WebContents` with `BrowserTarget`-backed
operations (`evaluate`, `snapshot`, `click`, `type`, `frames`, `sealed`, `screenshot`). The existing
`PrimitivesHost` method list is already close; the main edits are type replacement and moving
Chassis-specific helpers (marks injection, guard page reads) behind optional hooks.

---

## 5. Extraction waves

### Wave 0 — Guardrails (1–2 days)

- Add a lint/CI check: no `from 'electron'` in `packages/*/src` or future `@hg/*` packages.
- Freeze the public types above in a `packages/core` skeleton.
- Keep `tsc --noEmit` + `test:mcp:contract` green; add a package-level test runner.

### Wave 1 — Pure packages (2–3 days)

Move, with no behaviour change:

- `wrap/*` + `@kuang/recipe` → `@hg/wrap`
- `harvester/markdown.ts` + `snapshots`-independent helpers → `@hg/dom`
- `search/*`, `crawl/*`, `research/*`, `network/impersonate.ts` → `@hg/research`
- `cortex/*` → `@hg/memory`
- `session/*` model → `@hg/session`
- `media/*` → `@hg/media` (make notifications optional)
- `mcp-http`/`mcp-oauth`/`cloudflared*` keep their package names for now

Acceptance: Node-only tests run without Electron; the app imports the packages and behaves
identically; no duplicated code.

### Wave 2 — Browser abstraction (1–2 weeks)

- Define `BrowserTarget` and the reduced `PrimitivesHost`.
- Extract `primitives`, `marks`, `shadow-walk`, `frames`, `network`, `input-simulator` into
  `@hg/primitives` / `@hg/dom`.
- Implement the **Electron adapter** in the app (`ElectronTarget` wrapping `WebContents`).
- Keep `BrowserChassis` as the composition root for now; it constructs the adapter and passes it in.
- Move viewport/zoom emulation behind the adapter (Electron + Chrome both support CDP).

Acceptance: the same primitive tests pass through the Electron adapter; no Electron type appears
in `@hg/primitives`.

### Wave 3 — Chrome/CDP adapter (3–7 days)

- Add `ChromeSessionManager` + `CdpTarget` as described in
  [Real browser sessions](./REAL_BROWSER_SESSIONS.md).
- Reuse `@hg/primitives`, `@hg/research`, `@hg/mcp` unchanged.
- Prove the same tool calls work against external Chrome and Electron.

Acceptance: navigate / observe / act / extract / screenshot / cookies / viewport pass on both
adapters; lifecycle cleans up the child process and profile.

### Wave 4 — Chassis split (1–2 weeks)

- Split `BrowserChassis` into:
  - `SessionManager` (tabs, targets, lifecycle)
  - `StateStore` (state, broadcast)
  - `Policy` (JEV/consent/HIL/human activity)
  - `ResearchRuntime` (wiring search/crawl/research)
  - `ViewportRuntime`
- Leave the Electron shell as the composition root and UI adapter.
- Move the HTTP routes to `@hg/mcp`/`@hg/transport` behind `ToolRuntime`.

Acceptance: Chassis is under ~1k lines of wiring; no UI imports in core packages; bridge contract
still passes.

### Wave 5 — Agent loop (optional, separate product)

- Add `@hg/agent` above the tool runtime: plan → observe → act → evaluate → compact.
- Do **not** generalize `drive`: it is a latency primitive tied to `Primitives` and decision
  models, useful as one strategy, not the loop.
- Context/compaction can reuse JEV ideas, but the general loop is new code.

Acceptance: a minimal agent that can search, browse, cite and stop; eval harness separate.

---

## 6. What not to extract

- Command Deck/UI, tray, updater, recording, native menus, session partitions.
- The Electron `BrowserWindow`/`WebContentsView` lifecycle.
- `http-bridge` route table as a public API (make the tool runtime the contract).
- Desktop-specific security assumptions (window focus, HIL toast, OS paths).
- Chrome cookie database decryption (see the real-browser note).

---

## 7. Effort and sequencing

| Outcome | Reuse | Effort |
| --- | --- | --- |
| Another Electron desktop agent | Most of Waves 1–2 | ~2–3 weeks |
| Headless web-tool service | Waves 1–4 | ~1–2 months |
| Fidelity-first Chrome agent | Waves 1–3 + Chrome adapter | ~3–6 weeks |
| General agent framework | Waves 1–5 + new loop/evals | ~3+ months |

**Recommended order:** 0 → 1 → 2 → 3 → 4. Stop after 3 if the goal is “internet-using agent
with real Chrome”. Only do 5 if the product is the agent itself.

## 8. Risks

- **Chassis entanglement:** every extraction must keep the app green; do it behind adapters.
- **Electron-only assumptions:** `webContents.debugger`, `capturePage`, focus, session partitions.
- **Anti-bot drift:** real Chrome helps, but CDP presence and automation flags are detectable.
- **Security:** secrets, cookie vaults, native hosts, loopback CDP; bound and authenticate.
- **Testing:** packages need Node-only tests; browser tests need both adapters.
- **Namespace/versioning:** `@kuang/*` is private; publishing is a separate decision.
- **Dual maintenance:** the app must keep working during extraction; avoid long-lived forks.

## 9. Open decisions

- Is the next product a shell (stay Electron) or a service (headless core)?
- Does the first release need real Chrome, or is Electron + cookie sync enough?
- Which package gets published first: `recipe`, `mcp-http`, or `wrap`?
- Do we keep `@kuang/*` or rename to `@hypagon/*` at publication?
- Should `drive` become a strategy plugin for `@hg/agent`, or stay a standalone primitive?

---

## 10. SDK family (implementation update, 2026-11-26)

The first published family is `@hyperbolictonic/hypagon-*`. Packages are grouped by dependency
profile, not by folder, so a consumer installs only what their host can run.

| Package | Contents | Depends on |
| --- | --- | --- |
| `hypagon-browser` | `BrowserTarget`, primitives, marks, shadow DOM, frames, network/HAR, screenshots | nothing app-specific |
| `hypagon-stealth` | humanised pointer/keyboard, chaos kinematics, host profile, human-activity detection, consent shield, sealed targets | browser |
| `hypagon-research` | search hub, crawler, researcher, LLM surface, anchors/citations, static tier | `PageReader`/`Fetcher` (+ optional memory) |
| `hypagon-agent` | decide, drive, JEV | browser |
| `hypagon-memory` | Cortex/LanceDB, anchor store | native dependencies |
| `hypagon-electron` | `ElectronTarget`, detached-view reader, HIL adapter | peer `electron` |
| `hypagon-mcp` | MCP tools over a `ToolRuntime` | browser/research (optional) |

Ports every feature depends on: `BrowserTarget`, `PageReader`/`Fetcher`, `MemoryStore`,
`HumanApproval`. The Electron app supplies the adapters; another Electron host supplies its own;
a headless host supplies a Chrome/CDP target.

Milestones:

1. **M1 — browser + electron.** `BrowserTarget`, `ElectronTarget`, primitives, marks, frames,
   input, screenshots, network. Acceptance: the app runs on the package and the primitive/act/
   harvest/frames/network smoke suites pass through the adapter.
2. **M2 — stealth.** Humanised input, chaos kinematics, host profile, human activity, shield.
3. **M3 — research.** Search/crawl/research/LLM/anchors against the `Fetcher` port.
4. **M4 — agent.** Decide, drive, JEV on top of browser.
5. **M5 — memory + MCP.** Optional Cortex and the MCP wrapper.

`cloudflared`, `recipe` and `wrap` are not part of this SDK; they stay private until a separate
product needs them.

M1 currently ships `packages/browser` (the port, primitives, targeting, marks, harvesting and
component signatures) and `packages/electron` (`ElectronTarget`), with
`npm run typecheck:browser`, `npm run typecheck:electron` and `npm run test:sdk`.

What is already in `packages/browser` (app imports go through re-export shims):

- the `BrowserTarget` port and its portable types;
- `options`, `page-scripts`, the host `contracts`, `primitives` and every controller
  (`observe`, `act`, `wait`, `find`, `read`, `state`, `net`);
- shadow-aware targeting (`dom-targeting`, `text-target`, `control-facts`), frame control
  filters and projections;
- the Set-of-Marks injector and overlay, the badge formatter and component signatures;
- the construct harvester (composed-DOM serialisation plus Readability/Turndown Markdown);
- frame discovery (including OOPIF targets), frame geometry, per-frame evaluation and the
  frame-mark registry;
- network capture: the request/body buffer, the websocket/SSE registry and frame log, the CDP
  event router and the interceptor.

Remaining for M1: sealed (closed shadow root) scanning and the humanised input driver. The input
driver is the first slice of `hypagon-stealth`, because its chaos kinematics and profile belong to
that package. The host surfaces that combine these pieces (`marks-surface`,
`frames-inventory`) stay app-side until their stealth and settings dependencies are ported.

The app already uses `ElectronTarget` where the SDK expects a target (harvest, marks, frames and
network), and the host literal in `src/main/chassis/interaction-stack.ts` supplies `appIdentity` and
`detectSensitiveGate`, so no policy moved into the package.

M2 is complete. `packages/stealth` owns the movement engine, key tables, ghost cursor,
human-activity detection, profile pacing, the portable `HumanizedInput` pointer/keyboard driver
(CDP through `BrowserTarget`, with optional native, clipboard and metrics ports), the host browser
fingerprint/profile probe, the consent-wall breaker and sealed (closed shadow root) discovery
(scan, measure, cache/rate limit and tokens). The app keeps its `WebContents` adapters, supplies
the Shadow Walk settings, and registers the `sealed.*`/`cdp.*` counters through
`setSealedMetrics`.

### Live verification (2026-11-26)

An isolated dev instance (separate profile, bridge on 4113; the installed app on 4111 was never
touched) ran the live suites against the extracted code:

- browser/stealth: primitives 37, act 26, harvest 4, focus 4, sealed 21, frame marks 13, Shadow
  Walk 11, component signature 12, human activity 9, consent 2.
- research: settings 4, events 2, anchor store 2, relocation 8, static tier 8, search 6, crawl 7,
  research topic 7, LLM surface 22.

The live run found one real regression: frame marks were registered against a per-call
`ElectronTarget`, so `act(mark_id=100+)` could not resolve them. Fixed in `7ca558f` by using one
shared target per view; the frame-mark suite then passed including OOPIF clicks and typing.
`npx vite build` passes cleanly.

Both packages now ship one-call hosts: `createBrowserTools({ target })` in the browser package
(marks, frames, harvest, network; an optional input port) and
`createHumanizedBrowserTools({ target })` in stealth (the same plus the humanised driver and
sealed discovery). A new host no longer implements the whole `PrimitivesHost` surface by hand.

M3 has started: `packages/research` owns the search hub, the crawler, the researcher escalation
model, citation anchors, the durable anchor store, the citation revalidation policy and the shared
research-event types, all over injected ports (`load`, `renderPage`, `fetchStatic`, `tryLlm`,
`indexPage`, `fetch`). The app keeps the Electron surfaces, settings, detached view, hand-off and
citation controllers. `npm run typecheck:research` and the research tests are part of `test:sdk`
and CI.

Remaining milestones: the Electron research surfaces (detached view, hand-off, LLM surface,
settings), M4 (`hypagon-agent`: decide/drive/JEV) and M5 (`hypagon-memory` + `hypagon-mcp`).
Publishing is deferred until all of it is verified.
