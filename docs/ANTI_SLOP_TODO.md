# Anti-slop findings and TODO

**Status:** baseline established · **Date:** 2026-11-18 · **Branch:** `anti-slop-house-keeping`

The gates were installed with `npx opencode-anti-slop --hooks` and a ratchet baseline was
generated, so existing debt does not block new work. Every number below is the committed baseline;
the gates fail only when a file grows beyond it, a new undocumented export appears, or a new clone
is introduced.

## Baseline snapshot

| Gate | Baseline | Notes |
| --- | --- | --- |
| Modularity | **3 violations** across **2 files** | file/function/class size budgets (300 / 80 / 10) |
| Docs | **0 undocumented exports** across **0 files** | empty baseline — every export carries `/** When to use ... */` |
| Duplicates | **604 duplicated lines / 51,496 (1.2%)** | threshold is 3%; 29 files with clones |
| Import cycles | **0** | 5 layer rules pass across 356 files |
| Component index | refreshed with `npm run anti-slop:index` | see `docs/COMPONENT_INDEX.md` |

## Progress

- **Renderer harvest button extracted** - `renderer/main.ts` 1404 -> 1386, `harvest-button.ts` 39.
  The button and its handler moved; `switchTab` stays in the entry point and is injected through
  `setHarvestTabSink`. Verified: `npx vite build`, `test:settings:dom` (192 ids).

- **Renderer address bar extracted** - `renderer/main.ts` 1428 -> 1404, `url-bar.ts` 39.
  The submit handler and the back/forward/reload buttons moved; the three buttons are exported
  because `updateState` greys them out. Verified: `npx vite build`, `test:settings:dom` (192 ids).

- **Renderer HIL panel extracted** - `renderer/main.ts` 1519 -> 1426, `hil-panel.ts` 104.
  The docked panel owns its elements and restore state and imports the sidebar state/mode it
  temporarily overrides. One canvas call (`resizeCanvas`) was returned to the entry point where it
  belongs. Verified: `npx vite build`, `test:settings:dom` (192 ids).

- **Renderer sidebar layout extracted** - `renderer/main.ts` 1634 -> 1519, `sidebar-mode.ts` 130.
  The state module from the previous slice made this a plain move: `SIDEBAR_MODE`,
  `applySidebarMode`, `toggleSidebar`, `applySidebarState` and the orb-drag/rail handlers now
  import `sidebarState`, `sidebarPanel` and `sidebarRailToggle` instead of owning them.
  Verified: `npx vite build`, `test:settings:dom` (192 ids).

- **Sidebar state extracted** - `renderer/sidebar-state.ts` (20) now owns `sidebarState.mode`,
  `sidebarState.collabModeOn`, `sidebarPanel`, `sidebarRailToggle` and the `SidebarMode` type.
  This is the prerequisite the sidebar extraction needed: those four are read by both the sidebar
  renderer and the toolbar handlers, so no range-based move could assign them. Verified:
  `npx vite build`, `test:settings:dom` (192 ids).

- **Renderer tab bar extracted** - `renderer/main.ts` 1693 -> 1637, `tab-bar.ts` 67. Acyclic:
  the module owns the tab list and the new-tab button; the entry point only calls `renderTabs`.
  Verified: `npx vite build`, `test:settings:dom` (192 ids).

- **Renderer zoom controls extracted** - `renderer/main.ts` 1728 -> 1693, `zoom-controls.ts` 51.
  Acyclic: the block owns `currentZoom` and looks up the three buttons itself; the entry point only
  calls `renderZoom` and `setZoomPinned`. Verified: `npx vite build`, `test:settings:dom`
  (192 ids).

- **Wrap secrets form extracted** - `renderer/main.ts` 1909 -> 1728,
  `settings-wrap-secrets.ts` 264. This was the block that resisted four range-based attempts:
  the fix was structural, not positional. Elements come from `settings-wrap-dom.ts`; the two
  wrapper-side refreshes (`populateAuthOptions`, `renderWrapWrappers`) are injected through
  `setAuthOptionsSink`/`setWrapperListSink`; and `wrapSecretNames` moved into
  `settings-wrap-store.ts` and is mutated in place, because ES imports are read-only bindings.
  Verified: `npx vite build`, `test:settings:dom` (192 ids), `test:mcp:surface` 35/35.

- **Wrap panel DOM registry** - `settings-wrap-dom.ts` (114) exports all 53 `wrap*` handles once;
  the entry point imports them. This is the prerequisite the last four wrap/secrets attempts were
  missing: the secrets form and the wrapper modal share a credential sub-form
  (`wrapKindEl`/`wrapOAuthEl`/`wrapValueEl`/`wrapHostsEl`/`wrapHeaderEl`/`wrapPrefixEl`/
  `wrapNameEl`), so no range-based split could assign them. The elements are not contiguous —
  `selectedWrapMethods` and other helpers sit between them — so they were collected by declaration,
  not by range. Verified: `npx vite build`, `test:settings:dom` (192 ids).

- **Renderer telemetry/logs feed extracted** - `renderer/main.ts` 1983 -> 1907,
  `telemetry-feed.ts` 99, plus `cursor-trail.ts` (10) for the trail the feed appends to and the
  canvas drains. The feed exports `appendTelemetry`, `appendLog`, `renderConstruct` and the two
  handles the copy buttons read (`logsContainer`, `currentConstructMarkdown`). Verified:
  `npx vite build`, `test:settings:dom` (192 ids), `test:mcp:surface` 35/35.

- **Renderer suggestion popup extracted** - `renderer/main.ts` 2104 -> 1983,
  `url-suggestions.ts` 134. Self-contained: the popup owns its element, timers and selection state,
  and only `hideUrlSuggestions` is used by the entry point. It looks up `url-form`/`url-input`
  itself, so there is no seam. Verified: `npx vite build`, `test:settings:dom` (192 ids),
  `test:mcp:surface` 35/35.

- **Wrap panel state extracted** - `settings-wrap-store.ts` now owns `wrappers` and
  `selectedId`; the 17 references in the entry point read `wrapState`. This is the enabling step
  for splitting the wrap/secrets region: the secrets form and the wrapper modal share this state,
  so neither can move until it lives outside the closure. Verified: `npx vite build`,
  `test:settings:dom` (192 ids).

- **Renderer decision-model tab extracted** - `renderer/main.ts` 2184 -> 2104,
  `settings-decision.ts` 112. Elements (including the status badge), `showStatus` and the
  form/test handlers moved together. Two seams replaced the closure: `loadDecisionSettings()` for
  the modal-open path and `setDecisionBadgeVisible()` for the tab switcher; a `setDecisionTabSink`
  setter lets the module report a saved config without importing the entry point. Verified:
  `npx vite build`, `test:settings:dom` (192 ids), `test:mcp:surface` 35/35.

- **Shared settings result writer extracted** - `settings-feedback.ts` (20) now owns the
  `settings-test-result` element, `showSettingsResult(kind, text)` and `resetSettingsResult()`.
  This was the coupling that blocked the decision tab: both the decision handlers and the JEV
  controls wrote through a closure-local `showResult`, so the element could not move with either
  tab. All seven call sites now use the shared writer. Verified: `npx vite build`,
  `test:settings:dom` (192 ids), `test:mcp:surface` 35/35.

- **Renderer JEV controls extracted** - `renderer/main.ts` 2247 -> 2188, `settings-jev.ts` 68.
  The JEV block (enable toggle, status line, prefer/enforce mode) was contiguous and did not use the
  shared settings result writer, so it moved cleanly; `loadJevSettings` and `saveJevMode` are
  exported. Verified: `npx vite build`, `test:settings:dom` (192 ids), `test:mcp:surface` 35/35.

- **Renderer input pacing tab extracted** - `renderer/main.ts` 2314 -> 2247,
  `settings-input.ts` 76. The pacing panel was one contiguous block, so elements, helpers
  (`showInputResult`, `syncInputLabels`, `applyInputProfile`, `loadInputSettings`) and the
  save/reset handlers moved together; only `loadInputSettings` is exported. Verified:
  `npx vite build`, `test:settings:dom` (192 ids), `test:mcp:surface` 35/35.

- **Renderer Shadow Walk tab extracted** - `renderer/main.ts` 2470 -> 2314,
  `settings-shadow.ts` 170. Elements, helpers and the three handlers moved together; only
  `loadShadowWalkSettings` is exported. Isolating the tab exposed a clone between its save and
  reset handlers, now one `shadowResultText` reporter: duplicates 622 -> 604. Verified:
  `npx vite build`, `test:settings:dom` (192 ids), `test:mcp:surface` 35/35.

- **Renderer research tab extracted** - `renderer/main.ts` 2567 -> 2470,
  `settings-research.ts` 108. The settings modal groups its elements at the top and scatters its
  handlers below, so the tab was assembled from three ranges (elements 1189-1206, helpers
  1368-1396, handlers 1398-1448). It touches no shell element, so the only seam is exporting
  `loadResearchSettings` for the tab switcher. Verified: `npx vite build`, `test:settings:dom`
  (192 ids), `test:mcp:surface` 35/35.

- **Renderer recording panel extracted** - `renderer/main.ts` 2805 -> 2567,
  `settings-recording.ts` 252. The recorder was split across two regions (state/helpers, then
  listeners); both halves moved together, so the module owns the REC button, the status badge, the
  settings form and the start/stop listeners. It looks up the settings button itself, which lets
  `openSettingsTab` jump to the Recording tab without importing the entry point. Verified:
  `npx vite build`, `test:settings:dom` (192 ids), `test:mcp:surface` 35/35.

- **Renderer media panel extracted** - `renderer/main.ts` 2985 -> 2805, `settings-media.ts` 189.
  The media tab (downloader updates, output directory, ffmpeg) was fully isolated: no references to
  anything outside it, and only `loadMediaSettings` is used later, so it exports and the settings
  modal imports it. Recording stays in the entry point for now; the two regions are interleaved and
  need a separate pass. Verified: `npx vite build`, `test:settings:dom` (192 ids),
  `test:mcp:surface` 35/35.

- **Remote panel split** - `renderer/main.ts` 3399 -> 2985. `remote-panel.ts` (217) owns the element
  handles, the status renderers and `loadRemotePanel`; `remote-actions.ts` (263) owns the
  enable/token, tunnel, cloudflared, OAuth and session listeners. The seam is a namespace import
  plus one destructure in the actions module, which keeps the `const` binding so TypeScript's
  closure narrowing survives the `await`s. Two dedups fell out of isolating the code: one
  `runRemoteAction` helper replaced three copies of the try/catch/finally block, and one
  `wireCopyButton` replaced five copy handlers. Duplicates: 649 -> 622. Verified: `npx vite build`,
  `test:settings:dom` (192 ids), `test:mcp:surface` 35/35.

- **Renderer connect panel extracted** - `renderer/main.ts` 3676 -> 3399, `connect-panel.ts` 289.
  The block was fully isolated (zero external references, nothing declared inside leaked out), so it
  moved as one unit; the only seam needed was exporting `loadConnectPanel` for the settings tab. Its
  20-line internal client-template clone was already accepted inside `main.ts`, so the duplicate
  total is unchanged at 649 (relocated, not grown). Verified: `npx vite build`,
  `test:settings:dom` (192 ids), `test:mcp:surface` 35/35.

- **Renderer about + Cortex extracted** - `renderer/main.ts` 3968 -> 3676. `about-modal.ts` (20 lines)
  wires the version dialog at import; `cortex-panel.ts` (300) owns the recall/history/bookmark panel.
  The panel has no cycle with the entry point: main pushes the page identity in through
  `syncCortexPage(url, title)` (called from `updateState`) and hands over the log feed through
  `setCortexLogger(appendLog)`. Verified: `npx vite build`, `test:settings:dom` (192 ids),
  `test:mcp:surface` 35/35. Modularity stays at 3 (the remaining two are the chassis file/class and
  the renderer file).

- **Constructor split** - `browser-chassis.ts`'s 253-line constructor is now ten ordered phases
  (`initDecisionLog`, `initSimulator`, `initCoreServices`, `initHil`, `initActionLedger`,
  `initPrimitives`, `initLlmSurfaces`, `initCrawler`, `initResearcher`, `initTimers`) called from a
  12-line constructor. Initialization order is unchanged. Because TypeScript cannot see assignments
  inside the helpers, the 17 service fields carry definite-assignment assertions. Verified: the dev
  instance restarted and served the bridge (`/health` 2.3.3), `test:mcp:surface` 35/35,
  `test:act` 26/26. Modularity: 4 -> 3 violations (2 file + 1 class).

- **Oversized handlers split** - three of the four function violations are gone without touching the
  two file violations yet: `renderer/main.ts`'s 118-line wrapper-save handler is now
  `readWrapperForm` / `resolveWrapperAuth` / `buildWrapperPayload` plus a 30-line handler;
  `browser-chassis.ts`'s 144-line `setupTabManager` moved its four callbacks to private helpers, and
  its 195-line `registerIpcHandlers` became four channel-group methods behind a dispatcher (the
  class-size finding was already in the baseline and stayed at one). Verified: `npx vite build` (renderer
  + preload + main), `test:settings:dom` (192 static ids), `test:mcp:surface` 35/35.
  Modularity: 7 -> 4 violations (2 file + 1 function + 1 class).

- **Tool catalog split** - `mcp/tools-catalog.ts` 2180 -> 60 (the assembly module). The 95 entries
  now live in `mcp/catalog/` by family (navigation, interaction, tabs, memory, shield, downloads,
  sessions, network, marks, scripts, streams, system, hil, primitives 1-5), with the entry shape and
  the three shared formatters in `catalog/shared.ts`. `TOOLS_CATALOG` concatenates the families in
  the original order, so registration order is unchanged. `scripts/test-mcp-contract.mjs` now reads
  every catalog file, so the same parsers still validate names, endpoints, tiers and aliases.
  Verified: `test:mcp:contract` (95 tools, 98/98 route checks), `test:mcp:surface` 35/35,
  `npm run build:mcp`. The duplicate total is unchanged at 649 lines: the pre-existing entry-level
  clones moved with their entries rather than growing.

- **Primitives split** - `primitives/primitives.ts` 1836 -> 44 (the composed class + re-exports).
  The vocabulary moved to `types.ts` (host, options, wait grammar, guard inputs), the error to
  `error.ts`, and the page scripts to `scripts-wait.ts` / `scripts-extract.ts`. The class itself is
  an inheritance chain so the methods stay methods: `base -> page-state -> components -> extract ->
  observe-text -> observe -> find -> wait -> typing -> act -> traffic`; each part imports only the
  bindings it mentions, which is what keeps the parts under budget without cloning a header.
  Three real dedups fell out: `markLine` now delegates to `formatMark` (moved to
  `main/marks/format-mark.ts`, since main must not depend on mcp), the JEV precheck is one
  `precheckRead` helper for text and markdown, and the frame-control filter is shared with `find`
  (`frame-controls.ts`). The guard input shapes are now `PageReadGuardInput` /
  `PageReadPrecheckInput`, used by both the host interface and the chassis. Verified:
  `test:primitives` 37/37, `test:act` 26/26, `test:mcp:surface` 35/35, `test:mcp:contract`,
  `npm run build:mcp`.

- **Collaboration overlay split** - `collaboration/overlay.ts` 1420 -> 30 (prefixes + re-exports):
  `overlay-css*.ts` (the stylesheet by surface: drawer, selection, layer, element bar, CSS popover),
  `drawer-script-{shell,compose,events}.ts` (the note composer's three phases), `note-drawer.ts`,
  `picker-script.ts` and `overlay-script.ts`. The three generated page scripts were diffed against
  the previous build and are byte-identical. Verified: `test:collaboration`, `test:mcp:surface` 35/35.
- **Browser MCP split** - `mcp/browser-mcp.ts` 946 -> 179 (assembly only): `browser-surface.ts`
  (bridge access, tool preferences moved out, result shaping, image/text content), `mcp-log.ts`
  (file-first diagnostics, shared with the other stdio servers), `browser-guide.ts` (the OKF guide
  as a function of the JEV flags + the recommended order), `browser-resources.ts`, `browser-help.ts`,
  `browser-interceptors.ts` (tools/list enrichment + tools/call normalisation), `browser-params.ts`,
  `tool-preferences.ts` and `tool-schema-surface.ts` (the four schema field names, now shared with
  `bridge-server.ts`). `executeCatalogTool` was split into image vs text content, and the 101-line
  `createBridgeMcpServer` lost its description block to `describeTool`. Verified: `test:mcp:surface`
  35/35, `test:mcp:contract`, `npm run build:mcp`.
- **Bootstrap split** - `main/index.ts` 866 -> ~200 (process setup, single instance, lifecycle):
  `bootstrap/state.ts` (the window/services hand-off), `paths.ts` (stable server paths, dirs,
  `safeStorage` cipher, brand icon), `ipc-settings.ts`, `ipc-wrap.ts` (credentials, audit, wrappers,
  connect-info), `ipc-media.ts`, `ipc-misc.ts` (recording, research run, collaboration, web-state),
  `ipc-remote.ts`, `window.ts` (create, HUD diagnostics, first load) and `services.ts` (bridge,
  wrap, tools, collaboration, media, remote). The 192-line `createWindow` is gone and the eleven
  remote channels share one refusal/error helper. Verified: the dev instance rebuilt and restarted
  on its own (`test:mcp:surface` 35/35, `test:act` 26/26 against the new bootstrap).
- **Cortex split** - `cortex/cortex-db.ts` 841 -> 261 (connection + public API): `cortex-tables.ts`
  (table creation/seeding, FTS index, the embedding-provider guard, history reset),
  `history-store.ts` (index, hybrid recall, chronological history, clear), `bookmarks-store.ts`,
  `scripts-store.ts`, `cortex-search.ts` (tokens, Arrow list coercion, cosine, SQL escaping) and
  `cortex-types.ts`. The manual seed row and the two script-row mappers collapsed into helpers.
  Verified: `test:cortex:bookmarks` 7/7, `test:harvest` 4/4, `test:research` 7/7.
- **Input simulator split** - `telemetry/input-simulator.ts` 750 -> 143 (facade only): `cdp-input.ts`
  (debugger transport, native fallback, focus emulation), `mouse-control.ts` (glide, click, scroll,
  cursor state, emulation scale), `text-entry.ts` (typing, paste, insertText, named keys, clear),
  `key-tables.ts` (US-layout descriptors), `visual-cursor.ts` (the in-page ghost cursor) and
  `input-types.ts` (the reporter shape, so no facade cycle). The click's two button events collapsed
  into one helper. Verified: `test:human` 9/9, `test:act` 26/26, `test:primitives` 37/37.
- **Wrap executor split** - `wrap/executor.ts` 773 -> 170, and its 273-line `execute()` is gone:
  `execute.ts` (the entry point and the one error boundary), `execute-prepare.ts` (validation,
  request building, credential resolution), `execute-fetch.ts` (pagination loop, audit, one OAuth2
  re-mint), `execute-compose.ts` (render, Cortex indexing, AUTH_REQUIRED vs HTTP_ERROR), plus
  `pagination.ts` (`pagePlan`/`itemsOf`/`nextPageToken`/`mergePages`/`documentsToIndex`),
  `response.ts` (redirects, host policy, byte cap, `WrapTransportError`) and `execution-types.ts`.
  Verified: `test:wrap` 55/55 (including the refresh-once retry, static-credential no-retry and
  `lastVerified` cases), `test:anyapi` 17/17, `test:wrap:mcp` 15/15.
- **Wrap server split** - `mcp/wrap-server.ts` 728 -> 77 (and both its violations are gone):
  `wrap-config.ts` (bridge URL/timeout/token, the generated-tool cap, `callBridge`), `wrap-log.ts`
  (file-first diagnostics + shutdown), `wrap-format.ts` (result/preview/manifest/secret text and the
  `failureText` refusal shape), `wrap-tools.ts` (the nine meta-tools, registered through one
  `defineTool`), `wrap-generated.ts` (the `wrap_<id>` registry) and `process-guards.ts` (EPIPE,
  stdin-close and stray-async guards shared with `bridge-server.ts`). The registrations lost their
  repeated `server.tool(... try/catch)` skeleton, so duplicates fell as well. Verified:
  `test:wrap:mcp` 15/15, `test:mcp:surface` 35/35, `test:mcp:contract`, `npm run build:mcp`.
- **Tool ordering deduplicated** - `shared/tool-settings.ts` now owns `compareByRank` (saved rank, then a
  caller fallback) and `collectActionInstructions` (normalise saved per-action text through a caller
  filter). `main/tools/state.ts` and `mcp/browser-mcp.ts` had three copies of the rank comparator and
  two of the action-instruction walk. Verified: `test:mcp:contract`, `test:mcp:surface` 35/35.
- **LLM surface split** - `llm/llm-surface.ts` 637 -> 232: `llm-types.ts` (published shapes),
  `llm-net.ts` (session fetch, accept headers, content-type rules, `coded`), `llm-probe.ts`
  (`LlmProbe`: origin/page probes, alternate ranking, `recommend`) and `llm-read.ts` (paging +
  render fallback). Verified: `test:llm` 22/22 (page vs origin scope, anchor-discovered alternate,
  render fallback reasons, paging/next_cursor).

### Queued for the next session (still over the file budget)

`mcp/wrap-server.ts` (728 + 1 function), `telemetry/input-simulator.ts` (750), `wrap/executor.ts`
(773), `cortex/cortex-db.ts` (841), `index.ts` (866 + 1 function), `mcp/browser-mcp.ts` (1053 +
2 functions) — then the five giants: `collaboration/overlay.ts` (1420), `primitives/primitives.ts`
(1836), `mcp/tools-catalog.ts` (2180, with `scripts/test-mcp-contract.mjs` in the same commit),
`renderer/main.ts` (3960), `browser-chassis.ts` (4637 + 3 functions + 16-method class).
- **Marks overlay split** - `marks/marks-overlay.ts` 594 -> 168: the injected badge script is now
  three page-side phases (`injected-helpers.ts`, `injected-collect.ts`, `injected-assign.ts`) composed
  by `injected-script.ts`. The generated script was diffed against the previous build and is
  byte-identical. Verified: `test:framemarks` 13/13 (including OOPIF click/type and 100+ ids).
- **Sealed discovery split** - `shadow-walk/ax-controls.ts` 611 -> 132: `sealed-types.ts` (published
  shapes + the rate-limit error), `sealed-util.ts` (role actions, viewport, closed-root index,
  quad->rect), `sealed-scan.ts` (AX tree + pierce) and `sealed-measure.ts` (filter + boxes + tokens),
  with `sealed-sessions.ts` owning attach/detach so the two phases cannot drift. The extraction also
  collapsed the quad->rect math repeated in `sealed-targets.ts` and `tab-walk.ts`. Verified:
  `test:sealed` 21/21 (same-site and cross-site frames, offscreen tokens, scroll+click, rate limit)
  and `test:tabwalk` 11/11.
- **Cheap-slice sweep** - the mid-size files are out of the modularity baseline: `tabs/tab-manager`
  (513 -> 217 across `types.ts`, `tab-views.ts`, `popups.ts`, plus a shared `input/takeover-shortcut.ts`
  the shell and tabs now both use), `renderer/research-panel` (514 -> 112 across `research-dom.ts`,
  `research-controller.ts`, `research-citations.ts`, which also removed the 151-line event handler),
  and `preload/index` (535 -> 269 across `api-types.ts`, with `ConnectInfo` moved to `shared/types.ts`
  so the renderer no longer restates it). Verified: `test:mcp:surface` 35/35 (after teaching the suite
  to forward `HB_BRIDGE_URL` to the spawned MCP server), `test:research` 7/7, `test:research:events`,
  `test:act` 26/26, `vite build` clean.
- **Remote service split** - `remote/service.ts` 565 -> 300 across `gateway-child.ts` (spawn, port
  readiness, SIGTERM/SIGKILL tree, stderr tail, exit reporting), `tunnel.ts` (`RemoteTunnel`:
  token/hostname persistence, `normalizeHostname`, enable/disable, public URL, status) and
  `cloudflared-control.ts` (managed vs system binary, last check, install, automatic check).
  Parameter properties were replaced with explicit fields after the remote suite caught that it
  type-strips instead of transpiling. Verified: `npm run test:remote` — gateway smoke (19 tools),
  remote service, remote OAuth all pass.
- **Media service split** - `media/service.ts` 615 -> under budget: `media-types.ts` (published shapes),
  `media-info.ts` (the `--dump-single-json` run and `buildInfo`), `media-read.ts` (`MediaReader`:
  transcript paging, preview degradation, artifact resolution) and `media-artifacts.ts`
  (`pickLanguage`, bounded `TranscriptCache`, `loadArtifacts`). `dlp-failure.ts` now owns the
  timeout wording and stderr tail both `media-info` and `transcript` used to repeat — which removed an
  accepted clone, so duplicates also fell. Verified: `test:media` 22/22 plus a 30-case probe
  (metadata mapping, audio-only detection, language choice, cache TTL/eviction/index flags, failure
  wording, missing-binary refusals, preview degradation, cookie handoff).
- **Media jobs split** - `media/jobs.ts` 590 -> 300: `job-types.ts` (the published shapes and options),
  `job-queue.ts` (bounds, job factory, sort/count/prune), `job-history.ts` (fail-open load, atomic
  save, 250 ms debounced `JobHistoryWriter`) and `download-stream.ts` (the idle clock, the hard
  ceiling, progress/title parsing and the stderr tail). `job-files.ts` and `ytdlp-args.ts` keep the
  spawn/kill/file-listing helpers and the yt-dlp argument + progress-line rules. Verified:
  `test:media` 22/22 plus a 17-case probe (interrupted history, prune cap/order, counts, debounce
  flush, progress/merger/title parsing, stderr tail, timer release).
- **Crawl split** - `crawl/crawler.ts` 423 -> 229: `crawl/types.ts` holds the published shapes
  (`CrawlOptions`, `CrawlPage`, `CrawlOutcome`, `CrawlerDeps`) and `crawl/urls.ts` the pure rules
  (`normalizeUrl`, `matchesAnyPattern`, `linksFromMarkdown`). Re-exported from the crawler, so no
  caller changed. Verified: `test:crawl` 7/7 (depth, budget, patterns, same-origin, LLM tier, Cortex).
- **Secret store split** - `wrap/secrets.ts` 539 -> 292: `secret-types.ts` (published shapes and the
  injected cipher/minter), `secret-storage.ts` (fail-closed read, atomic 0600 write, metadata), 
  `secret-validation.ts` (every refusal rule, pure) and `oauth-mint.ts` (the client-credentials
  exchange). The reorder surfaced one TDZ bug (`existing` looked up via `name` before declaration),
  caught by inspection and fixed. Verified: `test:wrap` 55/55, `test:anyapi` 17/17, plus a 21-case
  validation probe (name/value/hosts/header/prefix/OAuth2 rules, keep-existing, wildcard hosts).
- **Docs gate closed** - 431 -> 0 undocumented exports (123 -> 0 files). The docs baseline is empty,
  so a new export without a usage line fails immediately.
- **Network capture split** - `network-interceptor.ts` 424 -> 252 lines plus `network/stream-capture.ts`:
  websocket/SSE lifecycle and the rolling message buffer now live in `StreamCapture`, and the CDP
  dispatcher has one handler per event kind (`captureRequest`/`captureResponse`/`captureBody`/
  `captureStreamEvent`). Verified: 2 streams, SSE dedupe, JSON flags, filters, cap, close/error, clears.
- **HIL notification split** - `hil/hil-manager.ts` 436 -> out of the baseline plus `hil/notifier.ts`:
  the toast, the long-slot Windows XML, click-to-focus and the no-focus surface are one object. The
  extraction exposed a real clone - `resolveIntervention` and `cancelIntervention` were the same
  skeleton - now one `finish()` that keeps the exact difference (cancel records no history notes).
  `ui/brand-icon.ts` is shared with the tray.
- **anyapi executor split** - `wrap/anyapi/executor.ts` 436 -> out of the baseline across `gate.ts`
  (what the core can serve exactly), `plan.ts` (declared arguments, redacted preview) and
  `payload-store.ts` (retains nothing). `wrap/executor-options.ts` now owns the transport options and
  wrapper resolution both executors share, which collapsed the `executor <-> anyapi/executor` clone
  pair; `ExecutorOptions extends TransportOptionInput`. Verified: `test:wrap` 55/55, `test:anyapi` 17/17.
- **Harvester split** - `harvester/markdown.ts` 252 -> 202: extraction is `extract()`, the notes/cap
  and the front matter are small functions, and the four Turndown rules live in `turndown-rules.ts`.
  Verified: `test:markdown` 20/20, `test:harvest` 4/4.
- **Bridge transport split** - `bridge/http-plumbing.ts` owns logging (with secret redaction), CORS,
  the body reader and the JSON responder; `http-bridge.ts` is 202 lines of named phases
  (`blockedByHumanControl`, `dispatchRoute`, `sendRouteError`, `wireServerEvents`). Verified live:
  CORS, OPTIONS 204, unknown route 404, non-JSON body, 409 HUMAN_CONTROL + GET still allowed, resume,
  plus `test:harvest` and `test:decide` 23/23.
- **Context menu split** - `menu/context-menu.ts`: spellcheck, selection/editing, link, image and
  navigation sections, so no function is over budget.
- **Recording files split** - `recording/files.ts` owns naming, writing and listing; the service keeps
  configuration and the renderer handshake. Verified against a temp directory: name shape, slug cap,
  bytes/seconds/speedup, newest-first order, limit, non-webm filtering.
- **Settings stores share one file helper** - `src/main/settings/json-file.ts` owns the fail-open
  read and atomic replace; eight stores (shadow-walk, zoom, tools, media, research, experimental,
  jev, anchor-store) use it instead of copy-pasting the sequence. Duplicates 1,791 -> 1,727 (3.7%).
- **Issue #8 fixed** - `tsx` is a devDependency and 25 test scripts that import TS sources run
  under `node --import tsx`; `test:shadow:unit` went from a module-resolution crash to 7/7.
- **Issue #9 fixed** - `/decide` forwards the guard verdict (`NO_DECISION`, accepted/fallback/
  exhausted/reasons) instead of raising a banner; the sensitive-gate branch keeps its automatic
  hand-off. `test:decide` is 23/23.
- **Issue #7 fixed** - `fill_form` no longer injects TypeScript casts; regression test
  `npm run test:forms`.

- **P0 #1 done** - every export in `src/shared/viewport.ts` has a usage doc; the docs baseline
  dropped from 451 to 431 and the file left the baseline entirely.
- **P0 #2 done** - `http-bridge.ts` fell from 2,039 to 230 lines and is now only the server shell
  (CORS, human-control gate, logging, error mapping, dispatch chain). Every route family lives in
  `src/main/bridge/routes/*` behind a shared `BridgeContext` (`fail()`, memoised body, one response
  envelope) and one `ROUTES` table per family: `system`, `view`, `memory`, `inspection`, `network`,
  `interaction`, `session`, `primitives`, `decision`, `research`, `wrap`, `media`, `collaboration`.
  The duplicate baseline dropped from 2,250 to 1,857 lines (4.3% -> 4.0%) and modularity from 54 to
  53 violations. The contract test statically reads the `'METHOD /path'` keys, so every extracted
  route stays covered.
- **P0 #3 done** - `src/main/token-file.ts` owns the atomic token write and fail-closed read; the
  wrap and remote gateway modules are thin wrappers. The 37.8% / 27.1% clone pair is gone.
- **P1 #4 in progress** - `browser-chassis.ts` is down from 4,816 to ~4,265 lines:
  - `HumanControl` (`src/main/input/human-control.ts`) - explicit takeover state, hooks for
    HUD/log/focus. Verified live: takeover -> 409 on mutations -> resume -> 200.
  - `ZoomRuntime` (`src/main/zoom/runtime.ts`) - compensate/native policy, step and exact
    factors, rendered CSS/physical proportions, emulation pinning. Verified live: step, 1.5x,
    reset, and the emulated viewport pin.
  - `screenshot-store.ts` (`src/main/snapshots/`) - capture folder + pruning. The extraction
    surfaced a real bug: cleanup only matched `.png` while jpeg is the default format, so 394
    orphaned jpegs had accumulated. Now both formats prune; the live pass removed 380 files.
  - Next slices: sidebar/collab mode, research settings, capture, consent.
- Verified live on a dev instance (port 4125): 38 read routes across every family plus `act`,
  `navigate`, `markdown`, `tabs/new`, `tabs/close` and `tabs/switch` answer with unchanged shapes
  and status codes.



## Top findings

### 1. Oversized modules and functions

| Priority | File | Size | Violations | Suggested split |
| --- | --- | ---: | --- | --- |
| P0 | `src/main/browser-chassis.ts` | 4,816 lines | file, 3 functions, class | `ResearchRuntime`, `ViewportRuntime`, `HumanControl`, `Consent`, `Capture` |
| P1 | `src/renderer/main.ts` | 3,969 lines | file, 1 function | tabs, logs, settings, cortex, zoom already partly separate |
| P1 | `src/mcp/tools-catalog.ts` | 2,172 lines | file | one module per tool family; registry composes |
| P1 | `src/main/primitives/primitives.ts` | 1,825 lines | file | observe / act / extract / wait / collect |
| P2 | `src/main/collaboration/overlay.ts` | 1,418 lines | file | in-page script builder vs. service |
| P2 | `src/mcp/browser-mcp.ts` | 1,050 lines | file, 2 functions | tool registration, dispatch, formatting |
| P2 | `src/main/index.ts` | 854 lines | file, 1 function | app bootstrap vs. feature wiring |
| P2 | `src/main/cortex/cortex-db.ts` | 831 lines | file | schema, ingest, recall, maintenance |
| P2 | `src/main/wrap/executor.ts` | 788 lines | file | transport, adapter maps, rendering |
| P2 | `src/main/telemetry/input-simulator.ts` | 748 lines | file | pointer, keyboard, scroll, visual cursor |
| P2 | `src/mcp/wrap-server.ts` | 722 lines | file, 1 function | registration vs. dispatch |
| P3 | `src/main/llm/llm-surface.ts` | 629 lines | file | probe / fetch / read |
| P3 | `src/main/shadow-walk/ax-controls.ts` | 625 lines | file | scan vs. act |
| P3 | `src/main/media/service.ts` | 605 lines | file | jobs, auth, binaries |
| P3 | `src/main/marks/marks-overlay.ts` | 592 lines | file | inject, scan, remove |
| P3 | `src/main/media/jobs.ts` | 581 lines | file | queue vs. execution |
| P3 | `src/main/remote/service.ts` | 564 lines | file | lifecycle vs. API |
| P3 | `src/preload/index.ts` | 534 lines | file | one API object; split by domain |
| P3 | `src/main/wrap/secrets.ts` | 528 lines | file | store, cipher, host binding |

### 2. Duplication hotspots

| Priority | File | Duplicated lines | Likely cause |
| --- | --- | ---: | --- |
| P1 | `src/main/browser-chassis.ts` | 265 | repeated tab/clipboard/state helper patterns |
| P1 | `src/mcp/tools-catalog.ts` | 255 | repeated parameter/format scaffolding |
| P1 | `src/mcp/wrap-server.ts` | 153 | repeated tool registration |
| P1 | `src/mcp/tool-groups.ts` | 135 | action-to-tool mapping rows |
| P1 | `src/renderer/main.ts` | 111 | repeated DOM/state handlers |
| P2 | `src/main/index.ts` | 83 | repeated IPC registration |
| P2 | `src/main/wrap/anyapi/executor.ts` | 71 | transport/result mapping |
| P2 | `src/main/wrap/executor.ts` | 70 | transport/result mapping |
| P2 | `src/main/hil/hil-manager.ts` | 68 | notification/banner lifecycle |
| P2 | `src/main/primitives/primitives.ts` | 66 | repeated response envelopes |
| P2 | `src/main/shadow-walk/tab-walk.ts` | 55 | tab focus/restore |
| P2 | `src/preload/index.ts` | 52 | repeated IPC wrappers |
| P3 | `src/mcp/bridge-server.ts` | 39 | stdio lifecycle |
| P3 | `src/mcp/browser-mcp.ts` | 36 | dispatch/format |

The token-file pattern that used to clone (`remote/token.ts` 37.8%, `wrap/token.ts` 27.1%) now
lives in `src/main/token-file.ts`. `mcp/tool-groups.ts` stays 51.9% duplicated by design (mapping table).

### 3. Documentation debt

| Priority | File | Missing docs | Notes |
| --- | --- | ---: | --- |
| P1 | `src/main/shadow-walk/settings.ts` | 13 | policy/settings types |
| P1 | `src/main/wrap/render.ts` | 12 | exported helpers used by executor |
| P1 | `src/main/primitives/primitives.ts` | 11 | shared primitive surface |
| P1 | `src/main/recording/recording-service.ts` | 11 | public service API |
| P1 | `src/main/wrap/secrets.ts` | 11 | credential boundary |
| P2 | `src/main/cortex/cortex-db.ts` | 10 | memory API |
| P2 | `src/main/media/service.ts` | 10 | media API |
| P2 | `src/main/wrap/types.ts` | 10 | wrapper schema |
| P2 | `src/main/media/jobs.ts` | 9 | job API |
| P2 | `src/main/recipes/recipe-store.ts` | 8 | recipe storage |
| P2 | `src/shared/collaboration.ts` | 8 | shared thread types |
| P3 | `src/main/research/settings.ts` | 7 | settings schema |
| P3 | `src/main/crawl/crawler.ts` | 6 | injectable crawler API |
| P3 | `src/main/decide/decision-client.ts` | 6 | decision API |

### 4. Import boundaries

- **0 cycles** across 161 files.
- All 5 configured layer rules pass:
  - `src/shared/**` must not import `src/main/**` or `src/renderer/**`
  - `src/renderer/**` and `src/preload/**` must not import `src/main/**`
  - `src/main/**` must not import `src/renderer/**`
- No action; keep the rules as new modules land.

## Suggested TODO order

### P0 — make the gates meaningful

1. **Document `src/shared/viewport.ts`** — 15 exports; clears the newest shared-contract debt and
   gives the reuse skill a usable entry. **Done.**
2. **HTTP bridge route helper** — extract `readJsonAndRespond`, validation and error envelopes;
   target the 366 duplicated lines and the two oversized functions. This is the largest structural
   win with the least product risk. **Done:** the bridge is a 230-line server shell and every family
   is a `ROUTES` table in `src/main/bridge/routes/`.
3. **Token loader extraction** — one `readTokenFile`/`writeTokenFile` helper for
   `remote/token.ts` and `wrap/token.ts`. **Done** (`src/main/token-file.ts`).

### P1 — split by responsibility

4. **`browser-chassis` decomposition** — extract `ViewportRuntime` (already a controller), then
   `HumanControl`, `Consent`, `ResearchRuntime`, `CaptureRuntime`. Keep the chassis as composition
   root; update the extraction map.
5. **Finish `http-bridge` route modules** — all families are extracted; keep the `ROUTES`-table
   pattern and the contract test. No behavior change. **Done.**
6. **`tools-catalog` split** — one module per family with a registry; keep the contract test.
7. **`renderer/main` split** — tabs, logs, settings, cortex, web-state panels; reuse the existing
   research/viewport modules as the pattern.
8. **`primitives` split** — observe/act/extract/wait/collect, keeping `PrimitivesHost` stable.
9. **Docs pass on the P1 files** — shrink the 451-export baseline by documenting shared surfaces
   before moving them.

### P2 — cleanup and ratchet

10. **Wrap/media/cortex splits** and the repeated transport/result mapping.
11. **Remove clone regions** listed above; re-run `check-duplicates --update-baseline` only when
    the count actually shrinks.
12. **Component index quality** — the generator classifies most exports as `types` (573/650);
    improve the heuristic or add manual notes for the major services.
13. **Tighten the ratchet** — after each split, re-run:
    ```bash
    node scripts/anti-slop/check-modularity.mjs --update-baseline
    node scripts/anti-slop/check-docs.mjs --update-baseline
    node scripts/anti-slop/check-duplicates.mjs --update-baseline
    ```
    Commit the shrunken baseline with the refactor; never grow it to absorb new debt.

## Rules for the branch

- New files must stay under the budgets; the baseline covers legacy only.
- New exports need a one-line `/** When to use ... */` comment.
- Do not add a duplicate helper without checking `docs/COMPONENT_INDEX.md`.
- Run `npm run anti-slop:check` before commit; hooks enforce staged files.
- Keep import-layer rules green; no new cycles.
