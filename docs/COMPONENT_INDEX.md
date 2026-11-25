# Component Index

<!-- generated: run `node scripts/anti-slop/generate-component-index.mjs` to regenerate -->

Inventory of shared layouts, components, hooks, services, and utilities under `src/`. 438 files, 1261 exports.

> Rule of use: before creating any new component, hook, or utility, check this file first (see the `reuse-before-create` skill). When you add a shared abstraction, rerun the generator and fill in the "When to use" column.

## Layouts (2)

| File | Export | When to use |
|---|---|---|
| `main/browser/layout-viewport.ts` | `layoutViewport` | When to use: reading `Page.getLayoutMetrics` for the top-level viewport size. |
| `main/browser/layout-viewport.ts` | `ViewportRect` *(type)* | A viewport rect in CSS pixels, origin at the top-left of the page. |

## Utils (6)

| File | Export | When to use |
|---|---|---|
| `main/utils/json-navigator.ts` | `JsonNavigator` | - |
| `main/utils/json-navigator.ts` | `JsonQueryOptions` *(type)* | JSON Navigator Engine |
| `main/utils/json-navigator.ts` | `JsonQueryResult` *(type)* | - |
| `main/utils/json-query.ts` | `queryJsonData` | When to use: the bridge route — resolve a JSON source and query it. |
| `main/utils/json-query.ts` | `JsonQueryParams` *(type)* | The sources `query_json_data` can read. |
| `main/utils/json-query.ts` | `JsonQueryDeps` *(type)* | Where the query reads its raw JSON from. |

## Types (956)

| File | Export | When to use |
|---|---|---|
| `main/boot/hud-watchdog.ts` | `HudWatchdog` | The HUD heartbeat and viewport-recovery watchdog. |
| `main/boot/hud-watchdog.ts` | `HudWatchdogDeps` *(type)* | Dependencies the watchdog needs from the shell window and views. |
| `main/boot/services.ts` | `AppServices` | The long-lived services the renderer IPC modules read through getters. |
| `main/boot/services.ts` | `ServicesDeps` *(type)* | When to use: constructing the boot — every path and store comes from the entry point. |
| `main/boot/shell-window.ts` | `createShellWindow` | The window itself plus its HUD crash handling. A crashed renderer used to |
| `main/boot/shell-window.ts` | `registerUpdateHandlers` | Update IPC: status, an on-demand check, and install (packaged builds only in practice). |
| `main/boot/shell-window.ts` | `loadShell` | When to use: after the window exists — the dev server URL, or the bundled file. |
| `main/boot/shell-window.ts` | `ShellWindowDeps` *(type)* | When to use: creating a shell window — `appDir` is the compiled main directory. |
| `main/boot/window-boot.ts` | `WindowBootSurface` | The shell-window boot sequence, bound once. |
| `main/boot/window-boot.ts` | `DownloadNotice` *(type)* | A finished download, as the boot hook reports it. |
| `main/boot/window-boot.ts` | `WindowBootDeps` *(type)* | Dependencies the boot sequence needs from the chassis surfaces. |
| `main/browser/frame-eval.ts` | `evaluateInFrames` | Evaluate `expression` in the main frame and up to `maxFrames` child frames. |
| `main/browser/frame-eval.ts` | `FrameEvalOptions` *(type)* | - |
| `main/browser/frame-eval.ts` | `FrameEvalResult` *(type)* | - |
| `main/browser/frame-tree.ts` | `discoverFrames` | - |
| `main/browser/frame-tree.ts` | `FrameHandle` *(type)* | - |
| `main/browser/frame-tree.ts` | `FrameContext` *(type)* | - |
| `main/browser/frames-inventory.ts` | `inventoryFrames` | When to use: the chassis frames route — walk the frame tree, attach control facts and per-frame screenshots. |
| `main/browser/frames-inventory.ts` | `FrameInventoryResult` *(type)* | When to use: the frames result — one row per frame, with controls and screenshots attached. |
| `main/browser/frames-inventory.ts` | `FramesInventoryDeps` *(type)* | When to use: the inventory reads through these two collaborators. |
| `main/browser/frames-inventory.ts` | `FrameShot` *(type)* | One cropped frame screenshot, already encoded for the bridge response. |
| `main/browser/frames-inventory.ts` | `FramesInventoryOptions` *(type)* | When to use: the inventory options, before settings and bounds are applied. |
| `main/browser/frames.ts` | `listFrames` | List the main frame and its children with top-level content-box rects. |
| `main/browser/frames.ts` | `FrameRect` *(type)* | - |
| `main/browser/frames.ts` | `FrameInfo` *(type)* | - |
| `main/browser/page-script-surface.ts` | `PageScriptSurface` | The script-evaluation and control-description surface over the active tab. |
| `main/browser/page-script-surface.ts` | `PageScriptSurfaceDeps` *(type)* | Dependencies the page-script surface needs from the active tab. |
| `main/capture/screenshot-jpeg.ts` | `captureScreenshotJpeg` | When to use: `decide(include_screenshot)` — a bounded baseline JPEG of the viewport. |
| `main/capture/screenshot-jpeg.ts` | `ScreenshotJpegDeps` *(type)* | Dependencies the capture needs from the active tab. |
| `main/chassis/harvest-nav-stack.ts` | `createHarvestNavStack` | When to use: the chassis constructor — build marks, harvest and navigation once. |
| `main/chassis/harvest-nav-stack.ts` | `HarvestNavStack` *(type)* | The built harvest/marks/navigation surfaces plus the prerender engine. |
| `main/chassis/host.ts` | `ChassisHost` *(type)* | The chassis surfaces and accessors a composition root may read. |
| `main/chassis/input-stack.ts` | `createInputStack` | When to use: the chassis constructor — build the input/diagnostic surfaces once. |
| `main/chassis/input-stack.ts` | `InputStack` *(type)* | The built input and diagnostic surfaces. |
| `main/chassis/interaction-stack.ts` | `createInteractionStack` | When to use: the chassis constructor — build HIL, the ledger and primitives once. |
| `main/chassis/interaction-stack.ts` | `InteractionStack` *(type)* | The built interaction surfaces. |
| `main/chassis/llm-stack.ts` | `createLlmStack` | When to use: the chassis constructor — build the read/search/crawl stack once. |
| `main/chassis/llm-stack.ts` | `LlmStack` *(type)* | The built LLM/read/search/crawl surfaces. |
| `main/chassis/surfaces.ts` | `createPageScriptSurface` | When to use: the chassis constructor — the page-script surface over the host's tab. |
| `main/chassis/surfaces.ts` | `createShadowWalkSurface` | When to use: the chassis constructor — Shadow Walk policy and frame reads over the host's tabs. |
| `main/chassis/surfaces.ts` | `createResearchViewSurface` | When to use: the chassis constructor — the detached research view plus citations/hand-off. |
| `main/chassis/surfaces.ts` | `createHumanSurface` | When to use: the chassis constructor — the explicit human-takeover latch. |
| `main/chassis/surfaces.ts` | `createDeckController` | When to use: the chassis constructor — the deck panel, its modes and the collab wiring. |
| `main/chassis/surfaces.ts` | `createJevController` | When to use: the chassis constructor — JEV page compaction over the active page. |
| `main/chassis/surfaces.ts` | `createZoomController` | When to use: the chassis constructor — the page-zoom policy. |
| `main/chassis/surfaces.ts` | `createConsentController` | When to use: the chassis constructor — the consent sweep over the active page. |
| `main/chassis/surfaces.ts` | `createHudWatchdog` | When to use: the chassis constructor — the HUD heartbeat and viewport-recovery watchdog. |
| `main/chassis/surfaces.ts` | `createCollaborationSurface` | When to use: the chassis constructor — the page overlay picker and its signal channel. |
| `main/chassis/surfaces.ts` | `createWindowBoot` | When to use: the chassis constructor — the ordered shell-window boot sequence. |
| `main/chassis/surfaces.ts` | `createChromeSurfaces` | When to use: the chassis constructor — build the chrome surfaces first. |
| `main/chassis/surfaces.ts` | `createTabEvents` | When to use: the chassis constructor — the tab manager lifecycle reactions. |
| `main/chassis/surfaces.ts` | `ChromeSurfaces` *(type)* | The five surfaces the rest of the composition reads, built first. |
| `main/collaboration/overlay.ts` | `collaborationNoteDrawerScript` | Anchored note composer. The drawer is mounted next to the picked element, |
| `main/collaboration/overlay.ts` | `collaborationPickerScript` | - |
| `main/collaboration/overlay.ts` | `collaborationOverlayScript` | Pure in-page projection for collaboration threads. The overlay is read-only in |
| `main/collaboration/overlay.ts` | `COLLABORATION_NOTE_PREFIX` | - |
| `main/collaboration/overlay.ts` | `COLLABORATION_CLASS_PREFIX` | Human class-list edits on a selected element (the LLM reads these). |
| `main/collaboration/overlay.ts` | `COLLABORATION_RESOLVE_PREFIX` | Resolve a thread from its in-page annotation card while in collab mode. |
| `main/collaboration/overlay.ts` | `COLLABORATION_EXIT_PREFIX` | Escape from collab mode while the page itself owns keyboard focus. |
| `main/collaboration/overlay.ts` | `CollaborationPickerOptions` *(type)* | Human element picker. The click is reported through the existing console channel. |
| `main/collaboration/store.ts` | `CollaborationStore` | - |
| `main/collaboration/store.ts` | `CreateThreadInput` *(type)* | - |
| `main/collaboration/surface.ts` | `CollaborationSurface` | The element picker and the page overlay signal channel. |
| `main/collaboration/surface.ts` | `CollaborationNote` *(type)* | A note the page overlay posted for the collaboration store. |
| `main/collaboration/surface.ts` | `CollaborationSurfaceDeps` *(type)* | Dependencies the collaboration surface needs from the deck and the tab. |
| `main/cortex/chunker.ts` | `chunkMarkdown` | - |
| `main/cortex/chunker.ts` | `extractDomain` | - |
| `main/cortex/chunker.ts` | `PageChunk` *(type)* | Kuang Grade Mark Eleven - Cortex Markdown Chunker |
| `main/cortex/embedder.ts` | `registerEmbeddingProvider` | Register (or replace) a provider so it can be selected by id. |
| `main/cortex/embedder.ts` | `listEmbeddingProviders` | Ids of every registered provider. |
| `main/cortex/embedder.ts` | `setEmbeddingProvider` | Select the active provider by id. Throws when the id is unknown. |
| `main/cortex/embedder.ts` | `getEmbeddingProvider` | The provider used for all new embeddings. |
| `main/cortex/embedder.ts` | `embedText` | Embed `text` with the active provider. |
| `main/cortex/embedder.ts` | `generateEmbedding` | - |
| `main/cortex/embedder.ts` | `DEFAULT_PROVIDER_ID` | - |
| `main/cortex/embedder.ts` | `EMBEDDING_DIM` | Legacy dimension constant for the default provider (kept for compatibility). |
| `main/cortex/embedder.ts` | `EmbeddingProvider` *(type)* | Kuang Grade Mark Eleven - Cortex Embedding Provider |
| `main/cortex/types.ts` | `tokenizeQuery` | Split a search query into lowercase, punctuation-stripped terms. |
| `main/cortex/types.ts` | `toStringArray` | LanceDB returns list columns as Apache Arrow `Vector`s, not JS arrays, so |
| `main/cortex/types.ts` | `bookmarkSearchText` | The text a bookmark query is matched against (title, notes, URL, tags). |
| `main/cortex/types.ts` | `cosineSimilarity` | Cosine similarity of two L2-normalized vectors (equal-length dot product). |
| `main/cortex/types.ts` | `PageHistoryRow` *(type)* | When to use: a chunk of a visited page as stored in `page_history`. |
| `main/cortex/types.ts` | `BookmarkRow` *(type)* | When to use: a saved bookmark as stored in `bookmarks`. |
| `main/cortex/types.ts` | `RecallResult` *(type)* | When to use: one memory hit from `history.recall`. |
| `main/cortex/types.ts` | `HistoryItem` *(type)* | When to use: one row of the chronological history list. |
| `main/cortex/types.ts` | `UrlSuggestion` *(type)* | When to use: one URL-bar suggestion, merged from history, bookmarks and recall. |
| `main/cortex/types.ts` | `BookmarkItem` *(type)* | When to use: a bookmark as the HUD reads it. |
| `main/cortex/types.ts` | `ScriptRow` *(type)* | When to use: a saved script as stored in `scripts`. |
| `main/cortex/types.ts` | `ScriptItem` *(type)* | When to use: a saved script as the HUD and the tool surface read it. |
| `main/crawl/crawler.ts` | `normalizeUrl` | Strips the fragment so `/a` and `/a#x` are one page. |
| `main/crawl/crawler.ts` | `matchesAnyPattern` | True when the URL matches any pattern (glob by default, `/regex/` when wrapped in slashes). |
| `main/crawl/crawler.ts` | `linksFromMarkdown` | Extracts absolute links from Markdown (`[text](href)`), resolved against the page URL. |
| `main/crawl/crawler.ts` | `Crawler` | When to use: `deep_crawl` and a research run — one BFS crawl over the research session. |
| `main/crawl/crawler.ts` | `HumanAssistInfo` *(type)* | When to use: the crawler's `onHuman` callback — a page needs a person (needed) and later does not (done). |
| `main/crawl/crawler.ts` | `CrawlOptions` *(type)* | When to use: `deep_crawl` and a research run — the seed, the depth/page budgets, the scope and the per-page flags. |
| `main/crawl/crawler.ts` | `CrawlPage` *(type)* | When to use: one row of a crawl result and the research feed's source events. |
| `main/crawl/crawler.ts` | `CrawlOutcome` *(type)* | When to use: the `deep_crawl` reply — pages, depth reached, indexing count and truncation. |
| `main/crawl/crawler.ts` | `CrawlerDeps` *(type)* | When to use: building the chassis — the tier readers and handlers a crawl composes. |
| `main/decide/decision-guard.ts` | `validateAnswers` | Validate one answer set. Returns the offending (question, option) pairs so the caller can |
| `main/decide/decision-guard.ts` | `decideGuarded` | Ask, validate, eliminate, repeat. `maxAttempts` includes the first call (default 3). |
| `main/decide/decision-guard.ts` | `DecisionGuard` *(type)* | - |
| `main/decide/decision-guard.ts` | `GuardRejection` *(type)* | - |
| `main/decide/decision-guard.ts` | `GuardedDecision` *(type)* | - |
| `main/decide/decision-questions.ts` | `summarizeQuestions` | When to use: one call's questions, flattened for the event log. |
| `main/decide/decision-questions.ts` | `DecisionQuestionSummary` *(type)* | When to use: recording what a decision call was asked. |
| `main/decide/decision-surface.ts` | `DecisionSurface` | The decision log and the guard-driven human hand-off. |
| `main/decide/decision-surface.ts` | `DecisionSurfaceDeps` *(type)* | Dependencies the decision surface needs from the HIL layer. |
| `main/decide/sensitive-gate.ts` | `detectSensitiveGate` | Inspect the state Kuang is about to send. `state` may be the composed page text or the component |
| `main/decide/sensitive-gate.ts` | `SensitiveGate` *(type)* | Sensitive gates — situations where the correct action is **a human**, never a click. |
| `main/decide/sensitive-gate.ts` | `GateDetection` *(type)* | - |
| `main/decide/types.ts` | `DecisionProtocol` *(type)* | When to use: naming the transport in config and results. |
| `main/decide/types.ts` | `DecisionConfig` *(type)* | When to use: resolving what `decide` will call. |
| `main/decide/types.ts` | `DecisionCall` *(type)* | When to use: passing a page state and typed questions to the model. |
| `main/decide/types.ts` | `DecisionFailureCode` *(type)* | When to use: mapping a failure to its typed code. |
| `main/decide/types.ts` | `DecisionResult` *(type)* | When to use: the entry point's return value. |
| `main/decide/types.ts` | `DecisionEvent` *(type)* | When to use: the HUD's DECISIONS tab record. |
| `main/deck/bounds.ts` | `pageInsetOf` | When to use: the page inset — only a visible floating panel covers the page. |
| `main/deck/bounds.ts` | `panelBounds` | The panel's bounds for the current mode. Collapsed is the orb chip (or the |
| `main/deck/bounds.ts` | `orbDragBounds` | One live drag step: forward the pointer delta, clamped inside the content area. |
| `main/deck/bounds.ts` | `nearestEdge` | Drop: dock to the nearest vertical edge. |
| `main/deck/bounds.ts` | `PAGE_SCROLLBAR_GUTTER` | Deck geometry. The panel sits over the page, clear of the scrollbar track. |
| `main/deck/bounds.ts` | `PANEL_WIDTH` | Width of the Command Deck HUD (docked and floating). |
| `main/deck/bounds.ts` | `DECK_ORB_SIZE` | Orb chip size and screen margin. The native view is larger than the visible |
| `main/deck/bounds.ts` | `DECK_ORB_VIEW` | The native view's side, including the padding the chip is drawn inside. |
| `main/deck/bounds.ts` | `DECK_ORB_VIEW_PAD` | Half the padding either side of the chip, used to anchor the collapsed view. |
| `main/deck/bounds.ts` | `DECK_ORB_MARGIN` | Gap between the docked chip and the window edge. |
| `main/deck/bounds.ts` | `TOOLBAR_BAR_WIDTH` | Collab-mode toolbar pill: the orb is replaced by this bar. |
| `main/deck/bounds.ts` | `SIDEBAR_TRANSITION_MS` | Sidebar transition duration, shared by the native bounds animation and the panel's CSS reveal. |
| `main/deck/bounds.ts` | `DeckMode` *(type)* | The three panel states the chassis compares. |
| `main/deck/bounds.ts` | `DeckEdge` *(type)* | Which bottom corner the collapsed chip docks to. |
| `main/deck/bounds.ts` | `DeckRect` *(type)* | A rectangle in the window's content coordinates. |
| `main/deck/collab.ts` | `CollabController` | When to use: the deck surface — own the collab mode, gate and note cycle. |
| `main/deck/collab.ts` | `CollabControllerDeps` *(type)* | When to use: building the deck — everything the collab wiring reads through. |
| `main/deck/controller.ts` | `DeckController` | When to use: the chassis — compose the panel, the orb and the collab wiring. |
| `main/deck/controller.ts` | `DeckControllerDeps` *(type)* | When to use: building the chassis — everything the deck reads through. |
| `main/deck/note-cycle.ts` | `CollabNoteCycle` | When to use: `CollabController` — own the focused note and its list. |
| `main/deck/note-cycle.ts` | `CollabNoteCycleDeps` *(type)* | When to use: constructing the controller — the providers and the page lookups. |
| `main/deck/orb.ts` | `DeckOrb` | When to use: `DeckController` — own the collapsed chip's edge and drag. |
| `main/deck/orb.ts` | `DeckOrbDeps` *(type)* | When to use: constructing the controller — the panel and the broadcast hook. |
| `main/deck/panel.ts` | `DeckPanel` | When to use: `DeckController` — own the panel view and its bounds. |
| `main/deck/panel.ts` | `DeckPanelDeps` *(type)* | When to use: constructing the controller — the window, loader and mode readers. |
| `main/diagnostics/console-log.ts` | `ConsoleLogBuffer` | The bounded, newest-last console buffer. |
| `main/diagnostics/console-log.ts` | `ConsoleLogEntry` *(type)* | One captured page console line. |
| `main/downloads/download-manager.ts` | `DownloadManager` | - |
| `main/downloads/download-manager.ts` | `DownloadRecord` *(type)* | - |
| `main/downloads/download-surface.ts` | `DownloadSurface` | The download list and downloaded-document reader. |
| `main/downloads/download-surface.ts` | `DownloadSurfaceDeps` *(type)* | Dependencies the download surface needs for directive logging. |
| `main/drive/driver.ts` | `driveTask` | Run the loop until a stop condition. Never throws: every failure is a typed status. |
| `main/drive/driver.ts` | `DriveStatus` *(type)* | - |
| `main/drive/driver.ts` | `DriveStep` *(type)* | - |
| `main/drive/driver.ts` | `DriveResult` *(type)* | - |
| `main/drive/driver.ts` | `DriveOptions` *(type)* | - |
| `main/harvest/harvest-surface.ts` | `HarvestSurface` | The agent-facing harvest and screenshot surface. |
| `main/harvest/harvest-surface.ts` | `HarvestSurfaceDeps` *(type)* | Dependencies the harvest surface needs from the active tab and chassis state. |
| `main/harvest/screenshots.ts` | `ScreenshotStore` | When to use: the chassis — own screenshot persistence: directory, retention, capture retry and the encode/save tail. |
| `main/harvest/screenshots.ts` | `ScreenshotStoreDeps` *(type)* | When to use: building the chassis — log and telemetry come from the chassis. |
| `main/harvest/screenshots.ts` | `ScreenshotPayload` *(type)* | The screenshot payload both capture paths (live viewport and annotated marks) return. |
| `main/harvester/dom-serializer.ts` | `captureComposedDom` | Serialise the active page's composed DOM (light + open shadow roots). |
| `main/harvester/dom-serializer.ts` | `COMPOSE_DOM_SCRIPT` | JS evaluated in the page. Must stay self-contained: no imports, no template |
| `main/harvester/dom-serializer.ts` | `ComposedDom` *(type)* | Composed-DOM serialisation for the Markdown harvester. |
| `main/harvester/markdown.ts` | `ConstructHarvester` | - |
| `main/harvester/markdown.ts` | `HarvestStats` *(type)* | - |
| `main/hil/hil-banner.ts` | `hilBannerScript` | When to use: `inject` — the banner markup, wired to the local resolve route. |
| `main/hil/hil-banner.ts` | `hilBannerRemovalScript` | When to use: `remove` — drop the banner and its keyframes. |
| `main/hil/hil-banner.ts` | `HilPageBanner` | When to use: `HilManager` — own the page banner for the active hand-off. |
| `main/hil/hil-banner.ts` | `HilPageBannerDeps` *(type)* | When to use: constructing the manager — the page lookups are injected. |
| `main/hil/hil-ipc.ts` | `registerHilIpc` | When to use: the manager constructor — registers the hand-off channels once. |
| `main/hil/hil-ipc.ts` | `HilIpcTarget` *(type)* | When to use: `HilManager` — the four operations the HUD can invoke. |
| `main/hil/hil-manager.ts` | `HilManager` | When to use: the chassis — own the hand-off lifecycle and its delivery. |
| `main/hil/hil-manager.ts` | `HilManagerOptions` *(type)* | When to use: the chassis — the window and the two fan-out hooks. |
| `main/hil/hil-notifier.ts` | `HilNotifier` | When to use: `HilManager` — deliver a hand-off to the desktop and the HUD. |
| `main/hil/hil-notifier.ts` | `HilNotifierDeps` *(type)* | When to use: constructing the manager — the window and the broadcast fan-out. |
| `main/hil/hil-surface.ts` | `HilSurface` | The agent-facing human-in-the-loop and notification surface. |
| `main/hil/hil-surface.ts` | `HilSurfaceDeps` *(type)* | Dependencies the HIL surface needs from the tabs and agent status. |
| `main/hil/hil-types.ts` | `HilRequest` *(type)* | When to use: a hand-off waiting on (or previously answered by) a human. |
| `main/hil/hil-types.ts` | `HilResolution` *(type)* | When to use: what `requestIntervention` resolves with. |
| `main/hil/hil-types.ts` | `NotificationOptions` *(type)* | When to use: a desktop notification raised by the media surface or the HUD. |
| `main/http/collaboration-routes.ts` | `handleCollaborationRoutes` | When to use: the bridge request handler — dispatch `/collaboration/*` before |
| `main/http/collaboration-routes.ts` | `CollaborationRouteContext` *(type)* | When to use: building the collaboration dispatcher — the service plus the page context it reads. |
| `main/http/dispatch.ts` | `dispatchBridgeRoutes` | When to use: the bridge request handler — run the family table until one |
| `main/http/dispatch.ts` | `BridgeDispatchContext` *(type)* | When to use: wiring the bridge dispatcher — every optional service plus the last-action clock. |
| `main/http/health-routes.ts` | `handleHealthRoutes` | When to use: the bridge request handler — dispatch the health, telemetry and |
| `main/http/health-routes.ts` | `HealthRouteContext` *(type)* | When to use: the bridge request handler — the health family also needs the |
| `main/http/media-routes.ts` | `handleMediaRoutes` | When to use: the bridge request handler — dispatch `/media/*` before the |
| `main/http/media-routes.ts` | `MediaRouteContext` *(type)* | When to use: building the media dispatcher — the media service, or undefined when the feature is off. |
| `main/http/network-routes.ts` | `handleNetworkRoutes` | When to use: the bridge request handler — dispatch `/network/*`. Returns |
| `main/http/network-routes.ts` | `NetworkRouteContext` *(type)* | When to use: building the network dispatcher — the bridge supplies the moving timestamp. |
| `main/http/request-context.ts` | `createRequestContext` | When to use: the bridge request handler — build the helpers for one request. |
| `main/http/request-context.ts` | `BridgeRequestContext` *(type)* | When to use: a route family needs the request body reader and the JSON senders. |
| `main/http/route-table.ts` | `dispatchRoute` | When to use: the end of every family handler — look up the entry for this |
| `main/http/route-table.ts` | `RouteTableContext` *(type)* | When to use: a family handler needs the request facts and the bridge's JSON sender. |
| `main/http/route-table.ts` | `ChassisRouteContext` *(type)* | When to use: a family whose only dependency is the browser chassis — tabs, |
| `main/http/route-table.ts` | `RouteNotFound` *(type)* | When to use: declaring a family's answer for a method+path it does not serve. |
| `main/http/wrap-routes.ts` | `handleWrapRoutes` | When to use: the bridge request handler — dispatch `/wrap/*` (auth first). |
| `main/http/wrap-routes.ts` | `WrapBridge` *(type)* | When to use: wiring the bridge — the wrapper core and the store it serves. |
| `main/http/wrap-routes.ts` | `WrapRouteContext` *(type)* | When to use: building the wrap dispatcher — the wrapper core plus the raw headers its token lives in. |
| `main/input/human-activity.ts` | `shouldCountAsHuman` | Pure decision used by the monitor and by tests. |
| `main/input/human-activity.ts` | `humanListenerScript` | Self-contained listener. Idempotent: a second injection is a no-op. |
| `main/input/human-activity.ts` | `SYNTHETIC_GRACE_MS` | How long after our own dispatch a trusted event is still considered synthetic. |
| `main/input/human-activity.ts` | `HUMAN_CONSOLE_PREFIX` | Console prefix the page uses; anything else is ignored. |
| `main/input/human-activity.ts` | `HumanActivityMonitor` | - |
| `main/input/human-activity.ts` | `HumanActivity` *(type)* | Human takeover detection. |
| `main/input/human-control.ts` | `HumanControlSurface` | The explicit human-takeover latch and its activity monitor. |
| `main/input/human-control.ts` | `HumanControlDeps` *(type)* | Dependencies the latch needs from the agent status and telemetry. |
| `main/input/input-surface.ts` | `InputSurface` | The humanized input path shared by the primitive actions and the bridge routes. |
| `main/input/input-surface.ts` | `InputSurfaceDeps` *(type)* | Dependencies the input surface needs from the active tab and chassis state. |
| `main/input-actions.ts` | `InputActionsController` | When to use: the chassis — own how input actions are performed over the active tab. |
| `main/input-actions.ts` | `InputActionsStatus` *(type)* | When to use: building the chassis — the state surface the actions report through. |
| `main/input-actions.ts` | `InputActionsDeps` *(type)* | When to use: building the chassis — everything an input action reads through. |
| `main/ipc/collaboration-ipc.ts` | `registerCollaborationIpc` | When to use: once at startup, before the first window exists. |
| `main/ipc/collaboration-ipc.ts` | `CollaborationIpcDeps` *(type)* | When to use: once at startup — the service is live only after boot. |
| `main/ipc/connect-info-ipc.ts` | `registerConnectInfoIpc` | When to use: once at startup, before the first window exists. |
| `main/ipc/connect-info-ipc.ts` | `ConnectInfoDeps` *(type)* | When to use: once at startup — the path resolvers are owned by the entry point. |
| `main/ipc/ipc-surface.ts` | `createIpcSurface` | When to use: the chassis boot — build the renderer IPC surface from the host contract. |
| `main/ipc/ipc-surface.ts` | `IpcSurface` | Registers the renderer-facing IPC channels. |
| `main/ipc/ipc-surface.ts` | `IpcSurfaceDeps` *(type)* | The surfaces the renderer IPC channels talk to. |
| `main/ipc/research-ipc.ts` | `registerResearchIpc` | When to use: once at startup, before the first window exists. |
| `main/ipc/research-ipc.ts` | `ResearchIpcDeps` *(type)* | When to use: once at startup — the settings store is created by the boot, not here. |
| `main/ipc/settings-ipc.ts` | `registerSettingsIpc` | When to use: once at startup, before the first window exists. |
| `main/ipc/settings-ipc.ts` | `JevPayload` *(type)* | What Settings → Decision needs to render the JEV panel. |
| `main/ipc/settings-ipc.ts` | `SettingsIpcDeps` *(type)* | When to use: once at startup — every store is created lazily by the caller. |
| `main/ipc/wrap-ipc.ts` | `registerWrapIpc` | When to use: once at startup, before the first window exists. |
| `main/ipc/wrap-ipc.ts` | `WrapIpcDeps` *(type)* | When to use: once at startup — every dependency is live only after boot. |
| `main/jev/controller.ts` | `JevController` | When to use: the chassis — own the JEV gate, funnel, store and counters. |
| `main/jev/controller.ts` | `JevControllerDeps` *(type)* | When to use: building the chassis — the collaborators JEV reads through. |
| `main/jev/depth-store.ts` | `JevDepthStore` | When to use: `JevController` — own the depth store and the reads over it. |
| `main/jev/depth-store.ts` | `JevDepthStoreDeps` *(type)* | When to use: constructing the controller — the policy and the page lookups. |
| `main/jev/engine.ts` | `JevEngine` | - |
| `main/jev/engine.ts` | `JevSection` *(type)* | Just-Enough-View (JEV) page compaction. |
| `main/jev/engine.ts` | `JevSession` *(type)* | - |
| `main/jev/engine.ts` | `JevStatus` *(type)* | - |
| `main/jev/engine.ts` | `JevSearchHit` *(type)* | - |
| `main/jev/funnel.ts` | `JevFunnel` | When to use: `JevController` — own both funnels, the loop breaker and the counters. |
| `main/jev/funnel.ts` | `JevFunnelDeps` *(type)* | When to use: constructing the controller — the policy, the page and the section count. |
| `main/jev/policy-gate.ts` | `JevPolicyGate` | When to use: `JevController` — own the policy provider and its normalisation. |
| `main/jev/policy-gate.ts` | `JevPolicy` *(type)* | When to use: declaring the optional JEV gate; wired by index.ts to the settings store + decision status. |
| `main/jev/policy.ts` | `decideFunnel` | - |
| `main/jev/policy.ts` | `DEFAULT_FUNNEL_MIN_TOKENS` | - |
| `main/jev/policy.ts` | `FunnelBreaker` | Loop breaker: after two refusals for the same URL inside the window, the next |
| `main/jev/policy.ts` | `FunnelReason` *(type)* | JEV hard-funnel policy. |
| `main/jev/policy.ts` | `FunnelInput` *(type)* | - |
| `main/jev/policy.ts` | `FunnelDecision` *(type)* | - |
| `main/jev/read-contract.ts` | `PageReadRequest` *(type)* | A page read the agent asked for, before the JEV funnel judges it. |
| `main/jev/read-contract.ts` | `PrecheckPageReadResult` *(type)* | Cheap pre-harvest check: refuse an obviously oversized read in ~30 ms. |
| `main/jev/read-contract.ts` | `GuardPageReadInput` *(type)* | The guard adds the post-harvest facts (tokens, url, title, content). |
| `main/jev/read-contract.ts` | `PageReadRefusal` *(type)* | What a refusal names: the page facts, the next call to make, the override. |
| `main/jev/read-contract.ts` | `GuardPageReadResult` *(type)* | - |
| `main/llm/probe-transport.ts` | `ProbeTransport` | When to use: any `llm_surface` request — well-known files, a HEAD, or a gated fetch. |
| `main/llm/probe-transport.ts` | `ProbeResponse` *(type)* | What one probe request returned. |
| `main/llm/probe-transport.ts` | `ProbeTransportDeps` *(type)* | When to use: constructing the transport — the session comes from the chassis. |
| `main/llm/read-surface.ts` | `ReadSurface` | The agent-facing read surface over LlmSurface. |
| `main/llm/read-surface.ts` | `ReadSurfaceDeps` *(type)* | Dependencies the read surface needs from the chassis transports. |
| `main/llm/surface-probe.ts` | `SurfaceProbe` | When to use: `LlmSurface.probe` — what LLM-friendly surfaces a site/page offers. |
| `main/llm/surface-probe.ts` | `SurfaceProbeDeps` *(type)* | When to use: constructing the probe — the transport and the active tab come from the chassis. |
| `main/llm/surface-types.ts` | `coded` | An `Error` with the bridge's typed `code` attached. |
| `main/llm/surface-types.ts` | `TEXT_ACCEPT` | Accept header for a plain GET (well-known files, an advertised alternate). |
| `main/llm/surface-types.ts` | `NEGOTIATE_ACCEPT` | Accept header for content negotiation: prefer Markdown, fall back to the page. |
| `main/llm/surface-types.ts` | `MARKDOWN_LINK_RE` | Matches a link type or href that means Markdown. |
| `main/llm/surface-types.ts` | `TEXT_LINK_RE` | Matches a link whose href is a plain-text document. |
| `main/llm/surface-types.ts` | `DEFAULT_READ_CHARS` | Default page budget for `read_url` (a long ToS page exceeds a single call). |
| `main/llm/surface-types.ts` | `MAX_READ_CHARS` | Hard ceiling for one `read_url` page, whatever the caller asks for. |
| `main/llm/surface-types.ts` | `LlmSurfaceKind` *(type)* | A *fetchable* LLM-friendly representation. Deliberately excludes "rendered". |
| `main/llm/surface-types.ts` | `LlmSurfaceScope` *(type)* | Whether a representation covers the whole site (`origin`) or just the page (`page`). |
| `main/llm/surface-types.ts` | `LlmSurfaceNext` *(type)* | The machine-readable next action. `recommended: null` means "there is no |
| `main/llm/surface-types.ts` | `LlmSurfaceEndpoint` *(type)* | When to use: reading one well-known endpoint's result in the report. |
| `main/llm/surface-types.ts` | `LlmSurfaceLink` *(type)* | When to use: one advertised Markdown/Text alternate found on a page. |
| `main/llm/surface-types.ts` | `LlmSurfaceReport` *(type)* | When to use: the `llm_surface` tool's answer. |
| `main/llm/surface-types.ts` | `LlmFetchResult` *(type)* | When to use: the `llm_fetch` tool's answer. |
| `main/llm/surface-types.ts` | `ReadUrlResult` *(type)* | Result of the composite `read_url`: always Markdown text, paged for long documents. |
| `main/llm/surface-types.ts` | `LlmSurfaceDeps` *(type)* | Everything `LlmSurface` needs from the chassis. |
| `main/llm/surface-types.ts` | `OriginProbe` *(type)* | The origin-level probe shape (well-known files only). |
| `main/llm/surface-types.ts` | `PageProbe` *(type)* | The page-level probe shape (live DOM alternates + one negotiation HEAD). |
| `main/marks/inject-script.ts` | `marksInjectorScript` | When to use: `MarksOverlay.injectMarks` — renders the page-side Set-of-Marks scan. |
| `main/marks/inject-script.ts` | `MarksInjectorOptions` *(type)* | When to use: building one mark scan — the sticky anchors and the two scope flags. |
| `main/marks/marks-overlay.ts` | `MarksOverlay` | - |
| `main/marks/marks-overlay.ts` | `MarkItem` *(type)* | - |
| `main/marks/marks-surface.ts` | `MarksSurface` | The agent-facing marks discovery surface over MarksOverlay. |
| `main/marks/marks-surface.ts` | `MarksSurfaceDeps` *(type)* | Dependencies the marks surface needs from the active tab and policy. |
| `main/media/binaries.ts` | `bundledYtDlpPath` | When to use: the packaged/dev lookup of the shipped yt-dlp, before any download. |
| `main/media/binaries.ts` | `writableYtDlpPath` | When to use: the download and update target under the user data directory. |
| `main/media/binaries.ts` | `readYtDlpVersion` | Run `<binary> --version`; null means it did not execute or printed nothing. |
| `main/media/binaries.ts` | `ensureYtDlp` | The yt-dlp this process should run, or a typed error when neither copy works. |
| `main/media/binaries.ts` | `isMediaBinary` | When to use: narrowing an `ensureYtDlp` result before using its path. |
| `main/media/binaries.ts` | `MediaBinarySource` *(type)* | When to use: telling a bundled yt-dlp from one downloaded into the user data directory. |
| `main/media/binaries.ts` | `MediaBinary` *(type)* | When to use: a resolved yt-dlp that can run — path, version and where it came from. |
| `main/media/binaries.ts` | `MediaBinaryError` *(type)* | When to use: `ensureYtDlp` refusing — the code the downloader reports and the message a human reads. |
| `main/media/cookies.ts` | `writeCookieFile` | Write the cookies for `url` (the browser would send this host) to a temp file. |
| `main/media/cookies.ts` | `CookieFile` *(type)* | - |
| `main/media/exec.ts` | `runYtDlpProcess` | - |
| `main/media/exec.ts` | `CommandResult` *(type)* | - |
| `main/media/ffmpeg.ts` | `platformKey` | When to use: naming the managed download folder for the current or a given platform. |
| `main/media/ffmpeg.ts` | `managedFfmpegDir` | When to use: the managed ffmpeg folder under a data root. |
| `main/media/ffmpeg.ts` | `ffmpegFileName` | When to use: the managed binary name (`ffmpeg.exe` on Windows). |
| `main/media/ffmpeg.ts` | `managedFfmpegPath` | When to use: the managed binary's absolute path for install, probe and spawn. |
| `main/media/ffmpeg.ts` | `parseFfmpegVersion` | `ffmpeg version 6.1.1-...` → `6.1.1-...` |
| `main/media/ffmpeg.ts` | `detectFfmpeg` | Resolve ffmpeg for the current settings. `installing` is supplied by the |
| `main/media/ffmpeg.ts` | `installManagedFfmpeg` | Download the pinned managed build for this platform. Idempotent while a |
| `main/media/ffmpeg.ts` | `FfmpegSource` *(type)* | When to use: reporting where the resolved ffmpeg came from — configured path, managed download, or PATH. |
| `main/media/ffmpeg.ts` | `FfmpegInfo` *(type)* | When to use: the Media settings row and `detectFfmpeg` — availability, version, source and error. |
| `main/media/job-complete.ts` | `finishJob` | When to use: any terminal transition — sets state/error/time and persists. |
| `main/media/job-complete.ts` | `completeJob` | When to use: the child closed — clean up, collect files or explain the failure. |
| `main/media/job-complete.ts` | `CompletionDeps` *(type)* | When to use: `MediaJobs.run` — what completion needs from the queue. |
| `main/media/job-process.ts` | `terminate` | Kill the whole process group; yt-dlp spawns ffmpeg as a child. |
| `main/media/job-process.ts` | `startDownloadProcess` | When to use: `MediaJobs.run` — starts the download and returns the child so |
| `main/media/job-process.ts` | `DownloadProcessDeps` *(type)* | When to use: `MediaJobs.run` — everything the process needs from the queue. |
| `main/media/job-types.ts` | `MediaKind` *(type)* | What a job downloads: a video file, or the audio track only. |
| `main/media/job-types.ts` | `MediaQuality` *(type)* | The requested ceiling; `best`/`worst` keep yt-dlp's own ranking. |
| `main/media/job-types.ts` | `MediaJobState` *(type)* | Where a job is in its lifecycle. |
| `main/media/job-types.ts` | `MediaJobFile` *(type)* | When to use: one finished file of a download job. |
| `main/media/job-types.ts` | `MediaProgress` *(type)* | When to use: the parsed `--newline` progress of a running job. |
| `main/media/job-types.ts` | `MediaJob` *(type)* | When to use: `media jobs` — one queued, running or finished download. |
| `main/media/job-types.ts` | `MediaJobInput` *(type)* | When to use: the enqueue call the bridge makes. |
| `main/media/jobs.ts` | `MediaJobs` | - |
| `main/media/jobs.ts` | `MediaJobsOptions` *(type)* | When to use: constructing the queue — paths, binary resolution and the cookie hook. |
| `main/media/media-reader.ts` | `MediaReader` | When to use: `/media/info`, `/media/transcript` and `/media/preview`. |
| `main/media/media-reader.ts` | `MediaReaderDeps` *(type)* | When to use: constructing the reader — the facade owns the binary promise and cookies. |
| `main/media/media-settings.ts` | `MediaSettingsPanel` | When to use: the Settings → Media panel and the media status poll. |
| `main/media/media-settings.ts` | `MediaSettingsDeps` *(type)* | When to use: constructing the panel — the store and updater come from the facade. |
| `main/media/media-types.ts` | `MediaRuntimeStatus` *(type)* | When to use: naming the runtime a media call will use. |
| `main/media/media-types.ts` | `MediaStatus` *(type)* | When to use: `/media/status` and the Settings → Media panel. |
| `main/media/media-types.ts` | `MediaInfo` *(type)* | When to use: reading one video's metadata without downloading it. |
| `main/media/media-types.ts` | `MediaInfoResult` *(type)* | When to use: the `media_info` answer. |
| `main/media/media-types.ts` | `MediaServiceError` *(type)* | A typed binary-resolution failure, re-exported for route typing. |
| `main/media/media-types.ts` | `MediaTranscriptResult` *(type)* | When to use: the `media_transcript` answer — captions as paged text. |
| `main/media/media-types.ts` | `MediaPreviewImage` *(type)* | One poster/thumbnail image, already encoded for the MCP image content block. |
| `main/media/media-types.ts` | `MediaPreviewResult` *(type)* | When to use: the `media_preview` answer — metadata, an excerpt and images. |
| `main/media/media-types.ts` | `MediaDownloadResult` *(type)* | When to use: the `media_download` answer — the queued job, or why it was refused. |
| `main/media/platform.ts` | `mediaPlatformKey` | `win32-x64`, `darwin-arm64`, `linux-x64` — matches `bin/media/<key>`. |
| `main/media/platform.ts` | `ytDlpFileName` | - |
| `main/media/platform.ts` | `ytdlpRuntimeOptions` | Point yt-dlp at Electron's own binary as a Node runtime. |
| `main/media/platform.ts` | `compareYtDlpVersions` | Compare `2026.10.26`-style versions. Returns >0 when `a` is newer. |
| `main/media/platform.ts` | `ytDlpReleaseAsset` | The GitHub release asset name for a target platform. |
| `main/media/platform.ts` | `parseChecksum` | Find one asset hash in a `SHA2-256SUMS` file. |
| `main/media/platform.ts` | `YtDlpRuntimeKind` *(type)* | Pure helpers for the media tooling: platform naming and the yt-dlp runtime. |
| `main/media/platform.ts` | `YtDlpRuntime` *(type)* | - |
| `main/media/process-failure.ts` | `processFailure` | When to use: mapping a `CommandResult` to the media error result, or null on success. |
| `main/media/process-failure.ts` | `ProcessFailureCopy` *(type)* | The per-call wording for a failed one-shot run. |
| `main/media/service.ts` | `MediaService` | - |
| `main/media/service.ts` | `MediaServiceOptions` *(type)* | When to use: the boot — `rootDir` defaults to `<userData>/media`. |
| `main/media/transcript.ts` | `parseVtt` | VTT → plain text. |
| `main/media/transcript.ts` | `transcriptDocument` | The document stored in Cortex for one transcript. |
| `main/media/transcript.ts` | `fetchArtifacts` | Fetch captions (and optionally the thumbnail) into `dir`. |
| `main/media/transcript.ts` | `SubtitleArtifacts` *(type)* | - |
| `main/media/transcript.ts` | `ArtifactResult` *(type)* | - |
| `main/media/updater.ts` | `jitter` | ±10% jitter so a fleet of installs does not hit GitHub on the same second. |
| `main/media/updater.ts` | `MediaUpdater` | - |
| `main/media/updater.ts` | `MediaUpdaterOptions` *(type)* | - |
| `main/menu/context-menu.ts` | `attachContextMenu` | When to use: attach the right-click menu to a browsing tab's WebContents. Builds the |
| `main/menu/context-menu.ts` | `ContextMenuOptions` *(type)* | When to use: attachContextMenu options — the window the menu pops over, plus the new-tab and log hooks. |
| `main/migrate-user-data.ts` | `migrateLegacyUserData` | Import a previous release's Electron `userData` into the current one. |
| `main/migrate-user-data.ts` | `UserDataMigration` *(type)* | - |
| `main/navigation/navigation-surface.ts` | `NavigationSurface` | The active-tab navigate/history/reload surface. |
| `main/navigation/navigation-surface.ts` | `NavigationSurfaceDeps` *(type)* | Dependencies the navigation surface needs from the active tab and chassis state. |
| `main/navigation-error.ts` | `classifyNavigationFailure` | - |
| `main/navigation-error.ts` | `NavigationFailure` *(type)* | Turn Electron `loadURL` failures into stable, user-facing navigation errors. |
| `main/network/cdp-events.ts` | `NetworkEvents` | When to use: `NetworkInterceptor` — dispatch every debugger message here. |
| `main/network/cdp-events.ts` | `CdpEventDeps` *(type)* | When to use: `new NetworkInterceptor` — the buffers the events write into. |
| `main/network/impersonate.ts` | `resolveCurlBinaryPath` | Resolve the pinned binary robustly. |
| `main/network/impersonate.ts` | `hostPlatformHeaders` | The impersonate profile fixes the TLS/H2 fingerprint (and the Chrome major). The user agent and |
| `main/network/impersonate.ts` | `impersonateAvailable` | - |
| `main/network/impersonate.ts` | `isChallenge` | Hard statuses and explicit Cloudflare interstitial markers. |
| `main/network/impersonate.ts` | `fetchStatic` | - |
| `main/network/impersonate.ts` | `StaticFetchResult` *(type)* | - |
| `main/network/impersonate.ts` | `StaticFetchOutcome` *(type)* | - |
| `main/network/network-surface.ts` | `NetworkSurface` | The captured traffic, payloads and stream reads. |
| `main/network/network-surface.ts` | `NetworkSurfaceDeps` *(type)* | Dependencies the network surface needs for directive logging. |
| `main/network/stream-messages.ts` | `StreamMessages` | When to use: `NetworkInterceptor.messages` — one log per interceptor. |
| `main/network/stream-messages.ts` | `FrameInput` *(type)* | One frame as the CDP router saw it, before the log stamps it. |
| `main/network/types.ts` | `CapturedNetworkRequest` *(type)* | When to use: `get_traffic`, `get_api_payload` and the CDP request lifecycle. |
| `main/network/types.ts` | `RealtimeStream` *(type)* | When to use: `get_streams` and the websocket/SSE lifecycle. |
| `main/network/types.ts` | `StreamMessage` *(type)* | When to use: `get_stream_messages` — one websocket frame or one SSE event. |
| `main/network/types.ts` | `NetworkFilter` *(type)* | When to use: `getTraffic` — narrow by URL, method, resource type, status and count. |
| `main/prerender/types.ts` | `PrerenderItem` *(type)* | When to use: one warm background view in the prerender pool. |
| `main/prerender/types.ts` | `PrerenderOptions` *(type)* | When to use: the `prerender_links` tool call. |
| `main/primitives/act-address.ts` | `ActAddressResolver` | When to use: `ActController` — resolve whichever address the caller gave. |
| `main/primitives/act-address.ts` | `ActPlan` *(type)* | The addressing decision `act` makes once, before it touches the page. |
| `main/primitives/act-address.ts` | `ResolvedAddress` *(type)* | What resolving the address produced: the label, the centre and the control facts. |
| `main/primitives/act-controller.ts` | `ActController` | When to use: `Primitives` — own the act flow and its evidence. |
| `main/primitives/act-controller.ts` | `ActControllerDeps` *(type)* | When to use: the facade — the host and the readiness gate act may call. |
| `main/primitives/act-target.ts` | `actSnapshot` | When to use: act — one cheap read of the identity it reports a delta against. |
| `main/primitives/act-target.ts` | `ActTarget` | When to use: `ActController` — resolving a locator to page geometry and facts. |
| `main/primitives/act-target.ts` | `ActSnapshot` *(type)* | When to use: act's delta — the cheap identity of the page at one moment. |
| `main/primitives/contracts.ts` | `DEFAULT_MARKDOWN_BUDGET` | When to use: observe(markdown) — the default view size when the caller gives no budget. |
| `main/primitives/contracts.ts` | `PrimitiveError` | When to use: every refusal the primitives raise — code, message and optional detail. |
| `main/primitives/contracts.ts` | `PrimitivesHost` *(type)* | When to use: the chassis — what the primitives may ask of the active tab. |
| `main/primitives/contracts.ts` | `PrimitiveErrorCode` *(type)* | When to use: a thrown primitive failure — the code the tool layer maps to a hint. |
| `main/primitives/contracts.ts` | `ConditionResult` *(type)* | When to use: wait_for — one condition’s outcome and evidence. |
| `main/primitives/contracts.ts` | `WaitResult` *(type)* | When to use: wait_for / expect — the whole poll result. |
| `main/primitives/contracts.ts` | `PageState` *(type)* | When to use: page_state — the cheap identity snapshot diff() compares. |
| `main/primitives/contracts.ts` | `ObserveOptions` *(type)* | When to use: observe() — the view, the region, the budget and the JEV switch. |
| `main/primitives/contracts.ts` | `FindOptions` *(type)* | When to use: find() — the semantic query and the optional sources. |
| `main/primitives/contracts.ts` | `ActOptions` *(type)* | When to use: act() — the address, the action and the awaited conditions. |
| `main/primitives/control-facts.ts` | `controlFactsExpression` | Build the self-contained expression. Callers only ever pass plain JSON-able options. |
| `main/primitives/control-facts.ts` | `parseControlFacts` | Parse the expression result into typed facts, tolerating an adapter that returned a string. |
| `main/primitives/control-facts.ts` | `ControlAction` *(type)* | - |
| `main/primitives/control-facts.ts` | `ControlFacts` *(type)* | - |
| `main/primitives/control-facts.ts` | `ControlFactsOptions` *(type)* | - |
| `main/primitives/dom-targeting.ts` | `elementExpr` | A page-side expression yielding the addressed element (shadow-aware for selectors). |
| `main/primitives/dom-targeting.ts` | `targetBoxScript` | Resolve a locator to the box of the **control** to act on, scrolling it into view. |
| `main/primitives/dom-targeting.ts` | `fieldFactsScript` | Typed facts about the control a locator addresses — the same shape as the previous |
| `main/primitives/dom-targeting.ts` | `focusControlScript` | Focus the resolved control and report where focus actually ended up. |
| `main/primitives/dom-targeting.ts` | `diagnosticsScript` | Page/window diagnostics including the **deepest** focused element. |
| `main/primitives/dom-targeting.ts` | `inputProbeInstallScript` | Install a one-shot input probe around a typing action: snapshot the addressed control's |
| `main/primitives/dom-targeting.ts` | `inputProbeReadScript` | Read and remove the probe installed by {@link inputProbeInstallScript}. |
| `main/primitives/dom-targeting.ts` | `DEEP_DOM_HELPERS` | Shared helper functions, inlined into every script below. |
| `main/primitives/dom-targeting.ts` | `TargetLocator` *(type)* | - |
| `main/primitives/dom-targeting.ts` | `TargetBox` *(type)* | - |
| `main/primitives/frame-controls.ts` | `addressedFrameControls` | When to use: turning a `getFrames({ includeControls: true })` result into |
| `main/primitives/frame-controls.ts` | `AddressedFrameControl` *(type)* | One addressable control plus the frame it lives in. |
| `main/primitives/observe-controller.ts` | `ObserveController` | When to use: `Primitives` — own the observe projections. |
| `main/primitives/observe-controller.ts` | `ObserveControllerDeps` *(type)* | When to use: `Primitives` — the host, the read tools and the read funnel. |
| `main/primitives/options.ts` | `WaitCondition` *(type)* | When to use: wait_for and expect — one declarative readiness condition. |
| `main/primitives/options.ts` | `ExtractOptions` *(type)* | When to use: extract() — which structure to read and where. |
| `main/primitives/options.ts` | `CollectOptions` *(type)* | When to use: collect_all() — which container to scroll and how far. |
| `main/primitives/text-target.ts` | `textTargetExpression` | Deepest visible element whose trimmed text matches. "Deepest" matters: a card <div> and its |
| `main/primitives/text-target.ts` | `parseTextTargets` | - |
| `main/primitives/text-target.ts` | `resolveTextTargets` | Convenience for callers that already hold a WebContents. |
| `main/primitives/text-target.ts` | `TextTargetOptions` *(type)* | - |
| `main/primitives/text-target.ts` | `TextTargetMatch` *(type)* | - |
| `main/primitives/text-target.ts` | `TextTargetResult` *(type)* | - |
| `main/recipes/compile.ts` | `compileDriveSteps` | Map drive steps to recipe steps. Click steps always become `click`; a `type_text` step becomes a |
| `main/recipes/compile.ts` | `DriveStepLike` *(type)* | - |
| `main/recipes/compile.ts` | `CompileOptions` *(type)* | - |
| `main/recipes/recipe-store.ts` | `loadRecipes` | - |
| `main/recipes/recipe-store.ts` | `originOf` | - |
| `main/recipes/recipe-store.ts` | `recipesFor` | Recipes for this URL, most-recently-verified first. |
| `main/recipes/recipe-store.ts` | `saveRecipe` | - |
| `main/recipes/recipe-store.ts` | `deleteRecipe` | - |
| `main/recipes/recipe-store.ts` | `recordResult` | Record the outcome of a replay; a recipe is retired after RETIRE_AFTER_FAILURES consecutive misses. |
| `main/recipes/recipe-store.ts` | `retireRecipe` | A structural change is not a flaky miss: retire immediately instead of burning three attempts. |
| `main/recipes/recipe-store.ts` | `RecipeStep` *(type)* | - |
| `main/recipes/recipe-store.ts` | `Recipe` *(type)* | - |
| `main/recipes/recipe-store.ts` | `RecipeStore` *(type)* | - |
| `main/recipes/recipe-store.ts` | `SaveRecipeInput` *(type)* | - |
| `main/recipes/replay.ts` | `replayRecipe` | - |
| `main/recipes/replay.ts` | `RecipeRunner` *(type)* | - |
| `main/recipes/replay.ts` | `ReplayStepResult` *(type)* | - |
| `main/recipes/replay.ts` | `ReplayResult` *(type)* | - |
| `main/recording/recording-service.ts` | `onRecordingStatus` | When to use: boot — the HUD subscribes to status changes (one listener). |
| `main/recording/recording-service.ts` | `setRecordingWindow` | When to use: boot — hand the shell window to the recorder so main can ask it to capture. |
| `main/recording/recording-service.ts` | `loadRecordingConfig` | When to use: boot — read `recording.json`, falling back to the defaults when it is missing or corrupt. |
| `main/recording/recording-service.ts` | `getRecordingConfig` | When to use: the settings panel read, and the payload sent to the renderer on start. |
| `main/recording/recording-service.ts` | `saveRecordingConfig` | When to use: the Settings form submit — clamp the numbers, resolve the folder and persist. |
| `main/recording/recording-service.ts` | `getRecordingStatus` | When to use: any status read (`/recording/status` and the settings row). |
| `main/recording/recording-service.ts` | `pickRecordingDir` | When to use: the Browse button — the native folder picker. |
| `main/recording/recording-service.ts` | `startRecording` | Start recording the Cyberdeck window. Resolves when the renderer has the stream running. |
| `main/recording/recording-service.ts` | `readyRecording` | Called by the renderer once the stream and encoder are actually running. |
| `main/recording/recording-service.ts` | `stopRecording` | Ask the renderer to finalise; the file is written when it calls `saveRecording`. |
| `main/recording/recording-service.ts` | `saveRecording` | Called from the renderer with the finished WebM bytes. |
| `main/recording/recording-service.ts` | `failRecording` | When to use: the renderer reports a capture or encode failure — mark the run failed and reject the pending start. |
| `main/recording/recording-service.ts` | `listRecordings` | Finished recordings, newest first. Paths are absolute and ready for a file-upload field. |
| `main/recording/recording-service.ts` | `RecordingConfig` *(type)* | When to use: the Settings → Recording form and `saveRecordingConfig` — the switches, output folder and encode budget. |
| `main/recording/recording-service.ts` | `RecordingResult` *(type)* | When to use: `stopRecording`/`saveRecording` — the finished file and its timelapse arithmetic. |
| `main/recording/recording-service.ts` | `RecordingStatus` *(type)* | When to use: the REC button, the orb light and the settings row — busy/idle plus the last result or error. |
| `main/remote/access.ts` | `RemoteAccess` | When to use: `RemoteService` — one access state per service. |
| `main/remote/access.ts` | `RemoteAccessDeps` *(type)* | When to use: the service constructor — the three controllers and a status reader. |
| `main/remote/auth.ts` | `RemoteAuth` | When to use: `RemoteService` — one auth state per service. |
| `main/remote/auth.ts` | `RemoteAuthDeps` *(type)* | When to use: the service constructor — the paths it already resolved. |
| `main/remote/cloudflared-panel.ts` | `CloudflaredPanel` | When to use: `RemoteService` — one panel per service. |
| `main/remote/cloudflared-panel.ts` | `CloudflaredPanelDeps` *(type)* | When to use: the service constructor — the data dir and the tunnel hooks. |
| `main/remote/gateway-child.ts` | `RemoteGateway` | When to use: `RemoteService` — one child per service. |
| `main/remote/gateway-child.ts` | `RemoteGatewayDeps` *(type)* | When to use: the service constructor — everything the child is launched with. |
| `main/remote/oauth-client.ts` | `oauthClientFile` | - |
| `main/remote/oauth-client.ts` | `readOAuthClient` | - |
| `main/remote/oauth-client.ts` | `createOAuthClient` | - |
| `main/remote/oauth-client.ts` | `ensureOAuthClient` | - |
| `main/remote/oauth-client.ts` | `OAuthClientCredentials` *(type)* | - |
| `main/remote/service.ts` | `RemoteService` | When to use: the app — one service per process. |
| `main/remote/service.ts` | `RemoteServiceOptions` *(type)* | When to use: the app bootstrap — the paths, port and bridge the gateway fronts. |
| `main/remote/settings.ts` | `loadRemoteSettings` | - |
| `main/remote/settings.ts` | `saveRemoteSettings` | - |
| `main/remote/settings.ts` | `RemoteSettings` *(type)* | - |
| `main/remote/tunnel.ts` | `RemoteTunnel` | When to use: `RemoteService` — one tunnel per service. |
| `main/remote/tunnel.ts` | `RemoteTunnelDeps` *(type)* | When to use: the service constructor — the paths and the gateway it fronts. |
| `main/research/anchor-store.ts` | `AnchorStore` | - |
| `main/research/anchor-store.ts` | `StoredAnchor` *(type)* | - |
| `main/research/anchors.ts` | `relocateCitation` | Revalidate a stored anchor against fresh HTML. |
| `main/research/anchors.ts` | `relocateCitations` | - |
| `main/research/anchors.ts` | `anchorHighlights` | - |
| `main/research/anchors.ts` | `CitationAnchor` *(type)* | - |
| `main/research/anchors.ts` | `CitationCandidate` *(type)* | - |
| `main/research/anchors.ts` | `CitationRelocation` *(type)* | - |
| `main/research/citation-anchors.ts` | `CitationAnchors` | When to use: `CitationController` — the anchors and the fetch it revalidates with. |
| `main/research/citation-anchors.ts` | `RevalidationSummary` *(type)* | The outcome of revalidating stored anchors across URLs. |
| `main/research/citation-controller.ts` | `CitationController` | When to use: the chassis — own the anchors, the hand-off and the fetch policy. |
| `main/research/citation-controller.ts` | `CitationControllerDeps` *(type)* | When to use: building the chassis — everything the citation pipeline reads through. |
| `main/research/citation-fetch.ts` | `CitationFetcher` | When to use: `CitationController` — one fetcher per controller. |
| `main/research/citation-fetch.ts` | `CitationFetch` *(type)* | What one citation fetch produced. |
| `main/research/citation-fetch.ts` | `CitationFetcherDeps` *(type)* | When to use: `CitationController` — the settings and the shared research view. |
| `main/research/cooldowns.ts` | `Cooldowns` | When to use: `ResearchSessionController.cooldowns` — one per controller. |
| `main/research/cooldowns.ts` | `CooldownDeps` *(type)* | When to use: `new ResearchSessionController` — the settings to honour and the log. |
| `main/research/crawl-orchestrator.ts` | `CrawlOrchestrator` | When to use: the chassis — own how crawl and topic research runs are orchestrated. |
| `main/research/crawl-orchestrator.ts` | `CrawlSessionPolicy` *(type)* | The session policy a crawl run needs: cooldown guards and engine defaults. |
| `main/research/crawl-orchestrator.ts` | `CrawlOrchestratorDeps` *(type)* | When to use: building the chassis — the five collaborators a run composes. |
| `main/research/crawl-orchestrator.ts` | `RenderCrawlOptions` *(type)* | The options a crawl page render accepts. |
| `main/research/crawl-orchestrator.ts` | `RenderCrawlResult` *(type)* | The result of rendering one crawl page: markdown, links, status, optional hand-off facts. |
| `main/research/crawl-surface.ts` | `CrawlSurface` | The crawl, research-topic and activity-feed surface over the research session. |
| `main/research/crawl-surface.ts` | `CrawlSurfaceDeps` *(type)* | Dependencies the crawl surface needs from the research session and page stores. |
| `main/research/detached-view.ts` | `DetachedViewController` | When to use: the chassis — own the shared off-screen research view and its serialized queue. |
| `main/research/detached-view.ts` | `DetachedLoadOptions` *(type)* | When to use: a detached load — wait bounds, a readiness probe and a post-load hook. |
| `main/research/detached-view.ts` | `DetachedLoadResult` *(type)* | When to use: reading a detached load's outcome — the script result, post-load hook output, HTTP status and content type. |
| `main/research/detached-view.ts` | `DetachedViewDeps` *(type)* | When to use: building the chassis — the view reads through these two collaborators. |
| `main/research/handoff.ts` | `HumanHandoff` | When to use: `CitationController` — one hand-off at a time per controller. |
| `main/research/handoff.ts` | `HumanHandoffResult` *(type)* | The result of a human-handoff read, or null when no human took over. |
| `main/research/handoff.ts` | `HandoffEnvironment` *(type)* | When to use: anything that needs the window, the research view and the HIL. |
| `main/research/handoff.ts` | `HumanHandoffDeps` *(type)* | When to use: `CitationController` — the hand-off's environment plus the anchors. |
| `main/research/research-session-surface.ts` | `ResearchSessionSurface` | The settings, isolated session and cooldown policy behind research runs. |
| `main/research/research-session-surface.ts` | `ResearchSessionSurfaceDeps` *(type)* | Dependencies the research session surface needs to boot its isolated session. |
| `main/research/research-view-surface.ts` | `ResearchViewSurface` | The detached research view and the citation/hand-off pipeline over it. |
| `main/research/research-view-surface.ts` | `ResearchViewSurfaceDeps` *(type)* | Dependencies the research view needs from the window and the HIL manager. |
| `main/research/researcher.ts` | `extractHighlights` | Extractive highlights: paragraphs of the source that mention the most query terms, best first. |
| `main/research/researcher.ts` | `Researcher` | - |
| `main/research/researcher.ts` | `ResearchOptions` *(type)* | - |
| `main/research/researcher.ts` | `ResearchSource` *(type)* | - |
| `main/research/researcher.ts` | `ResearchOutcome` *(type)* | - |
| `main/research/researcher.ts` | `ResearcherDeps` *(type)* | - |
| `main/research/session-controller.ts` | `ResearchSessionController` | When to use: the chassis — own the stealth research session, its settings and WAF cooldowns. |
| `main/research/session-controller.ts` | `ResearchSessionDeps` *(type)* | When to use: building the chassis — the collaborators the research session reads through. |
| `main/research/settings.ts` | `normalizeResearchSettings` | - |
| `main/research/settings.ts` | `looksLikeChallenge` | - |
| `main/research/settings.ts` | `RESEARCH_ENGINES` | - |
| `main/research/settings.ts` | `DEFAULT_RESEARCH_SETTINGS` | - |
| `main/research/settings.ts` | `ResearchSettingsStore` | - |
| `main/research/settings.ts` | `ResearchSettings` *(type)* | - |
| `main/research/settings.ts` | `ResearchSettingsResult` *(type)* | - |
| `main/research/stealth-session.ts` | `StealthSession` | When to use: `ResearchSessionController.stealth` — one per controller. |
| `main/research/stealth-session.ts` | `StealthSessionDeps` *(type)* | When to use: `new ResearchSessionController` — the profile the session must present. |
| `main/research/surface-activity.ts` | `SurfaceActivityDeps` *(type)* | The activity feed + directive log every research surface takes. |
| `main/scripts/script-vault.ts` | `ScriptVault` | - |
| `main/scripts/script-vault.ts` | `SavedScriptMeta` *(type)* | - |
| `main/scripts/scripts-surface.ts` | `ScriptsSurface` | The saved-script vault behind the script routes. |
| `main/scripts/scripts-surface.ts` | `ScriptsSurfaceDeps` *(type)* | Dependencies the script surface needs from the active tab and telemetry. |
| `main/search/search-engine.ts` | `engineHost` | The host an engine loads in; the custom engine resolves the settings template. |
| `main/search/search-engine.ts` | `KNOWN_ENGINES` | - |
| `main/search/search-engine.ts` | `DEFAULT_ENGINE_CHAIN` | Default fallback chain: JS-free, consent-resistant providers first; Google last (it challenges often). |
| `main/search/search-engine.ts` | `SearchHub` | - |
| `main/search/search-engine.ts` | `SearchResult` *(type)* | `search_web` — a configurable, multi-engine search hub (TODO_RESEARCH_CRAWL.md §5, Feature 5). |
| `main/search/search-engine.ts` | `SearchAttempt` *(type)* | - |
| `main/search/search-engine.ts` | `SearchOutcome` *(type)* | - |
| `main/search/search-engine.ts` | `SearchHubDeps` *(type)* | - |
| `main/search/search-surface.ts` | `SearchSurface` | The agent-facing web-search adapter over SearchHub. |
| `main/search/search-surface.ts` | `SearchPolicyTarget` *(type)* | The subset of search options the engine policy rewrites. |
| `main/search/search-surface.ts` | `SearchSurfaceDeps` *(type)* | Dependencies the search surface needs from the research policy and hub. |
| `main/session/session-surface.ts` | `SessionSurface` | The named cookie/session snapshots behind the session routes. |
| `main/session/session-surface.ts` | `SessionSurfaceDeps` *(type)* | Dependencies the session surface needs from the active tab and telemetry. |
| `main/session/session-vault.ts` | `SessionVault` | - |
| `main/session/session-vault.ts` | `SessionSnapshot` *(type)* | - |
| `main/settings/jev.ts` | `DEFAULT_JEV_SETTINGS` | - |
| `main/settings/jev.ts` | `JevSettingsStore` | JEV is an optional feature (not an experimental one): it is offered only when |
| `main/settings/jev.ts` | `JevMode` *(type)* | - |
| `main/settings/jev.ts` | `JevSettings` *(type)* | - |
| `main/settings/json-settings.ts` | `loadJsonSettings` | Read and normalize a settings file; a missing or corrupt file yields defaults. |
| `main/settings/json-settings.ts` | `saveJsonSettings` | Normalize and atomically write; a write failure is reported in the result. |
| `main/settings/json-settings.ts` | `settingsSource` | The object-shape guard every settings normalizer shares; null means "not an object". |
| `main/settings/json-settings.ts` | `SettingsResult` *(type)* | The result every settings normalizer returns. |
| `main/shadow-walk/cdp.ts` | `axProperty` | When to use: reading one accessibility property off a CDP AX node. |
| `main/shadow-walk/cdp.ts` | `axRole` | When to use: reading an AX node's role as a lower-cased label. |
| `main/shadow-walk/cdp.ts` | `contentRect` | When to use: turning a `DOM.getBoxModel` response into a drawable rect; null without a box. |
| `main/shadow-walk/cdp.ts` | `cdpSend` | When to use: a CDP send that targets the root session when no session id is given. |
| `main/shadow-walk/cdp.ts` | `ContentRect` *(type)* | The axis-aligned viewport rect a CDP box model describes. |
| `main/shadow-walk/component-signature.ts` | `componentSignatureOf` | - |
| `main/shadow-walk/component-signature.ts` | `normalizeSurface` | - |
| `main/shadow-walk/component-signature.ts` | `COMPONENT_SIGNATURE_HELPERS` | Page-side helpers, inlined into the marks/observe and text-target scripts. |
| `main/shadow-walk/component-signature.ts` | `ComponentSurface` *(type)* | Component signatures. |
| `main/shadow-walk/force-open.ts` | `isForceOpenArmed` | - |
| `main/shadow-walk/force-open.ts` | `syncForceOpen` | Arm or disarm the document-start patch for one tab. |
| `main/shadow-walk/force-open.ts` | `detectForceOpen` | Ask the current document what a fingerprinting script would see. |
| `main/shadow-walk/force-open.ts` | `ForceOpenSyncResult` *(type)* | - |
| `main/shadow-walk/force-open.ts` | `ForceOpenDetection` *(type)* | - |
| `main/shadow-walk/part-highlight-css.ts` | `buildPartHighlightCss` | - |
| `main/shadow-walk/part-highlight-css.ts` | `PartHost` *(type)* | Pure part-highlight rule builder. |
| `main/shadow-walk/sealed-cdp.ts` | `sessionOf` | When to use: resolving a frame's OOPIF session; undefined means the parent session. |
| `main/shadow-walk/sealed-cdp.ts` | `attachOopifSessions` | When to use: the start of a scan or a measurement — attach each OOPIF target |
| `main/shadow-walk/sealed-cdp.ts` | `detachOopifSessions` | When to use: the finally block of a scan or a measurement. |
| `main/shadow-walk/sealed-cdp.ts` | `MAX_TARGETS` | How many cross-process targets one sealed call may attach. |
| `main/shadow-walk/sealed-cdp.ts` | `SealedSend` *(type)* | One session send: `sessionId` undefined targets the root frame. |
| `main/shadow-walk/sealed-types.ts` | `SealedRect` *(type)* | When to use: any screen-space rect the sealed path reports. |
| `main/shadow-walk/sealed-types.ts` | `SealedControl` *(type)* | When to use: one interactive control found under a closed shadow root. |
| `main/shadow-walk/sealed-types.ts` | `SealedFindOptions` *(type)* | When to use: the `find(sealed:true)` filters. |
| `main/shadow-walk/sealed-types.ts` | `SealedFindResult` *(type)* | When to use: the `find(sealed:true)` result. |
| `main/shadow-walk/sealed-types.ts` | `SealedIdentity` *(type)* | One control as the AX tree describes it, before any geometry is measured. |
| `main/shadow-walk/sealed-types.ts` | `SealedCacheEntry` *(type)* | When to use: the per-tab cache entry the scan writes and the next call reads. |
| `main/shadow-walk/settings.ts` | `normalizeShadowWalkSettings` | When to use: loading or saving the file — coerce an untrusted object into the shape the guards read. |
| `main/shadow-walk/settings.ts` | `loadShadowWalkSettings` | When to use: any Shadow Walk path — the levers with the two environment overrides applied. |
| `main/shadow-walk/settings.ts` | `saveShadowWalkSettings` | When to use: Settings → Shadow Walk save (IPC only; there is no HTTP write route). |
| `main/shadow-walk/settings.ts` | `shadowWalkStatus` | When to use: the status broadcast and the settings panel read. |
| `main/shadow-walk/settings.ts` | `shadowWalkRefusal` | Structured refusal for a guarded surface, or null when the call may proceed. |
| `main/shadow-walk/settings.ts` | `SHADOW_WALK_SETTINGS_FILE` | When to use: the store default, and a test that points it at a temp file. |
| `main/shadow-walk/settings.ts` | `DEFAULT_SHADOW_WALK_SETTINGS` | When to use: a missing or corrupt settings file. |
| `main/shadow-walk/settings.ts` | `shadowWalkSettings` | When to use: the app-wide store the IPC handlers share; tests build their own store instead. |
| `main/shadow-walk/settings.ts` | `ShadowWalkSettingsStore` | When to use: one JSON file of Shadow Walk settings; construct with a temp path in tests. |
| `main/shadow-walk/settings.ts` | `ShadowWalkSettings` *(type)* | When to use: a guard reading one lever, or the Settings form binding the whole document. |
| `main/shadow-walk/settings.ts` | `ShadowWalkSettingsResult` *(type)* | When to use: the load/save reply — normalised settings, or the validation errors. |
| `main/shadow-walk/settings.ts` | `ShadowWalkSurface` *(type)* | When to use: `shadowWalkRefusal` — the four guarded surfaces (sealed, Tab walk, frames, deep open roots). |
| `main/shadow-walk/settings.ts` | `ShadowWalkRefusal` *(type)* | When to use: a guarded call that must tell the agent which switch is off, and why. |
| `main/shadow-walk/settings.ts` | `ShadowWalkStatus` *(type)* | When to use: the status read the Settings panel and the HUD show — levers only, no file path. |
| `main/shadow-walk/shadow-surface.ts` | `ShadowWalkSurface` | The Settings → Shadow Walk policy, frame reads and the trusted Tab walk. |
| `main/shadow-walk/shadow-surface.ts` | `ShadowWalkSurfaceDeps` *(type)* | Dependencies the Shadow Walk surface needs from the tabs and page capture. |
| `main/shadow-walk/tab-walk.ts` | `runTabWalk` | Walk sequential focus from a host. |
| `main/shadow-walk/tab-walk.ts` | `TabWalkOptions` *(type)* | - |
| `main/shadow-walk/tab-walk.ts` | `TabWalkStep` *(type)* | - |
| `main/shadow-walk/tab-walk.ts` | `TabWalkResult` *(type)* | - |
| `main/shell/event-bus.ts` | `ShellBus` | The render fan-out for the shell window and the deck panel. |
| `main/shell/event-bus.ts` | `ShellBusDeps` *(type)* | Dependencies the bus needs to reach the two render surfaces. |
| `main/shield/consent-controller.ts` | `ConsentController` | When to use: the chassis — own the consent sweep: answered-origins memory, timed attempts and the explicit dismiss. |
| `main/shield/consent-controller.ts` | `ConsentControllerDeps` *(type)* | When to use: building the chassis — the wall breaker, the policy and the log/telemetry come from it. |
| `main/shield/shield-breaker.ts` | `ShieldBreaker` | - |
| `main/shield/shield-breaker.ts` | `ShieldDismissResult` *(type)* | - |
| `main/shield/shield-breaker.ts` | `ConsentPolicy` *(type)* | How to answer a consent wall. This is a *preference*, not a licence to click anything that says |
| `main/snapshots/rendered-snapshot.ts` | `RenderedSnapshotEngine` | - |
| `main/snapshots/rendered-snapshot.ts` | `RenderedSnapshotOptions` *(type)* | - |
| `main/snapshots/rendered-snapshot.ts` | `RenderedSnapshotResult` *(type)* | - |
| `main/tabs/page-info.ts` | `readPageInfo` | When to use: reading the active page — prefers the live document over cached state. |
| `main/tabs/page-info.ts` | `PageInfo` *(type)* | The page identity the primitives, JEV and HUD read. |
| `main/tabs/popup-windows.ts` | `PopupWindows` | When to use: `TabManager` — one popup router per window. |
| `main/tabs/popup-windows.ts` | `PopupWiringDeps` *(type)* | The wiring hooks plus the one callback only popups need. |
| `main/tabs/tab-bounds.ts` | `boundsFor` | When to use: `switchTab`, relayout and viewport visibility. |
| `main/tabs/tab-bounds.ts` | `HIDDEN_BOUNDS` | Tucked away, so the view paints nothing (never `hide()`: the page keeps running). |
| `main/tabs/tab-bounds.ts` | `TabBounds` *(type)* | The rect a tab's view occupies. |
| `main/tabs/tab-events.ts` | `createTabEventHandlers` | When to use: building the tab manager — the reaction set for its events. |
| `main/tabs/tab-events.ts` | `ConsoleLine` *(type)* | One page console line. |
| `main/tabs/tab-events.ts` | `TabEventDeps` *(type)* | The chassis callbacks the tab handlers read and write. |
| `main/tabs/tab-events.ts` | `TabEventHandlers` *(type)* | The handlers a `TabManager` installs. |
| `main/tabs/tab-setup.ts` | `TabSetupSurface` | The tab manager and responsive viewport controller, built once per window. |
| `main/tabs/tab-setup.ts` | `ViewportBounds` *(type)* | The page viewport rect inside the shell window. |
| `main/tabs/tab-setup.ts` | `TabSetupDeps` *(type)* | Dependencies the tab setup needs from the shell window and controllers. |
| `main/tabs/tab-surface.ts` | `TabSurface` | The tab verbs behind the MCP tools, routes and renderer IPC. |
| `main/tabs/tab-surface.ts` | `TabSurfaceDeps` *(type)* | Dependencies the tab surface needs from the chassis. |
| `main/tabs/tab-types.ts` | `TabInstance` *(type)* | When to use: anywhere a tab is passed around (manager, registry, events). |
| `main/tabs/tab-types.ts` | `TabManagerOptions` *(type)* | When to use: `new TabManager(...)` — the host window and the app's hooks. |
| `main/tabs/tab-wiring.ts` | `attachTabContextMenu` | When to use: a WebContentsView has no default context menu, so every tab and |
| `main/tabs/tab-wiring.ts` | `wireTab` | When to use: `createTab` — wire one tab view (fresh or promoted) in one call. |
| `main/tabs/tab-wiring.ts` | `TabWiringDeps` *(type)* | When to use: `wireTab` — the app hooks and the manager's two callbacks. |
| `main/tabs/window-open-policy.ts` | `isAuthPopupUrl` | True when the URL looks like an interactive sign-in or authorization endpoint. Used as a |
| `main/tabs/window-open-policy.ts` | `isPopupWindowRequest` | True when this request needs a real window to keep its opener relationship intact. |
| `main/tabs/window-open-policy.ts` | `popupWindowSize` | Window size requested by a `window.open` features string, clamped to something usable. |
| `main/tabs/window-open-policy.ts` | `WindowOpenRequest` *(type)* | How a renderer's `window.open()` / `target="_blank"` request should be handled. |
| `main/tabs/window-open-policy.ts` | `PopupSize` *(type)* | - |
| `main/telemetry/action-ledger.ts` | `ActionLedger` | When to use: the primitives layer recording each action, and `/ledger` reading it back. |
| `main/telemetry/action-ledger.ts` | `FieldFacts` *(type)* | Typed facts about the form control an action addressed. |
| `main/telemetry/action-ledger.ts` | `TransitionTarget` *(type)* | When to use: a ledger record's target — mark id/selector plus the form-control facts when it was a field. |
| `main/telemetry/action-ledger.ts` | `AddressMode` *(type)* | When to use: recording how an action addressed its target — mark id, selector, coordinates or none. |
| `main/telemetry/action-ledger.ts` | `TransitionRecord` *(type)* | When to use: one ledger line — what was done, whether the page changed, and the evidence collected. |
| `main/telemetry/action-ledger.ts` | `TypingOutcome` *(type)* | Evidence collected around a typing action (all in-page; the value itself never leaves the page). |
| `main/telemetry/action-ledger.ts` | `TypingChannel` *(type)* | When to use: naming the input channel that produced (or was attempted for) a typed value. |
| `main/telemetry/action-ledger.ts` | `ActionLedgerOptions` *(type)* | When to use: constructing the ledger — its directory, rotation size and log sink. |
| `main/telemetry/chaos-kinematics.ts` | `generateChaosTrajectory` | Generates an advanced bio-kinematic trajectory incorporating chaos math, |
| `main/telemetry/chaos-kinematics.ts` | `Point` *(type)* | Kuang Grade Mark Eleven — Bio-Kinematic Chaos & Neuromotor Mouse Engine |
| `main/telemetry/chaos-kinematics.ts` | `PathStep` *(type)* | - |
| `main/telemetry/chaos-kinematics.ts` | `ChaosKinematicsOptions` *(type)* | - |
| `main/telemetry/host-fingerprint.ts` | `detectHostBrowserProfile` | Clean, zero-subprocess host browser profile detector. |
| `main/telemetry/host-fingerprint.ts` | `HostBrowserProfile` *(type)* | - |
| `main/telemetry/input/context.ts` | `InputState` | When to use: `HumanizedInputSimulator` — one state object per simulator. |
| `main/telemetry/input/context.ts` | `InputTelemetryReporter` *(type)* | When to use: a caller that wants input telemetry (the HUD and the replay recorder). |
| `main/telemetry/input/context.ts` | `HumanProfile` *(type)* | The human pacing knobs; replaced at runtime by Settings → INPUT. |
| `main/telemetry/input-profile.ts` | `loadInputProfile` | Resolve the active profile: defaults, then the file, then env overrides. |
| `main/telemetry/input-profile.ts` | `saveInputProfile` | Persist a (partial) profile, clamped, and return the profile that is now active. |
| `main/telemetry/input-profile.ts` | `DEFAULT_INPUT_PROFILE` | - |
| `main/telemetry/input-profile.ts` | `InputProfile` *(type)* | - |
| `main/telemetry/telemetry-surface.ts` | `TelemetrySurface` | The log ring, state broadcast and telemetry fan-out shared by every chassis surface. |
| `main/telemetry/telemetry-surface.ts` | `LogEntry` *(type)* | One HUD log line; newest entries sit at the head of the ring. |
| `main/telemetry/telemetry-surface.ts` | `TelemetrySurfaceDeps` *(type)* | Dependencies the telemetry surface needs from the chassis and its renderers. |
| `main/tools/settings.ts` | `normalizeToolSettings` | - |
| `main/tools/settings.ts` | `DEFAULT_TOOL_SETTINGS` | - |
| `main/tools/settings.ts` | `ToolSettingsStore` | File-backed store. One instance is shared by the IPC handlers and the local bridge. |
| `main/tools/settings.ts` | `ToolSettingsValidation` *(type)* | - |
| `main/tray/close-to-tray.ts` | `CloseToTray` | When to use: `TrayManager.closeToTray` — one per tray. |
| `main/tray/close-to-tray.ts` | `CloseToTrayDeps` *(type)* | When to use: `new TrayManager` — the window to watch plus the manager's callbacks. |
| `main/tray/tray-manager.ts` | `TrayManager` | - |
| `main/tray/tray-manager.ts` | `TrayManagerOptions` *(type)* | - |
| `main/tray/tray-menu.ts` | `trayMenuTemplate` | When to use: `Menu.buildFromTemplate` in the tray manager. |
| `main/tray/tray-menu.ts` | `TrayMenuState` *(type)* | When to use: `TrayManager.updateMenu` — the state the menu labels read. |
| `main/tray/tray-menu.ts` | `TrayMenuActions` *(type)* | When to use: `TrayManager.updateMenu` — the actions the menu items invoke. |
| `main/tray/window-visibility.ts` | `WindowVisibility` | When to use: `TrayManager.window` — one per tray. |
| `main/tray/window-visibility.ts` | `WindowVisibilityDeps` *(type)* | When to use: `new TrayManager` — the window, the menu refresh and the app's own hooks. |
| `main/updates/updater.ts` | `updaterDisabledReason` | Why updates are unavailable in this build, or null when they are enabled. |
| `main/updates/updater.ts` | `updaterState` | - |
| `main/updates/updater.ts` | `initUpdater` | Wire the updater and schedule checks. Safe to call once at startup. |
| `main/updates/updater.ts` | `checkForUpdates` | Ask the feed now. Returns the resulting state (never throws). |
| `main/updates/updater.ts` | `installUpdate` | Quit and apply a downloaded update. No-op unless something is ready. |
| `main/updates/updater.ts` | `UpdateStatus` *(type)* | - |
| `main/updates/updater.ts` | `UpdateState` *(type)* | - |
| `main/viewport/controller.ts` | `ViewportController` | - |
| `main/viewport/controller.ts` | `ViewportControllerDeps` *(type)* | - |
| `main/viewport/controller.ts` | `ViewportSetInput` *(type)* | - |
| `main/viewport/emulation.ts` | `DeviceEmulation` | When to use: `ViewportController` — one driver per controller. |
| `main/viewport/emulation.ts` | `DeviceEmulationDeps` *(type)* | When to use: `ViewportController` — the emulation driver plus the app's hooks. |
| `main/window/window-surface.ts` | `WindowSurface` | The shell window's visibility, focus and tray behaviour. |
| `main/window/window-surface.ts` | `WindowSurfaceDeps` *(type)* | Dependencies the window surface needs from the chassis lifecycle. |
| `main/wrap/anyapi/executor.ts` | `coreGate` | Features the core cannot reproduce yet, and therefore stay on the legacy executor. |
| `main/wrap/anyapi/executor.ts` | `AnyApiWrapExecutor` | - |
| `main/wrap/anyapi/executor.ts` | `CoreGate` *(type)* | - |
| `main/wrap/anyapi/executor.ts` | `AnyApiExecutorOptions` *(type)* | - |
| `main/wrap/anyapi/maps.ts` | `projectWrapMaps` | `wrappersDir` is the `<userData>/wrap/wrappers` directory. |
| `main/wrap/anyapi/maps.ts` | `WrapMapProjection` *(type)* | - |
| `main/wrap/anyapi/result.ts` | `splitBlockedHost` | The core has one refusal code for three situations the wrapper surface |
| `main/wrap/anyapi/result.ts` | `wrapErrorCode` | 401/403 means the credential is the actionable problem, not the transport. |
| `main/wrap/anyapi/result.ts` | `wrapFailure` | - |
| `main/wrap/anyapi/result.ts` | `wrapSuccess` | A successful (or failed-upstream, non-2xx already being an error) run. |
| `main/wrap/anyapi/result.ts` | `wrapDryRun` | A dry run. |
| `main/wrap/anyapi/result.ts` | `WrapIdentity` *(type)* | - |
| `main/wrap/anyapi/result.ts` | `WrapFailureOptions` *(type)* | - |
| `main/wrap/anyapi/result.ts` | `WrapRendered` *(type)* | What the wrapper renderer produced for this run; the package never renders. |
| `main/wrap/anyapi/result.ts` | `WrapSuccessInput` *(type)* | - |
| `main/wrap/anyapi/secrets.ts` | `createSecretAdapter` | - |
| `main/wrap/anyapi/secrets.ts` | `WrapSecretSource` *(type)* | - |
| `main/wrap/anyapi/secrets.ts` | `WrapSecretRefusal` *(type)* | - |
| `main/wrap/anyapi/secrets.ts` | `WrapSecretAdapter` *(type)* | - |
| `main/wrap/audit.ts` | `WrapAuditLog` | - |
| `main/wrap/audit.ts` | `WrapAuditEntry` *(type)* | - |
| `main/wrap/core.ts` | `WrapRunOptions` *(type)* | - |
| `main/wrap/core.ts` | `WrapTestInput` *(type)* | - |
| `main/wrap/core.ts` | `WrapCore` *(type)* | - |
| `main/wrap/execute-pipeline.ts` | `executeWrapper` | Run one wrapper call end to end. |
| `main/wrap/execute-pipeline.ts` | `ExecuteOptions` *(type)* | Per-call switches: dry run, raw payload and the page override. |
| `main/wrap/execute-pipeline.ts` | `ExecuteContext` *(type)* | Shared state every run step needs, assembled by the executor. |
| `main/wrap/executor.ts` | `WrapExecutor` | - |
| `main/wrap/executor.ts` | `ExecutorOptions` *(type)* | - |
| `main/wrap/factory.ts` | `wrapCoreMode` | - |
| `main/wrap/factory.ts` | `createWrapExecutor` | - |
| `main/wrap/factory.ts` | `WrapCoreMode` *(type)* | - |
| `main/wrap/input-schema.ts` | `validateArgs` | - |
| `main/wrap/input-schema.ts` | `isPlainObject` | - |
| `main/wrap/input-schema.ts` | `ArgsValidation` *(type)* | - |
| `main/wrap/interpolate.ts` | `buildRequest` | - |
| `main/wrap/interpolate.ts` | `redactHeaders` | - |
| `main/wrap/interpolate.ts` | `interpolateValue` | - |
| `main/wrap/interpolate.ts` | `BuildRequestError` | - |
| `main/wrap/interpolate.ts` | `BuiltRequest` *(type)* | - |
| `main/wrap/limits.ts` | `resolveWrapLimits` | When to use: constructing an executor core. Resolves the shared transport |
| `main/wrap/limits.ts` | `WrapTransportOptions` *(type)* | Options every executor core accepts for transport safety. |
| `main/wrap/limits.ts` | `WrapLimits` *(type)* | Resolved transport limits: every value present, environment defaults applied. |
| `main/wrap/pagination.ts` | `pagePlan` | The paging contract derived from the recipe, or `active: false` for a single request. |
| `main/wrap/pagination.ts` | `itemsOf` | The list a recipe selects from one page, or null when the selection is not a list. |
| `main/wrap/pagination.ts` | `nextPageToken` | Whether another page exists, and what to send next. |
| `main/wrap/pagination.ts` | `mergePages` | Merge several pages into one render. The common case (a `select` that resolves to a |
| `main/wrap/pagination.ts` | `documentsToIndex` | What an opt-in indexer receives: one entry per rendered document when the recipe used |
| `main/wrap/pagination.ts` | `sameOrigin` | Whether two URLs share an origin. |
| `main/wrap/pagination.ts` | `WrapIndexDocument` *(type)* | One rendered document handed to an opt-in indexer (Cortex). |
| `main/wrap/pagination.ts` | `WrapIndexContext` *(type)* | Where an indexed document came from, for the indexer's metadata. |
| `main/wrap/pagination.ts` | `PagePlan` *(type)* | The paging contract derived from `recipe.pagination` for one run. |
| `main/wrap/render.ts` | `renderPayload` | Recipe rendering for one payload, with the legacy fallbacks. |
| `main/wrap/render.ts` | `safeHost` | When to use: an error or a preview that names a host — empty when the URL is malformed. |
| `main/wrap/render.ts` | `previewUrl` | The preview URL for a plan. |
| `main/wrap/render.ts` | `secretVariants` | When to use: redaction — the stored value and its scheme-less form ("Bearer x" also matches "x"). |
| `main/wrap/render.ts` | `redactText` | When to use: a response body or an error excerpt that may echo the credential. |
| `main/wrap/render.ts` | `redactDeep` | When to use: a parsed payload that may echo the credential in a value or a key. |
| `main/wrap/render.ts` | `parseJson` | When to use: a response body before rendering — parsed only when the content type or the shape says JSON. |
| `main/wrap/render.ts` | `toRecords` | When to use: a JSON payload with no recipe — an array becomes rows, an object one row. |
| `main/wrap/render.ts` | `fence` | When to use: a raw body with no recipe — wrap and clip it as one fenced block. |
| `main/wrap/render.ts` | `clip` | When to use: any text the configured character budget caps. |
| `main/wrap/render.ts` | `failure` | When to use: a run that failed before or during the request; the agent sees the code and message. |
| `main/wrap/render.ts` | `isPlainObject` | When to use: telling a JSON object from an array or null while handling a payload. |
| `main/wrap/render.ts` | `clampInt` | When to use: a numeric policy from the wrapper or the environment (timeouts, caps). |
| `main/wrap/render.ts` | `Rendered` *(type)* | When to use: `renderPayload` — the markdown, records and optional documents one run returns. |
| `main/wrap/rendering.ts` | `renderWrapped` | Render one page (or a merged selection) through the wrapper's recipe. |
| `main/wrap/rendering.ts` | `Rendered` *(type)* | The markdown, records and documents a recipe produced for one or more pages. |
| `main/wrap/resolve.ts` | `resolveWrapper` | When to use: `run` / `preview` / `test` on either executor core — resolve the |
| `main/wrap/resolve.ts` | `WrapperResolution` *(type)* | When to use: the result of resolving an id-or-inline wrapper — the wrapper, or the code and message to return. |
| `main/wrap/run-surface.ts` | `bindRunCore` | The surface's bound operations, ready to copy onto an executor instance. |
| `main/wrap/run-surface.ts` | `WrapRunSurface` | The not-found/status/test contract both wrapper executors publish. |
| `main/wrap/run-surface.ts` | `WrapRunSurfaceDeps` *(type)* | When to use: building an executor — where a resolved wrapper actually runs. |
| `main/wrap/run-surface.ts` | `WrapCoreMethods` *(type)* | The four bound operations an executor publishes; see `bindRunCore`. |
| `main/wrap/secret-rules.ts` | `normalizeHosts` | Split `allowedHosts` (an array or a comma/space separated string) into unique hosts. |
| `main/wrap/secret-rules.ts` | `hostAllowed` | True when `host` matches one of the allowed patterns (a `*.` prefix covers subdomains). |
| `main/wrap/secret-rules.ts` | `isSecretRecord` | True when a parsed document entry has the fields every credential needs. |
| `main/wrap/secret-rules.ts` | `metadataOf` | The listable half of a stored record (never the ciphertext). |
| `main/wrap/secret-rules.ts` | `planSecret` | When to use: `SecretStore.set` — the name, the value presence, the hosts, the header |
| `main/wrap/secret-rules.ts` | `planOAuth` | When to use: `SecretStore.set` for kind=oauth2 — the token endpoint and the client id. |
| `main/wrap/secret-rules.ts` | `SecretPlan` *(type)* | The validated core of an input, before it is encrypted. |
| `main/wrap/secret-rules.ts` | `OAuthPlan` *(type)* | The OAuth2 metadata an input asks for, or an empty object for a static credential. |
| `main/wrap/secret-types.ts` | `WrapSecretKind` *(type)* | When to use: a stored credential — a fixed header value, or OAuth2 client credentials. |
| `main/wrap/secret-types.ts` | `WrapOAuthMetadata` *(type)* | When to use: the OAuth2 half of a credential (the client secret is not part of it). |
| `main/wrap/secret-types.ts` | `WrapSecretMetadata` *(type)* | When to use: the Settings list and the bridge's `/wrap/secrets` — metadata only, no value. |
| `main/wrap/secret-types.ts` | `WrapSecretInput` *(type)* | When to use: `SecretStore.set` — what a human filled in. |
| `main/wrap/secret-types.ts` | `SecretCipher` *(type)* | When to use: the app injects Electron's safeStorage implementation. |
| `main/wrap/secret-types.ts` | `SecretResolution` *(type)* | When to use: `SecretStore.resolve` — the header a request needs, or why it could not. |
| `main/wrap/secret-types.ts` | `TokenRequest` *(type)* | When to use: a client-credentials token request. |
| `main/wrap/secret-types.ts` | `TokenResult` *(type)* | When to use: what a token endpoint answered. |
| `main/wrap/secret-types.ts` | `TokenMinter` *(type)* | When to use: `SecretStoreOptions.mintToken` — a test or an alternate endpoint. |
| `main/wrap/secret-types.ts` | `SecretStoreOptions` *(type)* | When to use: `new SecretStore(dir, cipher, options)`. |
| `main/wrap/secret-types.ts` | `SecretRecord` *(type)* | When to use: the persisted record — the metadata plus the encrypted payloads. |
| `main/wrap/secret-types.ts` | `SecretFile` *(type)* | When to use: `SecretFileStore` — the on-disk document. |
| `main/wrap/security.ts` | `assertSafeUrl` | - |
| `main/wrap/security.ts` | `isPrivateHostname` | A hostname that is private by name alone, before any lookup. |
| `main/wrap/security.ts` | `isPrivateAddress` | - |
| `main/wrap/security.ts` | `resolveHosts` | The resolver the policy uses when the host injects none. Exported so a second |
| `main/wrap/security.ts` | `WrapSecurityError` | - |
| `main/wrap/security.ts` | `UrlPolicy` *(type)* | - |
| `main/wrap/store.ts` | `WrapStore` | - |
| `main/wrap/store.ts` | `StoreResult` *(type)* | - |
| `main/wrap/transport.ts` | `fetchWithPolicy` | Fetch one page while enforcing URL policy, redirects, timeout and the byte cap. |
| `main/wrap/transport.ts` | `WrapTransportError` | A transport-policy failure with a stable code callers can match on. |
| `main/wrap/transport.ts` | `TransportContext` *(type)* | The transport fields both executor cores resolve from `WrapLimits`. |
| `main/wrap/transport.ts` | `FetchedResponse` *(type)* | One fetched page after URL policy, redirects and the byte cap. |
| `main/wrap/types.ts` | `WrapMethod` *(type)* | When to use: declaring which request methods a wrapper accepts. |
| `main/wrap/types.ts` | `WrapFormat` *(type)* | When to use: a `wrap_run` call choosing readable markdown, JSON records, or both. |
| `main/wrap/types.ts` | `WrapInputSchema` *(type)* | The subset of JSON Schema used by wrapper inputs. |
| `main/wrap/types.ts` | `WrapRequest` *(type)* | When to use: a wrapper's fixed request — the half an agent may not assemble. |
| `main/wrap/types.ts` | `WrapWrapper` *(type)* | When to use: the stored document `wrap_get` returns and `wrap_create`/`wrap_update` accept. |
| `main/wrap/types.ts` | `WrapManifestEntry` *(type)* | When to use: `wrap_list` rows and the Settings wrappers table. |
| `main/wrap/types.ts` | `WrapPreview` *(type)* | When to use: a dry run and every failure reply — the request that would have been sent, credential-free. |
| `main/wrap/types.ts` | `WrapErrorInfo` *(type)* | When to use: the structured half of a failed run (an agent branches on `code`). |
| `main/wrap/types.ts` | `WrapResponseInfo` *(type)* | When to use: the size and content-type summary attached to a run, plus the raw JSON when asked. |
| `main/wrap/types.ts` | `WrapIndexed` *(type)* | When to use: a recipe that opted into Cortex indexing — how many documents and chunks landed. |
| `main/wrap/types.ts` | `WrapRunResult` *(type)* | When to use: every wrapper tool reply and the executor's return value. |
| `main/wrap/validate-wrapper.ts` | `validateWrapper` | - |
| `main/wrap/validate-wrapper.ts` | `isPlainObject` | - |
| `main/wrap/validate-wrapper.ts` | `WrapperValidation` *(type)* | - |
| `main/zoom/controller.ts` | `ZoomController` | When to use: the chassis — own the zoom policy, override and rendered proportions. |
| `main/zoom/controller.ts` | `ZoomControllerDeps` *(type)* | When to use: building the chassis — everything zoom reads through. |
| `mcp/process-guard.ts` | `installProcessGuards` | When to use: at the top of a stdio MCP server entrypoint, before connecting |
| `mcp/process-guard.ts` | `ProcessGuardOptions` *(type)* | Process resilience shared by the stdio MCP entrypoints. |
| `mcp/server-surface.ts` | `registerHelpTool` | When to use: `createBridgeMcpServer` — register the `help` tool. |
| `mcp/server-surface.ts` | `installToolSurface` | When to use: `createBridgeMcpServer` — install the tools/list and tools/call |
| `mcp/server-surface.ts` | `ToolSurfaceDeps` *(type)* | When to use: `createBridgeMcpServer` — what the interceptors report through. |
| `mcp/skill-guide.ts` | `buildSkillGuide` | When to use: the `mark-eleven://skills/guide` resource and the help tool. |
| `mcp/skill-guide.ts` | `RECOMMENDED_ORDER` | When to use: `mark-eleven://tools/recommended` and help(category:"recommended"). |
| `mcp/skill-guide.ts` | `SkillGuideFlags` *(type)* | When to use: building the server — which reading path the guide should teach. |
| `mcp/stdio-server.ts` | `startStdioServer` | Boot a stdio MCP server and exit non-zero on a fatal startup error. |
| `mcp/stdio-server.ts` | `StdioServerHooks` *(type)* | Hooks for the shared stdio boot envelope. |
| `mcp/tool-groups-data.ts` | `TOOL_GROUPS` | When to use: reading or extending the consolidated surface — the group table itself. |
| `mcp/tool-groups-data.ts` | `ToolArgs` *(type)* | When to use: the arguments a group action maps from. |
| `mcp/tool-groups-data.ts` | `ToolGroupAction` *(type)* | When to use: describing one action inside a consolidated group tool. |
| `mcp/tool-groups-data.ts` | `ToolGroupDefinition` *(type)* | When to use: a tool registration that dispatches actions within one advertised group. |
| `mcp/tool-renderers.ts` | `clampText` | When to use: the dispatcher or a renderer — cap a tool's text so one payload cannot flood the agent context. |
| `mcp/tool-renderers.ts` | `renderImageTool` | The image-bearing tools (viewport screenshots and Set-of-Marks scans). |
| `mcp/tool-renderers.ts` | `renderComponentsTable` | observe(as:"components"): the prose projection plus the machine table decide() consumes. |
| `mcp/tool-renderers.ts` | `renderMediaPreview` | media_preview: text summary plus one image per visible frame. |
| `mcp/tool-renderers.ts` | `renderFrames` | frames: text summary plus one cropped image per child frame. |
| `mcp/tool-renderers.ts` | `ToolRenderer` *(type)* | When to use: the dispatcher — render a tool result, or null to take the default text path. |
| `mcp/tool-surface.ts` | `planToolSurface` | When to use: `createBridgeMcpServer` — decide what the surface should be. |
| `mcp/tool-surface.ts` | `describeTool` | When to use: `registerCatalogTools` — the advertised description for one tool. |
| `mcp/tool-surface.ts` | `registerCatalogTools` | When to use: `createBridgeMcpServer` — register the advertised catalogue. |
| `mcp/tool-surface.ts` | `JEV_TOOL_NAMES` | The reading-path tools whose placement and registration follow JEV. |
| `mcp/tool-surface.ts` | `RECORDING_TOOL_NAMES` | When to use: the human-only recording switch — these are absent when it is off. |
| `mcp/tool-surface.ts` | `ToolPreferences` *(type)* | The persisted tool surface, as the bridge reports it. |
| `mcp/tool-surface.ts` | `ToolSurfacePlan` *(type)* | When to use: `registerCatalogTools` — everything the registry needs per call. |
| `mcp/tools-catalog-types.ts` | `ToolCatalogItem` *(type)* | When to use: any surface that registers or inspects a catalog entry — the one item shape for the whole catalog. |
| `mcp/wrap-bridge.ts` | `currentWrapToken` | The wrap token: the explicit one, else the file the app rotates. |
| `mcp/wrap-bridge.ts` | `callBridge` | When to use: any tool — one request to the bridge, with the standard failures. |
| `mcp/wrap-bridge.ts` | `bridgeError` | The failure text for a non-ok bridge response; every wrap tool reports it the same way. |
| `mcp/wrap-bridge.ts` | `BridgeResponse` *(type)* | What a bridge call produced, including the parsed body. |
| `mcp/wrap-generated-tools.ts` | `GeneratedTools` | When to use: `createWrapMcpServer` — one registry per server. |
| `mcp/wrap-generated-tools.ts` | `GeneratedSync` *(type)* | What one reconciliation changed, so a caller can decide whether to notify. |
| `preload/index.ts` | `ElectronAPI` *(type)* | When to use: the preload bridge surface — every renderer call goes through `window.electronAPI`. |
| `renderer/cortex-panel.ts` | `initCortexPanel` | Wire the modal once, after the document has parsed. |
| `renderer/cortex-panel.ts` | `updateActivePage` | Track the active page for the bookmark star and the save form. |
| `renderer/cortex-panel.ts` | `CortexDeps` *(type)* | Callbacks the panel needs from the app shell. |
| `renderer/deck/panel-tabs.ts` | `switchTab` | When to use: a tab button, a harvest, or a decision arriving. |
| `renderer/deck/panel-tabs.ts` | `DeckTab` *(type)* | Which lower panel is on screen. |
| `renderer/recording.ts` | `isRecording` | - |
| `renderer/recording.ts` | `beginRecording` | - |
| `renderer/recording.ts` | `finishRecording` | - |
| `renderer/recording.ts` | `BeginPayload` *(type)* | - |
| `renderer/research/chrome.ts` | `wireFontScale` | When to use: `initResearchPanel` — the readability control, which zooms the whole |
| `renderer/research/chrome.ts` | `ResearchChrome` | When to use: `initResearchPanel` — one chrome per panel. |
| `renderer/research/chrome.ts` | `ResearchChromeDeps` *(type)* | When to use: `ResearchChrome` — the nodes it shows, hides and paints. |
| `renderer/research/elements.ts` | `collectResearchElements` | When to use: `initResearchPanel` first — null means the surface is not in this page |
| `renderer/research/elements.ts` | `ResearchElements` *(type)* | When to use: `initResearchPanel` — the panel's DOM. |
| `renderer/research/handlers.ts` | `stopTicker` | Stop the elapsed-time ticker. |
| `renderer/research/handlers.ts` | `beginRun` | When to use: a new run — clear the surface, zero the counters and start the clock. |
| `renderer/research/handlers.ts` | `applyResearchEvent` | When to use: an event from `onResearchEvent`. |
| `renderer/research/handlers.ts` | `ResearchContext` *(type)* | When to use: `applyResearchEvent` — the panel's collaborators and the run clock. |
| `renderer/research/log-view.ts` | `ResearchLog` | When to use: `initResearchPanel` — one log per panel. |
| `renderer/research/log-view.ts` | `ResearchLogDeps` *(type)* | When to use: `initResearchPanel` — the nodes the log writes into. |
| `renderer/research/rows.ts` | `SourceRows` | When to use: `initResearchPanel` — one table per panel. |
| `renderer/research/rows.ts` | `SourceRow` *(type)* | When to use: a row in the source table — its cells, kept for later events. |
| `renderer/research/rows.ts` | `SourceRowsDeps` *(type)* | When to use: `SourceRows` — the table body and the bridge for the citation check. |
| `renderer/settings-alert.ts` | `showAlert` | Show an inline result message; a missing element is a no-op. |
| `renderer/settings-alert.ts` | `validationMessage` | The message a failed settings call reports: the validation errors, or the fallback. |
| `renderer/settings-alert.ts` | `AlertKind` *(type)* | Shared alert chrome for the settings panels. |
| `renderer/settings-wrap-auth.ts` | `populateAuthOptions` | Repaint the credential dropdown from the current secret names. |
| `renderer/settings-wrap-auth.ts` | `updateCredentialPanel` | Show the inline credential fields only when "+ New credential" is selected. |
| `renderer/settings-wrap-auth.ts` | `resetCredentialPanel` | Clear the inline credential fields without touching the saved list. |
| `renderer/settings-wrap-auth.ts` | `getSelectedAuth` | Current credential selection; `__new__` means the inline form is active. |
| `renderer/settings-wrap-auth.ts` | `prefillCredentialHost` | Prefill the credential host when the wrapper URL changes. |
| `renderer/settings-wrap-auth.ts` | `ensureCredential` | Create the inline credential and return the name the wrapper should reference. |
| `renderer/settings-wrap-auth.ts` | `initWrapAuth` | Bind the picker's own change handlers; the wrapper form binds the URL field. |
| `renderer/settings-wrap-auth.ts` | `WrapAuthDeps` *(type)* | Credential-picker dependencies: current names, reload, and the URL used to prefill a host. |
| `renderer/settings-wrap-wrappers.ts` | `loadWrapWrappers` | Load the wrapper list from the main process and optionally open one. |
| `renderer/settings-wrap-wrappers.ts` | `initWrapWrappers` | Wire the wrapper editor once, after the settings modal's DOM exists. |
| `renderer/settings-wrap-wrappers.ts` | `refreshWrapperAuthOptions` | Repaint the credential picker after the credential list changed. |
| `renderer/settings-wrap-wrappers.ts` | `closeWrapWrapperModal` | Close the editor when the settings modal itself closes. |
| `renderer/settings-wrap-wrappers.ts` | `WrapWrapperDeps` *(type)* | Editor dependencies: the credential names and a reload after an inline create. |
| `shared/collaboration.ts` | `CollaborationTargetKind` *(type)* | When to use: recording what a note is attached to — an element, text, frame, console line, request, region, style or the page. |
| `shared/collaboration.ts` | `CollaborationTarget` *(type)* | When to use: the anchor stored on a thread — the url, tab/frame, mark id or selector that survives a reload. |
| `shared/collaboration.ts` | `CollaborationMessageKind` *(type)* | When to use: rendering a thread message — a comment, question, choice, answer or status line. |
| `shared/collaboration.ts` | `CollaborationMessage` *(type)* | When to use: one human or agent message inside a collaboration thread. |
| `shared/collaboration.ts` | `CollaborationThreadStatus` *(type)* | When to use: filtering or resolving threads — open, answered, resolved or stale. |
| `shared/collaboration.ts` | `CollaborationThread` *(type)* | When to use: the `collaborate` read/list actions — one target, its messages and its resolution. |
| `shared/collaboration.ts` | `CollaborationFilter` *(type)* | When to use: `listCollaborationThreads` — narrow by url, status, tab or count. |
| `shared/collaboration.ts` | `CollaborationResult` *(type)* | When to use: the collaboration tool reply — one thread, many, or the error. |
| `shared/connect-info.ts` | `ConnectInfo` *(type)* | When to use: any code that types the `app:connect-info` response. |
| `shared/experimental.ts` | `normalizeExperimentalSettings` | When to use: reading the experimental flag — only an explicit true enables collab. |
| `shared/experimental.ts` | `DEFAULT_EXPERIMENTAL_SETTINGS` | When to use: a first run, or a settings file that could not be read. |
| `shared/experimental.ts` | `ExperimentalSettings` *(type)* | Experimental features. Everything here is opt-in and may change or be removed. |
| `shared/media.ts` | `FfmpegMode` *(type)* | Shared media settings and updater state (main, preload, renderer). |
| `shared/media.ts` | `MediaSettings` *(type)* | When to use: the Media settings panel and the downloader — updates, cookies, output and ffmpeg policy. |
| `shared/media.ts` | `MediaUpdaterState` *(type)* | When to use: the Media panel updater row — installed/latest version, check and update state. |
| `shared/media.ts` | `MediaSettingsSnapshot` *(type)* | When to use: `loadMediaSettings` — the settings and the updater state together. |
| `shared/menu.ts` | `PopupMenuItem` *(type)* | One row of a themed popup menu (rendered by src/renderer/menu-popup.ts). |
| `shared/menu.ts` | `PopupMenuSelection` *(type)* | When to use: what the themed popup reports back when a row (or its secondary action) is chosen. |
| `shared/menu.ts` | `PopupAnchor` *(type)* | Where a popup should anchor, in shell content-area coordinates. |
| `shared/menu.ts` | `SidebarSurfaceState` *(type)* | Authoritative deck-surface state; native bounds and DOM classes derive from it. |
| `shared/remote.ts` | `RemoteCloudflaredStatus` *(type)* | When to use: the Remote settings panel — whether cloudflared exists, and how it updates. |
| `shared/remote.ts` | `RemoteTunnelStatus` *(type)* | When to use: the Remote panel and `remote_status` — the tunnel state, hostname and error. |
| `shared/remote.ts` | `RemoteStatus` *(type)* | When to use: `remote_status` and Settings — the gateway plus both cloudflared and tunnel halves. |
| `shared/remote.ts` | `RemoteInfo` *(type)* | When to use: the connect-info read — everything a client needs to point at this app. |
| `shared/research-events.ts` | `ResearchTier` *(type)* | Research run events. |
| `shared/research-events.ts` | `ResearchEscalation` *(type)* | When to use: a research event that moved to the render tier, and the outcome carrying its reason. |
| `shared/research-events.ts` | `ResearchAnchorDetail` *(type)* | When to use: a source's captured anchor — text, path and fingerprint for revalidation. |
| `shared/research-events.ts` | `ResearchEvent` *(type)* | When to use: `onResearchEvent` — the run timeline the panel renders and the agent observes. |
| `shared/tool-instructions.ts` | `normalizeInstructionMap` | When to use: `instructions` — a name → text map from persisted settings or the bridge. |
| `shared/tool-instructions.ts` | `normalizeActionInstructions` | When to use: `actionInstructions` — a tool → action → text map. |
| `shared/tool-instructions.ts` | `InstructionLimits` *(type)* | When to use: the callers that need an allow-list and/or a length cap. |
| `shared/tool-instructions.ts` | `ActionInstructionLimits` *(type)* | When to use: `actionInstructions` — each tool keeps its own action allow-list. |
| `shared/tool-settings.ts` | `ToolSettings` *(type)* | Persisted overrides for the advertised browser MCP tool surface. |
| `shared/tool-settings.ts` | `ToolManagerAction` *(type)* | When to use: the Tools panel — one action of a grouped tool and its instruction override. |
| `shared/tool-settings.ts` | `ToolManagerEntry` *(type)* | When to use: the Tools panel list — one advertised tool with its tier, state and overrides. |
| `shared/tool-settings.ts` | `ToolManagerState` *(type)* | When to use: `get_tool_manager` — the catalogue plus the saved settings. |
| `shared/tool-settings.ts` | `ToolManagerResult` *(type)* | When to use: the tool-manager IPC replies. |
| `shared/types.ts` | `AgentStatus` *(type)* | When to use: the HUD status badge and the tray menu status line. |
| `shared/types.ts` | `CursorPosition` *(type)* | When to use: the ghost-cursor overlay and the input trace — the last observed pointer position. |
| `shared/types.ts` | `TelemetryEvent` *(type)* | When to use: the HUD feed and the action ledger — one observed browser action. |
| `shared/types.ts` | `HarvestedConstruct` *(type)* | When to use: the CONSTRUCT panel and `harvest` — the page as markdown plus its coverage stats. |
| `shared/types.ts` | `TabSummary` *(type)* | When to use: the tab strip and `list_tabs`. |
| `shared/types.ts` | `ChassisState` *(type)* | When to use: the state broadcast that paints the deck — url, agent status, tabs, zoom and viewport. |
| `shared/viewport.ts` | `specFromProfile` | When to use: applying a preset — the spec a `DeviceProfile` emulates. |
| `shared/viewport.ts` | `normalizeViewportSpec` | When to use: a `browser_viewport` set — clamp the requested size and DPR into a usable spec. |
| `shared/viewport.ts` | `normalizeDeviceProfile` | When to use: saving a device — validate a human's profile, or null when it is unusable. |
| `shared/viewport.ts` | `orientationOf` | When to use: the status read and the rotate result. |
| `shared/viewport.ts` | `rotateSpec` | Swap width/height, keeping the physical device size. |
| `shared/viewport.ts` | `fitViewport` | Fit an emulated device inside the browsing area. |
| `shared/viewport.ts` | `findProfile` | When to use: resolving a preset id from the catalogue. |
| `shared/viewport.ts` | `BUILTIN_PROFILES` | When to use: the device dropdown and preset lookup — the phones, tablets and desktop sizes shipped with the app. |
| `shared/viewport.ts` | `MIN_VIEWPORT_DIMENSION` | When to use: validating or clamping a custom width/height. |
| `shared/viewport.ts` | `MAX_VIEWPORT_DIMENSION` | When to use: validating or clamping a custom width/height. |
| `shared/viewport.ts` | `MIN_DEVICE_SCALE` | When to use: validating or clamping a custom device scale factor. |
| `shared/viewport.ts` | `MAX_DEVICE_SCALE` | When to use: validating or clamping a custom device scale factor. |
| `shared/viewport.ts` | `MAX_CUSTOM_PROFILES` | When to use: the saved-device limit the profile store enforces. |
| `shared/viewport.ts` | `VIEWPORT_MARGIN` | Empty space kept around the emulated device inside the browsing area. |
| `shared/viewport.ts` | `Orientation` *(type)* | When to use: reporting whether a viewport is taller than it is wide. |
| `shared/viewport.ts` | `DeviceProfile` *(type)* | When to use: a selectable device preset — shipped with the app or saved by a human. |
| `shared/viewport.ts` | `ViewportSpec` *(type)* | When to use: the emulation applied to one tab — a profile's values, or a custom size. |
| `shared/viewport.ts` | `ViewportRect` *(type)* | When to use: a rectangle in DIP — the browsing area, or the emulated frame inside it. |
| `shared/viewport.ts` | `ViewportState` *(type)* | When to use: the HUD and `browser_viewport` status read — spec, frame, scale and profiles. |
| `shared/web-state.ts` | `WebPageState` *(type)* | Page-level signals collected for the WEB STATE tab on the Command Deck. |
| `shared/zoom.ts` | `normalizeZoomSettings` | When to use: reading the persisted zoom settings — keep only a known mode. |
| `shared/zoom.ts` | `nextZoomStep` | When to use: Ctrl+= / Ctrl+- and the toolbar zoom buttons. |
| `shared/zoom.ts` | `clampZoomFactor` | When to use: an explicit factor arriving over IPC or from the agent tool. |
| `shared/zoom.ts` | `DEFAULT_ZOOM_SETTINGS` | When to use: a first run, or a settings file that could not be read. |
| `shared/zoom.ts` | `ZOOM_STEPS` | Chrome-like zoom stops, used by the toolbar and the agent-facing tool. |
| `shared/zoom.ts` | `ZoomMode` *(type)* | Page zoom policy and the shape reported to the HUD, IPC callers and MCP. |
| `shared/zoom.ts` | `ZoomSettings` *(type)* | When to use: the persisted zoom policy file. |
| `shared/zoom.ts` | `ZoomState` *(type)* | When to use: the zoom readout, the status consumers and `browser_zoom`. |

## Modules (297)

| File | Export | When to use |
|---|---|---|
| `main/boot/start-loops.ts` | `startLoops` | When to use: the chassis constructor — start the uptime tick and the HUD watchdog. |
| `main/brand-icon.ts` | `brandIconPath` | When to use: a surface that needs the asset path itself (window icon). |
| `main/brand-icon.ts` | `brandIcon` | When to use: a tray/HIL icon — the brand mark at the requested square size, |
| `main/browser/frame-marks.ts` | `clearFrameMarks` | - |
| `main/browser/frame-marks.ts` | `registerFrameMarks` | - |
| `main/browser/frame-marks.ts` | `resolveFrameMark` | Resolve a frame mark to a live page-space target. Returns null when the frame navigated, the |
| `main/browser/stealth.ts` | `stealthHeaders` | When to use: any request that must carry the host's client hints. |
| `main/browser/stealth.ts` | `applyHostProfile` | When to use: a `WebContents` that must present as the host browser. |
| `main/browser/stealth.ts` | `applyStealthHeaders` | When to use: a bare session (the research view) that only needs the headers. |
| `main/browser-chassis.ts` | `BrowserChassis` | - |
| `main/capabilities.ts` | `BRIDGE_CAPABILITIES` | The bridge capabilities advertised by `bridge_health`. |
| `main/chassis/accessors.ts` | `reassertChassisViewport` | Re-assert the shell and tab views after a window/display transition. |
| `main/chassis/accessors.ts` | `setViewportVisibility` | Keep the deck overlay and the emulated tab viewport in step. |
| `main/chassis/accessors.ts` | `activeWebContents` | The active tab's web contents, with the network tap attached. |
| `main/chassis/accessors.ts` | `pageInfo` | The live page identity, preferring the document over the cached state. |
| `main/chassis/accessors.ts` | `currentRevision` | When to use: reading the page revision the bridge reports. |
| `main/chassis/accessors.ts` | `bumpRevision` | When to use: after a navigation or mutating action — bump and return the revision. |
| `main/chassis/accessors.ts` | `queryChassisJson` | The `query_json_data` source resolution over the live network/download store. |
| `main/chassis/accessors.ts` | `prerenderLinks` | Pre-render candidate links from the active page. |
| `main/chassis/accessors.ts` | `readUrlRender` | A URL rendered to Markdown through the shared detached view (`read_url` fallback). |
| `main/chassis/accessors.ts` | `captureScreenshotJpeg` | A baseline viewport JPEG for the decision model. |
| `main/collaboration/assets/css.ts` | `COLLAB_CSS` | When to use: injecting the shared styling for either collaboration surface. |
| `main/collaboration/assets/note-drawer-a.ts` | `NOTE_DRAWER_BODY_A` | When to use: composing the note-composer script — the DOM, drag and minimising half. |
| `main/collaboration/assets/note-drawer-b.ts` | `NOTE_DRAWER_BODY_B` | When to use: composing the note-composer script — the comment and class-editor half. |
| `main/collaboration/assets/overlay-body.ts` | `OVERLAY_BODY_A` | When to use: composing the overlay — the part before the exit-prefix line. |
| `main/collaboration/assets/overlay-body.ts` | `OVERLAY_BODY_C` | When to use: composing the overlay — the part after the exit-prefix line. |
| `main/collaboration/assets/picker-body.ts` | `PICKER_BODY` | When to use: composing the picker script after its drawer/inset head. |
| `main/collaboration/service.ts` | `CollaborationService` | - |
| `main/cortex/bookmark-store.ts` | `BookmarkStore` | When to use: constructing `CortexDB` — the store shares the connection. |
| `main/cortex/connection.ts` | `seedHistoryRow` | The history table's seed row: the manual page an agent can always recall. |
| `main/cortex/connection.ts` | `CortexConnection` | When to use: constructing `CortexDB` — one connection per storage directory. |
| `main/cortex/cortex-db.ts` | `cortex` | - |
| `main/cortex/cortex-db.ts` | `CortexDB` | - |
| `main/cortex/history-store.ts` | `HistoryStore` | When to use: constructing `CortexDB` — history reads bookmarks for suggestions. |
| `main/cortex/script-store.ts` | `ScriptStore` | When to use: constructing `CortexDB` — the store shares the connection. |
| `main/data-paths.ts` | `dataRoot` | - |
| `main/data-paths.ts` | `dataPath` | - |
| `main/data-paths.ts` | `writeJsonAtomic` | When to use: persisting a JSON settings/state file — mkdir, write to a temp |
| `main/decide/config.ts` | `resolveDecisionConfig` | Resolve configuration (env overrides file). Returns null when nothing is configured. |
| `main/decide/config.ts` | `readStoredDecisionConfig` | Raw configuration as stored on disk (file values only — env is read at resolve time). |
| `main/decide/config.ts` | `saveDecisionConfig` | Persist (or clear) `data/decision.json`. Returns the resolved status so the caller can show |
| `main/decide/config.ts` | `decisionStatus` | Shape reported by `/health` and `help`, so an agent can tell whether `decide` will work. |
| `main/decide/decision-client.ts` | `runDecision` | One decision call. Never throws: failures are returned as typed results. |
| `main/decide/events.ts` | `onDecision` | Subscribe to completed decision calls (the HUD mirrors this; it never gates the call). |
| `main/decide/events.ts` | `emitDecisionEvent` | When to use: after a call completes — fan the record out to the HUD. |
| `main/decide/local.ts` | `runLocalOnnx` | When to use: the local-onnx protocol. |
| `main/decide/transport.ts` | `runTypesafe` | When to use: the typesafe protocol. |
| `main/deck/collab-providers.ts` | `CollabProviders` | When to use: `CollabController` — the deck's collab wiring points. |
| `main/deck/page-script.ts` | `runInPage` | When to use: any collab in-page call — returns undefined when the tab is gone. |
| `main/diagnostics/main-log.ts` | `mainLogFile` | - |
| `main/diagnostics/main-log.ts` | `logMainEvent` | - |
| `main/hil/hil-store.ts` | `HilRequestStore` | When to use: `HilManager` — one store per process. |
| `main/http/bookmarks-routes.ts` | `handleBookmarkRoutes` | When to use: the bridge request handler — dispatch `/bookmarks`. Returns |
| `main/http/bridge-errors.ts` | `sendBridgeError` | When to use: the bridge's catch block — translate a thrown error into the |
| `main/http/bridge-log.ts` | `logBridge` | Write one bridge line to the console and to `data/logs/http-bridge.log`. |
| `main/http/bridge-log.ts` | `redactLogValue` | Keep bridge logs useful without copying credentials or wrapper payload secrets into them. |
| `main/http/cortex-routes.ts` | `handleCortexRoutes` | When to use: the bridge request handler — dispatch `/cortex/*`. Returns false |
| `main/http/decision-routes.ts` | `handleDecisionRoutes` | When to use: the bridge request handler — dispatch the recipe store and the |
| `main/http/hil-routes.ts` | `handleHumanInterventionRoutes` | When to use: the bridge request handler — dispatch `/hil/*`. Returns false |
| `main/http/human-control.ts` | `refuseWhileHumanActive` | When to use: the top of the bridge handler — answer 409 and report true when a |
| `main/http/jev-routes.ts` | `handleJevRoutes` | When to use: the bridge request handler — dispatch `/jev/*`. Returns false |
| `main/http/marks-routes.ts` | `handleMarkRoutes` | When to use: the bridge request handler — dispatch `/marks/*`. Returns false |
| `main/http/nav-routes.ts` | `handleNavRoutes` | When to use: the bridge request handler — dispatch navigation and direct |
| `main/http/primitives-routes.ts` | `handlePrimitiveRoutes` | When to use: the bridge request handler — dispatch the primitive verbs. |
| `main/http/read-routes.ts` | `handleReadRoutes` | When to use: the bridge request handler — dispatch page reads and capture. |
| `main/http/recording-routes.ts` | `handleRecordingRoutes` | When to use: the bridge request handler — dispatch `/recording/*`. Returns |
| `main/http/research-routes.ts` | `handleResearchRoutes` | When to use: the bridge request handler — dispatch the research routes. |
| `main/http/scripts-routes.ts` | `handleScriptRoutes` | When to use: the bridge request handler — dispatch `/scripts/*`. Returns |
| `main/http/server-lifecycle.ts` | `logListenError` | When to use: the server `error` event — explain a port clash instead of a bare EADDRINUSE. |
| `main/http/server-lifecycle.ts` | `announceListening` | When to use: the `listen` callback — announce the active gateway in the console and activity log. |
| `main/http/session-routes.ts` | `handleSessionRoutes` | When to use: the bridge request handler — dispatch `/session/*` and the |
| `main/http/tabs-routes.ts` | `handleTabRoutes` | When to use: the bridge request handler — dispatch `/tabs/*`. Returns false |
| `main/http/window-routes.ts` | `handleWindowRoutes` | When to use: the bridge request handler — dispatch `/window/*`. Returns |
| `main/http/workspace-routes.ts` | `handleWorkspaceRoutes` | When to use: the bridge request handler — dispatch `/zoom` and `/viewport`. |
| `main/http-bridge.ts` | `startHttpBridge` | - |
| `main/ipc/media-ipc.ts` | `registerMediaIpc` | When to use: once at startup — reads the service lazily, because boot creates it. |
| `main/ipc/recording-ipc.ts` | `registerRecordingIpc` | When to use: once at startup, before the first window exists. |
| `main/ipc/web-state-ipc.ts` | `registerWebStateIpc` | When to use: once at startup — the handler reads the active tab on demand. |
| `main/llm/alternates.ts` | `readAlternates` | When to use: `SurfaceProbe.probePage` — the live page's declared/anchored alternates. |
| `main/llm/llm-surface.ts` | `LlmSurface` | - |
| `main/llm/surface-url.ts` | `isPageUrl` | A URL with a non-root path is "a page", which should prefer a page-level representation. |
| `main/llm/surface-url.ts` | `kindScope` | Origin-level kinds cover the whole site; markdown/text cover one page. |
| `main/llm/surface-url.ts` | `resolveSurfaceUrl` | The URL the caller meant: the explicit one, or the active tab's. Anything |
| `main/llm/surface-url.ts` | `normalizeUrl` | Cache key: the URL without its hash or a trailing slash. |
| `main/marks/format-mark.ts` | `formatMark` | Renders one Set-of-Marks entry as a compact, accessibility-aware line: |
| `main/media/auth.ts` | `needsLogin` | Does yt-dlp's output say the site wants a signed-in session? |
| `main/media/cookie-format.ts` | `toNetscape` | Netscape cookie-file text for yt-dlp's `--cookies`. |
| `main/media/info-payload.ts` | `warningCodes` | stderr markers worth surfacing as warnings rather than failures. |
| `main/media/info-payload.ts` | `buildInfo` | When to use: after `--dump-single-json` — one payload to the public shape. |
| `main/media/job-files.ts` | `listFiles` | When to use: after a successful download — the real files, largest first. |
| `main/media/job-format.ts` | `buildFormatSelector` | Format selector for one job. |
| `main/media/job-format.ts` | `buildDownloadArgs` | yt-dlp arguments for a job. Every value is built here, never passed through. |
| `main/media/job-format.ts` | `parseProgressLine` | Parse one `--newline` progress line. Returns null for lines that are not progress. |
| `main/media/job-format.ts` | `blankProgress` | A progress row with no measurements yet, for the given stage. |
| `main/media/job-store.ts` | `JobHistoryStore` | When to use: constructing `MediaJobs` — one history file per root directory. |
| `main/media/settings.ts` | `normalizeMediaSettings` | - |
| `main/media/settings.ts` | `DEFAULT_MEDIA_SETTINGS` | - |
| `main/media/settings.ts` | `MediaSettingsStore` | - |
| `main/media/updater-http.ts` | `requestReleaseJson` | When to use: the GitHub release lookup — JSON with the GitHub media type. |
| `main/media/updater-http.ts` | `requestReleaseText` | When to use: downloading the checksum list — plain text, redirects followed. |
| `main/metrics.ts` | `bump` | - |
| `main/metrics.ts` | `snapshot` | - |
| `main/metrics.ts` | `summary` | Grouped summary for `bridge_health` — three numbers instead of a wall of keys. |
| `main/metrics.ts` | `resetMetrics` | - |
| `main/network/network-interceptor.ts` | `NetworkInterceptor` | When to use: the chassis network surface — one interceptor per app. |
| `main/network/stream-registry.ts` | `StreamRegistry` | When to use: `NetworkInterceptor.streams` — one registry per interceptor. |
| `main/network/traffic-buffer.ts` | `TrafficBuffer` | When to use: `NetworkInterceptor.traffic` — one buffer per interceptor. |
| `main/prerender/candidate-links.ts` | `extractCandidateLinks` | When to use: `prerender` without an explicit URL list — top outgoing links. |
| `main/prerender/harvest.ts` | `harvestPrerenderedItem` | When to use: after a view is pooled — index it so the read is already warm. |
| `main/prerender/pool.ts` | `PrerenderPool` | When to use: `PrerenderEngine` — one pool per process. |
| `main/prerender/prerender-engine.ts` | `PrerenderEngine` | When to use: the chassis — own the warm views and the background harvest. |
| `main/prerender/url.ts` | `normalizePrerenderUrl` | When to use: comparing a requested URL to a pooled one (query order-insensitive). |
| `main/prerender/view-factory.ts` | `spawnPrerenderView` | When to use: `PrerenderEngine.prerender` — one warm view for `targetUrl`, |
| `main/primitives/act-verdicts.ts` | `ActVerdicts` | When to use: `ActController` — the typing/verdict and gate-warning reads. |
| `main/primitives/find-controller.ts` | `FindController` | When to use: `Primitives` — own the find merge. |
| `main/primitives/net-controller.ts` | `NetController` | When to use: `Primitives` — the trafficSince / export_har surface. |
| `main/primitives/page-scripts.ts` | `buildWaitProbe` | When to use: wait_for and expect — the declarative condition probe. |
| `main/primitives/page-scripts.ts` | `buildExtractScript` | When to use: extract() and observe(list\|table\|app_data). |
| `main/primitives/page-scripts.ts` | `buildCollectScript` | When to use: collect_all — the scroll-and-dedupe collector (bindings, then the loop). |
| `main/primitives/page-scripts.ts` | `SIGNATURE_SCRIPT` | When to use: pageState and diff — one cheap signature round trip, no DOM mutation. |
| `main/primitives/page-scripts.ts` | `STABILITY_SCRIPT` | When to use: the `stable` wait condition — the height/text/nodes triple it compares. |
| `main/primitives/page-scripts.ts` | `PROBE_HELPERS` | When to use: every probe that needs clean / isVisible / accName / resolveRoot. |
| `main/primitives/primitives.ts` | `Primitives` | - |
| `main/primitives/projection.ts` | `markLine` | When to use: any view that prints one mark — the shared badge format. |
| `main/primitives/projection.ts` | `componentsText` | When to use: observe(components) — compact, region-grouped rendering of the table. |
| `main/primitives/projection.ts` | `pageText` | When to use: every observe view — one envelope with the page identity, the |
| `main/primitives/projection.ts` | `renderExtract` | When to use: observe(list\|table\|app_data) — the one-line preview of an extract. |
| `main/primitives/read-controller.ts` | `ReadController` | When to use: `Primitives` — the read tools that are not page dumps. |
| `main/primitives/read-funnel.ts` | `PageReadFunnel` | When to use: `ObserveController` — the read policy for unscoped page dumps. |
| `main/primitives/state-controller.ts` | `StateController` | When to use: `Primitives` — the state()/diff() pair. |
| `main/primitives/wait-controller.ts` | `WaitController` | When to use: `Primitives` — the wait_for / expect entry points. |
| `main/remote/cloudflared.ts` | `findCloudflared` | Find cloudflared without installing or downloading it. |
| `main/remote/ipc.ts` | `registerRemoteIpc` | When to use: main-process startup — register every `remote:*` channel. The |
| `main/research/errors.ts` | `researchError` | When to use: a research failure an agent should see by code rather than by message. |
| `main/research/handoff-probe.ts` | `ACTIONABLE_PROBE` | When to use: `HumanHandoff.probeActionable` — the actionable-page probe. |
| `main/security/capability-token.ts` | `tokenPathIn` | The token file path inside a capability directory. |
| `main/security/capability-token.ts` | `createCapabilityToken` | Create (or rotate) the token in `dir`. The caller owns the directory. |
| `main/security/capability-token.ts` | `readCapabilityToken` | Read and validate a token file. A missing, malformed or empty file returns undefined. |
| `main/security/private-file.ts` | `writePrivateFile` | When to use: any file that holds a secret — a token, a client secret, a key. |
| `main/settings/experimental.ts` | `ExperimentalSettingsStore` | Experimental feature flags persisted next to the other user settings. |
| `main/shadow-walk/ax-controls.ts` | `findSealedControls` | Find interactive controls inside closed shadow roots. |
| `main/shadow-walk/guard.ts` | `assertShadowSurface` | When to use: before a surface that Settings → Shadow Walk can disable. |
| `main/shadow-walk/part-highlight.ts` | `injectPartHighlight` | - |
| `main/shadow-walk/part-highlight.ts` | `removePartHighlight` | - |
| `main/shadow-walk/part-highlight.ts` | `withPartHighlight` | Run a screenshot capture with exported parts outlined when the lever is on. |
| `main/shadow-walk/sealed-gate.ts` | `SealedRateLimitError` | When to use: caught by the tool layer to return a retry hint instead of a failure. |
| `main/shadow-walk/sealed-gate.ts` | `SealedScanGate` | When to use: `findSealedControls` — one gate per call, shared state per tab. |
| `main/shadow-walk/sealed-measure.ts` | `measureSealedControls` | When to use: after the identity filter — measures the matching controls, in |
| `main/shadow-walk/sealed-scan.ts` | `SealedScanner` | When to use: `findSealedControls` — one scan of one frame set. |
| `main/shadow-walk/sealed-targets.ts` | `clearSealedTokens` | - |
| `main/shadow-walk/sealed-targets.ts` | `issueSealedToken` | - |
| `main/shadow-walk/sealed-targets.ts` | `resolveSealedToken` | Resolve a sealed token to a live top-level viewport centre, scrolling the real node into view. |
| `main/tabs/tab-manager.ts` | `TabManager` | - |
| `main/tabs/tab-registry.ts` | `TabRegistry` | When to use: `TabManager` — one registry per window. |
| `main/tabs/welcome-page.ts` | `welcomePagePath` | When to use: a tab with no URL, or the last tab being reset to the manual. |
| `main/takeover-key.ts` | `isTakeoverShortcut` | When to use: a `before-input-event` handler that must fire the takeover toggle. |
| `main/telemetry/bezier.ts` | `generateOrganicTrajectory` | Generates an organic, human-like trajectory between two coordinates. |
| `main/telemetry/input/cdp-input.ts` | `CdpInput` | When to use: `HumanizedInputSimulator` — the pointer and keyboard controllers. |
| `main/telemetry/input/cursor-overlay.ts` | `VISUAL_CURSOR_SCRIPT` | The in-page ghost cursor: a full-viewport canvas drawing the phosphor trail, the |
| `main/telemetry/input/keyboard.ts` | `HumanKeyboard` | When to use: `HumanizedInputSimulator` — everything that presses keys. |
| `main/telemetry/input/keys.ts` | `keyDescriptor` | Best-effort US-layout descriptor for a single typed character. |
| `main/telemetry/input/keys.ts` | `keyEventParams` | The CDP `Input.dispatchKeyEvent` payload for a descriptor; `phase` picks down or up. |
| `main/telemetry/input/pointer.ts` | `HumanPointer` | When to use: `HumanizedInputSimulator` — everything that moves the pointer. |
| `main/telemetry/input-simulator.ts` | `HumanizedInputSimulator` | - |
| `main/tools/ipc.ts` | `registerToolSettingsIpc` | Human-only writes over IPC. The bridge exposes a read-only config route to MCP processes. |
| `main/tools/state.ts` | `sanitizeToolSettings` | - |
| `main/tools/state.ts` | `buildToolManagerState` | - |
| `main/tools/tool-order.ts` | `byConfiguredRank` | When to use: sort a tool list by the user's configured rank, with a stable |
| `main/tray/notifications.ts` | `showDesktopNotification` | When to use: any surface that needs a silent desktop notification. |
| `main/tray/notifications.ts` | `notifyTrayHidden` | When to use: the first time a close is intercepted — explain where the app went. |
| `main/ui/menu-popup.ts` | `MenuPopup` | Themed, frameless dropdown hosted in its own small transparent window. |
| `main/viewport/catalog.ts` | `ProfileCatalog` | When to use: `ViewportController` — one catalogue per controller. |
| `main/viewport/profiles.ts` | `DeviceProfileStore` | - |
| `main/window/reassert-viewport.ts` | `reassertViewport` | When to use: after show/restore/focus/resume — re-position the deck and repaint every view. |
| `main/wrap/auth.ts` | `tokenFromHeaders` | - |
| `main/wrap/auth.ts` | `isWrapAuthorized` | - |
| `main/wrap/manifest.ts` | `manifestOf` | When to use: `WrapStore.manifest` — one wrapper summarised for a list. |
| `main/wrap/secret-file.ts` | `SecretFileStore` | When to use: `SecretStore` — one document per wrap data directory. |
| `main/wrap/secret-tokens.ts` | `OAuthTokens` | When to use: `SecretStore.resolve` on a kind=oauth2 credential. |
| `main/wrap/secrets.ts` | `SecretStore` | - |
| `main/wrap/wrapper-files.ts` | `WrapperFiles` | When to use: `WrapStore` — one directory per wrap data dir. |
| `main/zoom/display-scale.ts` | `displayScale` | When to use: building the zoom controller — the display scale behind the window. |
| `main/zoom/settings.ts` | `ZoomSettingsStore` | The browser zoom policy lives next to the other human settings. The HTTP |
| `mcp/browser-mcp.ts` | `flushLogSync` | Synchronous drain used only on shutdown paths, where async I/O cannot run. |
| `mcp/browser-mcp.ts` | `logMcp` | - |
| `mcp/browser-mcp.ts` | `createBridgeMcpServer` | - |
| `mcp/help-content.ts` | `HELP_CATEGORIES` | When to use: the `help` tool, when the caller names a category. |
| `mcp/mcp-resources.ts` | `registerBridgeResources` | When to use: `createBridgeMcpServer` — register every `mark-eleven://` resource. |
| `mcp/normalize-params.ts` | `normalizeIncomingParams` | When to use: the tools/call interceptor — one call's parameters, normalized. |
| `mcp/tool-args.ts` | `normaliseUrl` | When to use: a navigation tool payload — normalise the URL aliases and add a |
| `mcp/tool-args.ts` | `requireUrl` | When to use: a navigation tool that cannot work without a URL — normalise the |
| `mcp/tool-groups.ts` | `groupAction` | - |
| `mcp/tool-groups.ts` | `META_TOOL_NAMES` | - |
| `mcp/tool-groups.ts` | `CONSOLIDATED_GROUPED_TOOLS` | - |
| `mcp/tool-groups.ts` | `CONSOLIDATED_HIDDEN_TOOLS` | `collect_all` is folded into `extract`; old callers can still use it by name. |
| `mcp/tool-schema.ts` | `withGuaranteedToolSchema` | When to use: mapping a tool entry for tools/list or a transport send — |
| `mcp/tools-catalog-actuate.ts` | `ACTUATE_TOOLS` | When to use: the catalog segment fronting input actuation primitives: clicks, typing, keys, forms, waits and shadow walks. |
| `mcp/tools-catalog-capture.ts` | `CAPTURE_TOOLS` | When to use: the catalog segment fronting network capture: traffic, payloads, JSON queries, realtime streams and HAR export. |
| `mcp/tools-catalog-desktop.ts` | `DESKTOP_TOOLS` | When to use: the catalog segment fronting human-in-the-loop, notifications, window visibility and the system tray. |
| `mcp/tools-catalog-marks.ts` | `MARKS_TOOLS` | When to use: the catalog segment fronting Set-of-Marks grounding: screenshots, the mark registry and mark actuation. |
| `mcp/tools-catalog-memory.ts` | `MEMORY_TOOLS` | When to use: the catalog segment fronting local Cortex memory: semantic recall, browsing history and bookmarks. |
| `mcp/tools-catalog-navigate.ts` | `NAVIGATE_TOOLS` | When to use: the catalog segment fronting page navigation, history, page status and devtools checks. |
| `mcp/tools-catalog-observe.ts` | `OBSERVE_TOOLS` | When to use: the catalog segment fronting reading and harvesting the page, the JEV compaction surface and the decision-model loop. |
| `mcp/tools-catalog-order.ts` | `CATALOG_ORDER` | The pinned visible order of the catalog. |
| `mcp/tools-catalog-research.ts` | `RESEARCH_TOOLS` | When to use: the catalog segment fronting URL-to-Markdown, multi-engine search, crawling and cited topic research. |
| `mcp/tools-catalog-workspace.ts` | `WORKSPACE_TOOLS` | When to use: the catalog segment fronting the stateful workspace: tabs, zoom, viewport, downloads, contexts, recordings and the script vault. |
| `mcp/tools-catalog.ts` | `TOOLS_CATALOG` | - |
| `mcp/tools-catalog.ts` | `TIER_LABELS` | Discoverability tiers (docs/TOOL_CATALOG_REVIEW.md §3, Phase 4). |
| `mcp/tools-catalog.ts` | `TOOL_TIERS` | - |
| `mcp/tools-catalog.ts` | `DEFAULT_TOOL_ORDER` | Curated default order for `tools/list` and the Settings -> Tools list. |
| `mcp/wrap-config.ts` | `BRIDGE_URL` | The Cyberdeck bridge base URL (no trailing slash). |
| `mcp/wrap-config.ts` | `BRIDGE_TIMEOUT_MS` | Ceiling on one bridge round-trip; generous for a paged wrapper run. |
| `mcp/wrap-config.ts` | `TOKEN_FILE` | A file the app rotates; the MCP process only reads it. |
| `mcp/wrap-config.ts` | `STATIC_TOKEN` | An explicit token (tests, CI) instead of a file. |
| `mcp/wrap-config.ts` | `GENERATED_TOOL_CAP` | How many generated `wrap_<id>` tools may be registered at once. This is a model-context |
| `mcp/wrap-config.ts` | `META_TOOL_NAMES` | Names the static meta-tools own; a generated name must never collide with one. |
| `mcp/wrap-config.ts` | `MAX_TEXT_CHARS` | A response longer than this is truncated with a hint to narrow it. |
| `mcp/wrap-format.ts` | `asJson` | Parse a JSON string, or pass the value through unchanged. |
| `mcp/wrap-format.ts` | `resultText` | When to use: `wrap_run` and a generated tool — the markdown/json record rendering. |
| `mcp/wrap-format.ts` | `previewText` | When to use: a dry run — quote the request that would have been sent. |
| `mcp/wrap-format.ts` | `formatBytes` | Bytes as B/kB/MB, for the run footer. |
| `mcp/wrap-format.ts` | `formatManifest` | When to use: `wrap_list` and `wrap_reload` — one line per saved wrapper. |
| `mcp/wrap-format.ts` | `generatedWarning` | Explain why a saved wrapper with `exposeAsTool: true` is not a registered tool. Empty when |
| `mcp/wrap-format.ts` | `formatSecrets` | When to use: `wrap_secret_list` — names and hosts, never values. |
| `mcp/wrap-format.ts` | `wrapperRejection` | The wrapper write tools report a validation failure the same way. |
| `mcp/wrap-log.ts` | `logWrap` | When to use: every route in this server — boot, each call, and each bridge failure. |
| `mcp/wrap-messages.ts` | `errorText` | The standard failure line: `**CODE:** message`. |
| `mcp/wrap-server.ts` | `createWrapMcpServer` | - |
| `mcp/wrap-tool-result.ts` | `clampText` | A response longer than the cap is truncated with a hint to narrow it. |
| `mcp/wrap-tool-result.ts` | `toolSuccess` | The MCP success shape. |
| `mcp/wrap-tool-result.ts` | `toolError` | The MCP failure shape. |
| `mcp/wrap-tool-result.ts` | `bridgeFailure` | A thrown bridge failure, logged and returned in the standard error shape. |
| `mcp/wrap-tool-result.ts` | `bridgeTool` | When to use: every wrap tool body — call the bridge, let `fail` name the failure text (or |
| `mcp/wrap-tool-schema.ts` | `wrapInputToZodShape` | Convert a wrapper input schema into a Zod raw shape (one entry per property). |
| `mcp/wrap-tool-schema.ts` | `generatedToolName` | Deterministic MCP-safe name for a wrapper: `wrap_` + id with every character outside |
| `mcp/wrap-tool-schema.ts` | `isToolName` | True when `name` is a legal MCP tool name (exported for tests). |
| `mcp/wrap-tools.ts` | `registerWrapTools` | When to use: `createWrapMcpServer` — register every meta-tool on a fresh server. |
| `renderer/deck/decisions.ts` | `setDecisionTabVisible` | When to use: the status broadcast, a settings save, and the first probe. |
| `renderer/deck/decisions.ts` | `refreshDecisionTab` | When to use: after a settings change, and on the slow poll. |
| `renderer/deck/decisions.ts` | `initDecisions` | When to use: the HUD boot — subscribe, wire the tab and start the ring-buffer sync. |
| `renderer/deck/hil.ts` | `initHil` | When to use: the HUD boot — subscribe the HIL surfaces once. |
| `renderer/deck/hud.ts` | `renderConstruct` | When to use: `getLatestConstruct` and a harvested construct. |
| `renderer/deck/hud.ts` | `appendTelemetry` | When to use: a telemetry event from the bridge. |
| `renderer/deck/hud.ts` | `appendLog` | When to use: a log event (the panel and `getLogs` both replay them here). |
| `renderer/deck/hud.ts` | `clickHarvest` | When to use: Ctrl+H — the same path as the HARVEST button. |
| `renderer/deck/hud.ts` | `initHud` | When to use: the HUD boot — wire the tabs, the copy buttons and the harvest action. |
| `renderer/deck/hud.ts` | `renderStats` | When to use: `updateState` — the two token/interaction counters. |
| `renderer/deck/mode.ts` | `MENU_POPUP_MODE` | `?menupopup=1` — the popup-menu renderer (no HUD work). |
| `renderer/deck/mode.ts` | `SIDEBAR_MODE` | `?sidebar=1` — the native Command Deck overlay (no trail, no heartbeat). |
| `renderer/deck/nav-bar.ts` | `hideUrlSuggestions` | When to use: any navigation submit or a keyboard dismiss. |
| `renderer/deck/nav-bar.ts` | `renderZoom` | When to use: a state or zoom broadcast — the zoom button readout. |
| `renderer/deck/nav-bar.ts` | `setZoomPinned` | When to use: a responsive device became active — page zoom is pinned to 100%. |
| `renderer/deck/nav-bar.ts` | `setHistoryEnabled` | When to use: `updateState` — grey out the history buttons the tab cannot honour. |
| `renderer/deck/nav-bar.ts` | `initNavBar` | When to use: the HUD boot — wire the URL bar, the history buttons, zoom and version. |
| `renderer/deck/recording-panel.ts` | `loadRecordingSettings` | When to use: opening the Recording settings tab. |
| `renderer/deck/recording-panel.ts` | `initRecordingPanel` | When to use: the HUD boot — wire the REC button, the settings form and the begin/stop events. |
| `renderer/deck/settings-modal.ts` | `initSettingsModal` | When to use: the HUD boot — wire the dialog. |
| `renderer/deck/sidebar.ts` | `applySidebarMode` | When to use: `applySidebarState`, the collapse/dock buttons and the boot restyle. |
| `renderer/deck/sidebar.ts` | `applySidebarState` | When to use: the main process reports the deck's mode, collab flag and orb edge. |
| `renderer/deck/sidebar.ts` | `markHilActive` | When to use: a human hand-off started or cleared — paints the orb's status light. |
| `renderer/deck/sidebar.ts` | `applyExperimentalSettings` | Experimental flag UI: hide collab entry points unless the flag is on. |
| `renderer/deck/sidebar.ts` | `initSidebar` | When to use: the HUD boot — wire the shell and paint its first state. |
| `renderer/deck/tabs-strip.ts` | `renderTabs` | When to use: `getTabs`, `onTabsUpdated` and a state broadcast. |
| `renderer/deck/tabs-strip.ts` | `initTabs` | When to use: the HUD boot — wire NEW TAB once. |
| `renderer/deck/trail.ts` | `pushTrailPoint` | When to use: a telemetry event with coordinates — add its point to the trail. |
| `renderer/deck/trail.ts` | `initTrail` | When to use: the HUD boot — size the canvas and start the loop. |
| `renderer/deck/webstate.ts` | `refreshWebState` | When to use: the WEB STATE refresh button and the LOGS tab. |
| `renderer/deck/webstate.ts` | `initWebState` | When to use: the HUD boot — wire the refresh button and the events disclosure. |
| `renderer/dom.ts` | `byId` | When to use: resolving a control declared in index.html by its id. |
| `renderer/menu-popup.ts` | `bootMenuPopup` | - |
| `renderer/research/controls.ts` | `wireResearchControls` | When to use: `initResearchPanel` — wire the four controls once. |
| `renderer/research/stats.ts` | `ResearchStats` | When to use: `initResearchPanel` — one strip per panel. |
| `renderer/research-panel.ts` | `initResearchPanel` | - |
| `renderer/settings-clients.ts` | `loadConnectPanel` | Read the connect info (once) and repaint the selected client snippet. |
| `renderer/settings-clients.ts` | `initConnectPanel` | Wire the client picker once, after the settings modal markup exists. |
| `renderer/settings-input.ts` | `loadInputSettings` | Read the input profile and paint the sliders. |
| `renderer/settings-input.ts` | `initInputSettings` | Wire the pacing form once, after the settings modal markup exists. |
| `renderer/settings-jev.ts` | `initJevSettings` | Wire the JEV controls once, after the settings modal markup exists. |
| `renderer/settings-jev.ts` | `loadJevSettings` | Read the JEV settings and paint the switch and mode. |
| `renderer/settings-media.ts` | `loadMediaSettings` | Read the media settings and ffmpeg status and paint the form. |
| `renderer/settings-media.ts` | `initMediaPanel` | Wire the media form once, after the settings modal markup exists. |
| `renderer/settings-remote.ts` | `loadRemotePanel` | Read the gateway, tunnel and cloudflared status and paint the panel. |
| `renderer/settings-remote.ts` | `initRemotePanel` | Wire the panel once, after the settings modal markup exists. |
| `renderer/settings-research.ts` | `loadResearchSettings` | Read the research settings and paint the form. |
| `renderer/settings-research.ts` | `initResearchSettings` | Wire the research form once, after the settings modal markup exists. |
| `renderer/settings-shadow-walk.ts` | `loadShadowWalkSettings` | Read the Shadow Walk settings and paint the form. |
| `renderer/settings-shadow-walk.ts` | `initShadowWalkSettings` | Wire the Shadow Walk form and probe once. |
| `renderer/settings-wrap-secrets.ts` | `loadWrapSettings` | Read the credential list and repaint the secret panel and the editor picker. |
| `renderer/settings-wrap-secrets.ts` | `initWrapSecrets` | Wire the credential panel and the wrapper editor once. |
| `renderer/settings-wrap-secrets.ts` | `activeWrapTab` | The wrap subtab the user last selected (credentials or wrappers). |
| `renderer/tools-panel.ts` | `initToolsPanel` | - |
| `renderer/tools-panel.ts` | `refreshToolsPanel` | - |
| `renderer/update-banner.ts` | `initUpdateBanner` | Wire the banner and the install action once. |
| `renderer/viewport-controls.ts` | `initViewportControls` | - |
| `shared/brand.ts` | `BRAND` | Single source of truth for user-facing brand strings. |
| `shared/brand.ts` | `LEGACY_USER_DATA_NAMES` | Directory names a previous release used for Electron's `userData`. |
| `shared/version.ts` | `APP_VERSION` | Single source of truth for the application version. |

## Manual Notes

(Add notes here; they are preserved when the index is regenerated.)
