# Component Index

<!-- generated: run `node scripts/anti-slop/generate-component-index.mjs` to regenerate -->

Inventory of shared layouts, components, hooks, services, and utilities under `src/`. 221 files, 788 exports.

> Rule of use: before creating any new component, hook, or utility, check this file first (see the `reuse-before-create` skill). When you add a shared abstraction, rerun the generator and fill in the "When to use" column.

## Utils (3)

| File | Export | When to use |
|---|---|---|
| `main/utils/json-navigator.ts` | `JsonNavigator` | - |
| `main/utils/json-navigator.ts` | `JsonQueryOptions` *(type)* | JSON Navigator Engine |
| `main/utils/json-navigator.ts` | `JsonQueryResult` *(type)* | - |

## Types (666)

| File | Export | When to use |
|---|---|---|
| `main/browser/frame-eval.ts` | `evaluateInFrames` | - |
| `main/browser/frame-eval.ts` | `FrameEvalOptions` *(type)* | - |
| `main/browser/frame-eval.ts` | `FrameEvalResult` *(type)* | - |
| `main/browser/frame-tree.ts` | `discoverFrames` | - |
| `main/browser/frame-tree.ts` | `FrameHandle` *(type)* | - |
| `main/browser/frame-tree.ts` | `FrameContext` *(type)* | - |
| `main/browser/frames-inventory.ts` | `inventoryFrames` | When to use: the chassis frames route — walk the frame tree, attach control facts and per-frame screenshots. |
| `main/browser/frames-inventory.ts` | `FrameInventoryResult` *(type)* | When to use: the frames result — one row per frame, with controls and screenshots attached. |
| `main/browser/frames-inventory.ts` | `FramesInventoryDeps` *(type)* | When to use: the inventory reads through these two collaborators. |
| `main/browser/frames.ts` | `listFrames` | List the main frame and its children with top-level content-box rects. |
| `main/browser/frames.ts` | `FrameRect` *(type)* | - |
| `main/browser/frames.ts` | `FrameInfo` *(type)* | - |
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
| `main/cortex/chunker.ts` | `chunkMarkdown` | - |
| `main/cortex/chunker.ts` | `extractDomain` | - |
| `main/cortex/chunker.ts` | `PageChunk` *(type)* | Kuang Grade Mark Eleven - Cortex Markdown Chunker |
| `main/cortex/cortex-db.ts` | `cortex` | - |
| `main/cortex/cortex-db.ts` | `CortexDB` | - |
| `main/cortex/cortex-db.ts` | `PageHistoryRow` *(type)* | - |
| `main/cortex/cortex-db.ts` | `BookmarkRow` *(type)* | - |
| `main/cortex/cortex-db.ts` | `RecallResult` *(type)* | - |
| `main/cortex/cortex-db.ts` | `HistoryItem` *(type)* | - |
| `main/cortex/cortex-db.ts` | `UrlSuggestion` *(type)* | - |
| `main/cortex/cortex-db.ts` | `BookmarkItem` *(type)* | - |
| `main/cortex/cortex-db.ts` | `ScriptRow` *(type)* | - |
| `main/cortex/cortex-db.ts` | `ScriptItem` *(type)* | - |
| `main/cortex/embedder.ts` | `registerEmbeddingProvider` | Register (or replace) a provider so it can be selected by id. |
| `main/cortex/embedder.ts` | `listEmbeddingProviders` | Ids of every registered provider. |
| `main/cortex/embedder.ts` | `setEmbeddingProvider` | Select the active provider by id. Throws when the id is unknown. |
| `main/cortex/embedder.ts` | `getEmbeddingProvider` | The provider used for all new embeddings. |
| `main/cortex/embedder.ts` | `embedText` | Embed `text` with the active provider. |
| `main/cortex/embedder.ts` | `generateEmbedding` | - |
| `main/cortex/embedder.ts` | `DEFAULT_PROVIDER_ID` | - |
| `main/cortex/embedder.ts` | `EMBEDDING_DIM` | Legacy dimension constant for the default provider (kept for compatibility). |
| `main/cortex/embedder.ts` | `EmbeddingProvider` *(type)* | Kuang Grade Mark Eleven - Cortex Embedding Provider |
| `main/crawl/crawler.ts` | `normalizeUrl` | Strips the fragment so `/a` and `/a#x` are one page. |
| `main/crawl/crawler.ts` | `matchesAnyPattern` | True when the URL matches any pattern (glob by default, `/regex/` when wrapped in slashes). |
| `main/crawl/crawler.ts` | `linksFromMarkdown` | Extracts absolute links from Markdown (`[text](href)`), resolved against the page URL. |
| `main/crawl/crawler.ts` | `Crawler` | - |
| `main/crawl/crawler.ts` | `HumanAssistInfo` *(type)* | - |
| `main/crawl/crawler.ts` | `CrawlOptions` *(type)* | - |
| `main/crawl/crawler.ts` | `CrawlPage` *(type)* | - |
| `main/crawl/crawler.ts` | `CrawlOutcome` *(type)* | - |
| `main/crawl/crawler.ts` | `CrawlerDeps` *(type)* | - |
| `main/decide/decision-client.ts` | `resolveDecisionConfig` | Resolve configuration (env overrides file). Returns null when nothing is configured. |
| `main/decide/decision-client.ts` | `readStoredDecisionConfig` | Raw configuration as stored on disk (file values only — env is read at resolve time). |
| `main/decide/decision-client.ts` | `saveDecisionConfig` | Persist (or clear) `data/decision.json`. Returns the resolved status so the caller can show |
| `main/decide/decision-client.ts` | `decisionStatus` | Shape reported by `/health` and `help`, so an agent can tell whether `decide` will work. |
| `main/decide/decision-client.ts` | `onDecision` | Subscribe to completed decision calls (the HUD mirrors this; it never gates the call). |
| `main/decide/decision-client.ts` | `emitDecisionEvent` | - |
| `main/decide/decision-client.ts` | `runDecision` | One decision call. Never throws: failures are returned as typed results. |
| `main/decide/decision-client.ts` | `DecisionProtocol` *(type)* | - |
| `main/decide/decision-client.ts` | `DecisionConfig` *(type)* | - |
| `main/decide/decision-client.ts` | `DecisionCall` *(type)* | - |
| `main/decide/decision-client.ts` | `DecisionFailureCode` *(type)* | - |
| `main/decide/decision-client.ts` | `DecisionResult` *(type)* | - |
| `main/decide/decision-client.ts` | `DecisionEvent` *(type)* | One completed decision call, for the HUD's DECISIONS tab. Never contains the API key. |
| `main/decide/decision-guard.ts` | `validateAnswers` | Validate one answer set. Returns the offending (question, option) pairs so the caller can |
| `main/decide/decision-guard.ts` | `decideGuarded` | Ask, validate, eliminate, repeat. `maxAttempts` includes the first call (default 3). |
| `main/decide/decision-guard.ts` | `DecisionGuard` *(type)* | - |
| `main/decide/decision-guard.ts` | `GuardRejection` *(type)* | - |
| `main/decide/decision-guard.ts` | `GuardedDecision` *(type)* | - |
| `main/decide/sensitive-gate.ts` | `detectSensitiveGate` | Inspect the state Kuang is about to send. `state` may be the composed page text or the component |
| `main/decide/sensitive-gate.ts` | `SensitiveGate` *(type)* | Sensitive gates — situations where the correct action is **a human**, never a click. |
| `main/decide/sensitive-gate.ts` | `GateDetection` *(type)* | - |
| `main/deck/collab.ts` | `CollabController` | When to use: the deck surface — own the note cycle, list popup and overlay providers. |
| `main/deck/collab.ts` | `CollabControllerDeps` *(type)* | When to use: building the deck — everything the collab cycle reads through. |
| `main/deck/controller.ts` | `DeckController` | When to use: the chassis — own the deck panel view, its modes and orb geometry. |
| `main/deck/controller.ts` | `DeckMode` *(type)* | When to use: a surface that stores or compares the deck's panel state. |
| `main/deck/controller.ts` | `DeckControllerDeps` *(type)* | When to use: building the chassis — everything the deck reads through. |
| `main/downloads/download-manager.ts` | `DownloadManager` | - |
| `main/downloads/download-manager.ts` | `DownloadRecord` *(type)* | - |
| `main/drive/driver.ts` | `driveTask` | Run the loop until a stop condition. Never throws: every failure is a typed status. |
| `main/drive/driver.ts` | `DriveStatus` *(type)* | - |
| `main/drive/driver.ts` | `DriveStep` *(type)* | - |
| `main/drive/driver.ts` | `DriveResult` *(type)* | - |
| `main/drive/driver.ts` | `DriveOptions` *(type)* | - |
| `main/harvest/screenshots.ts` | `ScreenshotStore` | When to use: the chassis — own screenshot persistence: directory, retention, capture retry and the encode/save tail. |
| `main/harvest/screenshots.ts` | `ScreenshotStoreDeps` *(type)* | When to use: building the chassis — log and telemetry come from the chassis. |
| `main/harvest/screenshots.ts` | `ScreenshotPayload` *(type)* | The screenshot payload both capture paths (live viewport and annotated marks) return. |
| `main/harvester/dom-serializer.ts` | `captureComposedDom` | Serialise the active page's composed DOM (light + open shadow roots). |
| `main/harvester/dom-serializer.ts` | `COMPOSE_DOM_SCRIPT` | JS evaluated in the page. Must stay self-contained: no imports, no template |
| `main/harvester/dom-serializer.ts` | `ComposedDom` *(type)* | Composed-DOM serialisation for the Markdown harvester. |
| `main/harvester/markdown.ts` | `ConstructHarvester` | - |
| `main/harvester/markdown.ts` | `HarvestStats` *(type)* | - |
| `main/hil/hil-manager.ts` | `HilManager` | - |
| `main/hil/hil-manager.ts` | `HilRequest` *(type)* | - |
| `main/hil/hil-manager.ts` | `HilResolution` *(type)* | - |
| `main/hil/hil-manager.ts` | `NotificationOptions` *(type)* | - |
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
| `main/input-actions.ts` | `InputActionsController` | When to use: the chassis — own how input actions are performed over the active tab. |
| `main/input-actions.ts` | `InputActionsStatus` *(type)* | When to use: building the chassis — the state surface the actions report through. |
| `main/input-actions.ts` | `InputActionsDeps` *(type)* | When to use: building the chassis — everything an input action reads through. |
| `main/jev/controller.ts` | `JevController` | When to use: the chassis — own the JEV gate, funnel, loop breaker, stats and depth store. |
| `main/jev/controller.ts` | `JevControllerDeps` *(type)* | When to use: building the chassis — the collaborators JEV reads through. |
| `main/jev/controller.ts` | `JevPolicy` *(type)* | When to use: declaring the optional JEV gate; wired by index.ts to the settings store + decision status. |
| `main/jev/engine.ts` | `JevEngine` | - |
| `main/jev/engine.ts` | `JevSection` *(type)* | Just-Enough-View (JEV) page compaction. |
| `main/jev/engine.ts` | `JevSession` *(type)* | - |
| `main/jev/engine.ts` | `JevStatus` *(type)* | - |
| `main/jev/engine.ts` | `JevSearchHit` *(type)* | - |
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
| `main/llm/llm-surface.ts` | `LlmSurface` | - |
| `main/llm/llm-surface.ts` | `LlmSurfaceKind` *(type)* | A *fetchable* LLM-friendly representation. Deliberately excludes "rendered". |
| `main/llm/llm-surface.ts` | `LlmSurfaceScope` *(type)* | Whether a representation covers the whole site (`origin`) or just the page (`page`). |
| `main/llm/llm-surface.ts` | `LlmSurfaceNext` *(type)* | The machine-readable next action. `recommended: null` means "there is no |
| `main/llm/llm-surface.ts` | `LlmSurfaceEndpoint` *(type)* | - |
| `main/llm/llm-surface.ts` | `LlmSurfaceLink` *(type)* | - |
| `main/llm/llm-surface.ts` | `LlmSurfaceReport` *(type)* | - |
| `main/llm/llm-surface.ts` | `LlmFetchResult` *(type)* | - |
| `main/llm/llm-surface.ts` | `ReadUrlResult` *(type)* | Result of the composite `read_url`: always Markdown text, paged for long documents. |
| `main/llm/llm-surface.ts` | `LlmSurfaceDeps` *(type)* | - |
| `main/marks/marks-overlay.ts` | `MarksOverlay` | - |
| `main/marks/marks-overlay.ts` | `MarkItem` *(type)* | - |
| `main/media/binaries.ts` | `bundledYtDlpPath` | - |
| `main/media/binaries.ts` | `writableYtDlpPath` | - |
| `main/media/binaries.ts` | `readYtDlpVersion` | Run `<binary> --version`; null means it did not execute or printed nothing. |
| `main/media/binaries.ts` | `ensureYtDlp` | The yt-dlp this process should run, or a typed error when neither copy works. |
| `main/media/binaries.ts` | `isMediaBinary` | - |
| `main/media/binaries.ts` | `MediaBinarySource` *(type)* | - |
| `main/media/binaries.ts` | `MediaBinary` *(type)* | - |
| `main/media/binaries.ts` | `MediaBinaryError` *(type)* | - |
| `main/media/cookies.ts` | `writeCookieFile` | Write the cookies for `url` (the browser would send this host) to a temp file. |
| `main/media/cookies.ts` | `CookieFile` *(type)* | - |
| `main/media/exec.ts` | `runYtDlpProcess` | - |
| `main/media/exec.ts` | `CommandResult` *(type)* | - |
| `main/media/ffmpeg.ts` | `platformKey` | - |
| `main/media/ffmpeg.ts` | `managedFfmpegDir` | - |
| `main/media/ffmpeg.ts` | `ffmpegFileName` | - |
| `main/media/ffmpeg.ts` | `managedFfmpegPath` | - |
| `main/media/ffmpeg.ts` | `parseFfmpegVersion` | `ffmpeg version 6.1.1-...` → `6.1.1-...` |
| `main/media/ffmpeg.ts` | `detectFfmpeg` | Resolve ffmpeg for the current settings. `installing` is supplied by the |
| `main/media/ffmpeg.ts` | `installManagedFfmpeg` | Download the pinned managed build for this platform. Idempotent while a |
| `main/media/ffmpeg.ts` | `FfmpegSource` *(type)* | - |
| `main/media/ffmpeg.ts` | `FfmpegInfo` *(type)* | - |
| `main/media/jobs.ts` | `buildFormatSelector` | Format selector for one job. |
| `main/media/jobs.ts` | `buildDownloadArgs` | yt-dlp arguments for a job. Every value is built here, never passed through. |
| `main/media/jobs.ts` | `parseProgressLine` | Parse one `--newline` progress line. Returns null for lines that are not progress. |
| `main/media/jobs.ts` | `MediaJobs` | - |
| `main/media/jobs.ts` | `MediaKind` *(type)* | - |
| `main/media/jobs.ts` | `MediaQuality` *(type)* | - |
| `main/media/jobs.ts` | `MediaJobState` *(type)* | - |
| `main/media/jobs.ts` | `MediaJobFile` *(type)* | - |
| `main/media/jobs.ts` | `MediaProgress` *(type)* | - |
| `main/media/jobs.ts` | `MediaJob` *(type)* | - |
| `main/media/jobs.ts` | `MediaJobInput` *(type)* | - |
| `main/media/jobs.ts` | `MediaJobsOptions` *(type)* | - |
| `main/media/platform.ts` | `mediaPlatformKey` | `win32-x64`, `darwin-arm64`, `linux-x64` — matches `bin/media/<key>`. |
| `main/media/platform.ts` | `ytDlpFileName` | - |
| `main/media/platform.ts` | `ytdlpRuntimeOptions` | Point yt-dlp at Electron's own binary as a Node runtime. |
| `main/media/platform.ts` | `compareYtDlpVersions` | Compare `2026.10.26`-style versions. Returns >0 when `a` is newer. |
| `main/media/platform.ts` | `ytDlpReleaseAsset` | The GitHub release asset name for a target platform. |
| `main/media/platform.ts` | `parseChecksum` | Find one asset hash in a `SHA2-256SUMS` file. |
| `main/media/platform.ts` | `YtDlpRuntimeKind` *(type)* | Pure helpers for the media tooling: platform naming and the yt-dlp runtime. |
| `main/media/platform.ts` | `YtDlpRuntime` *(type)* | - |
| `main/media/service.ts` | `MediaService` | - |
| `main/media/service.ts` | `MediaRuntimeStatus` *(type)* | - |
| `main/media/service.ts` | `MediaStatus` *(type)* | - |
| `main/media/service.ts` | `MediaInfo` *(type)* | - |
| `main/media/service.ts` | `MediaInfoResult` *(type)* | - |
| `main/media/service.ts` | `MediaServiceError` *(type)* | - |
| `main/media/service.ts` | `MediaTranscriptResult` *(type)* | - |
| `main/media/service.ts` | `MediaPreviewImage` *(type)* | - |
| `main/media/service.ts` | `MediaPreviewResult` *(type)* | - |
| `main/media/service.ts` | `MediaDownloadResult` *(type)* | - |
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
| `main/navigation-error.ts` | `classifyNavigationFailure` | - |
| `main/navigation-error.ts` | `NavigationFailure` *(type)* | Turn Electron `loadURL` failures into stable, user-facing navigation errors. |
| `main/network/impersonate.ts` | `resolveCurlBinaryPath` | Resolve the pinned binary robustly. |
| `main/network/impersonate.ts` | `hostPlatformHeaders` | The impersonate profile fixes the TLS/H2 fingerprint (and the Chrome major). The user agent and |
| `main/network/impersonate.ts` | `impersonateAvailable` | - |
| `main/network/impersonate.ts` | `isChallenge` | Hard statuses and explicit Cloudflare interstitial markers. |
| `main/network/impersonate.ts` | `fetchStatic` | - |
| `main/network/impersonate.ts` | `StaticFetchResult` *(type)* | - |
| `main/network/impersonate.ts` | `StaticFetchOutcome` *(type)* | - |
| `main/network/network-interceptor.ts` | `NetworkInterceptor` | - |
| `main/network/network-interceptor.ts` | `CapturedNetworkRequest` *(type)* | - |
| `main/network/network-interceptor.ts` | `RealtimeStream` *(type)* | - |
| `main/network/network-interceptor.ts` | `StreamMessage` *(type)* | - |
| `main/network/network-interceptor.ts` | `NetworkFilter` *(type)* | - |
| `main/prerender/prerender-engine.ts` | `PrerenderEngine` | - |
| `main/prerender/prerender-engine.ts` | `PrerenderItem` *(type)* | - |
| `main/prerender/prerender-engine.ts` | `PrerenderOptions` *(type)* | - |
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
| `main/primitives/primitives.ts` | `DEFAULT_MARKDOWN_BUDGET` | Default view size for `observe(as:"markdown")` when the caller gives no budget. |
| `main/primitives/primitives.ts` | `PrimitiveError` | - |
| `main/primitives/primitives.ts` | `Primitives` | - |
| `main/primitives/primitives.ts` | `PrimitivesHost` *(type)* | Primitives — the orthogonal observe / act / wait layer. |
| `main/primitives/primitives.ts` | `PrimitiveErrorCode` *(type)* | - |
| `main/primitives/primitives.ts` | `WaitCondition` *(type)* | - |
| `main/primitives/primitives.ts` | `ConditionResult` *(type)* | - |
| `main/primitives/primitives.ts` | `WaitResult` *(type)* | - |
| `main/primitives/primitives.ts` | `PageState` *(type)* | - |
| `main/primitives/primitives.ts` | `ObserveOptions` *(type)* | - |
| `main/primitives/primitives.ts` | `ExtractOptions` *(type)* | - |
| `main/primitives/primitives.ts` | `CollectOptions` *(type)* | - |
| `main/primitives/primitives.ts` | `FindOptions` *(type)* | - |
| `main/primitives/primitives.ts` | `ActOptions` *(type)* | A target can be addressed three ways, in order of preference: |
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
| `main/recording/recording-service.ts` | `onRecordingStatus` | - |
| `main/recording/recording-service.ts` | `setRecordingWindow` | - |
| `main/recording/recording-service.ts` | `loadRecordingConfig` | - |
| `main/recording/recording-service.ts` | `getRecordingConfig` | - |
| `main/recording/recording-service.ts` | `saveRecordingConfig` | - |
| `main/recording/recording-service.ts` | `getRecordingStatus` | - |
| `main/recording/recording-service.ts` | `pickRecordingDir` | - |
| `main/recording/recording-service.ts` | `startRecording` | Start recording the Cyberdeck window. Resolves when the renderer has the stream running. |
| `main/recording/recording-service.ts` | `readyRecording` | Called by the renderer once the stream and encoder are actually running. |
| `main/recording/recording-service.ts` | `stopRecording` | Ask the renderer to finalise; the file is written when it calls `saveRecording`. |
| `main/recording/recording-service.ts` | `saveRecording` | Called from the renderer with the finished WebM bytes. |
| `main/recording/recording-service.ts` | `failRecording` | - |
| `main/recording/recording-service.ts` | `listRecordings` | Finished recordings, newest first. Paths are absolute and ready for a file-upload field. |
| `main/recording/recording-service.ts` | `RecordingConfig` *(type)* | - |
| `main/recording/recording-service.ts` | `RecordingResult` *(type)* | - |
| `main/recording/recording-service.ts` | `RecordingStatus` *(type)* | - |
| `main/remote/oauth-client.ts` | `oauthClientFile` | - |
| `main/remote/oauth-client.ts` | `readOAuthClient` | - |
| `main/remote/oauth-client.ts` | `createOAuthClient` | - |
| `main/remote/oauth-client.ts` | `ensureOAuthClient` | - |
| `main/remote/oauth-client.ts` | `OAuthClientCredentials` *(type)* | - |
| `main/remote/service.ts` | `RemoteService` | Owns the app-level remote MCP gateway process. |
| `main/remote/service.ts` | `RemoteServiceOptions` *(type)* | - |
| `main/remote/settings.ts` | `loadRemoteSettings` | - |
| `main/remote/settings.ts` | `saveRemoteSettings` | - |
| `main/remote/settings.ts` | `RemoteSettings` *(type)* | - |
| `main/research/anchor-store.ts` | `AnchorStore` | - |
| `main/research/anchor-store.ts` | `StoredAnchor` *(type)* | - |
| `main/research/anchors.ts` | `relocateCitation` | Revalidate a stored anchor against fresh HTML. |
| `main/research/anchors.ts` | `relocateCitations` | - |
| `main/research/anchors.ts` | `anchorHighlights` | - |
| `main/research/anchors.ts` | `CitationAnchor` *(type)* | - |
| `main/research/anchors.ts` | `CitationCandidate` *(type)* | - |
| `main/research/anchors.ts` | `CitationRelocation` *(type)* | - |
| `main/research/citation-controller.ts` | `CitationController` | When to use: the chassis — own the anchor store, warm origins, hand-off state and the citation fetch/relocate pipeline. |
| `main/research/citation-controller.ts` | `HumanHandoffResult` *(type)* | The result of a human-handoff read, or null when no human took over. |
| `main/research/citation-controller.ts` | `CitationControllerDeps` *(type)* | When to use: building the chassis — everything the citation pipeline reads through. |
| `main/research/citation-controller.ts` | `RevalidationSummary` *(type)* | The outcome of revalidating stored anchors across URLs. |
| `main/research/crawl-orchestrator.ts` | `CrawlOrchestrator` | When to use: the chassis — own how crawl and topic research runs are orchestrated. |
| `main/research/crawl-orchestrator.ts` | `CrawlOrchestratorDeps` *(type)* | When to use: building the chassis — the five collaborators a run composes. |
| `main/research/crawl-orchestrator.ts` | `RenderCrawlOptions` *(type)* | The options a crawl page render accepts. |
| `main/research/crawl-orchestrator.ts` | `RenderCrawlResult` *(type)* | The result of rendering one crawl page: markdown, links, status, optional hand-off facts. |
| `main/research/detached-view.ts` | `DetachedViewController` | When to use: the chassis — own the shared off-screen research view and its serialized queue. |
| `main/research/detached-view.ts` | `DetachedLoadOptions` *(type)* | When to use: a detached load — wait bounds, a readiness probe and a post-load hook. |
| `main/research/detached-view.ts` | `DetachedLoadResult` *(type)* | When to use: reading a detached load's outcome — the script result, post-load hook output, HTTP status and content type. |
| `main/research/detached-view.ts` | `DetachedViewDeps` *(type)* | When to use: building the chassis — the view reads through these two collaborators. |
| `main/research/researcher.ts` | `extractHighlights` | Extractive highlights: paragraphs of the source that mention the most query terms, best first. |
| `main/research/researcher.ts` | `Researcher` | - |
| `main/research/researcher.ts` | `ResearchOptions` *(type)* | - |
| `main/research/researcher.ts` | `ResearchSource` *(type)* | - |
| `main/research/researcher.ts` | `ResearchOutcome` *(type)* | - |
| `main/research/researcher.ts` | `ResearcherDeps` *(type)* | - |
| `main/research/session-controller.ts` | `researchError` | When to use: declaring the error contract shared by the research surfaces. |
| `main/research/session-controller.ts` | `ResearchSessionController` | When to use: the chassis — own the stealth research session, its settings and WAF cooldowns. |
| `main/research/session-controller.ts` | `ResearchSessionDeps` *(type)* | When to use: building the chassis — the collaborators the research session reads through. |
| `main/research/settings.ts` | `normalizeResearchSettings` | - |
| `main/research/settings.ts` | `looksLikeChallenge` | - |
| `main/research/settings.ts` | `RESEARCH_ENGINES` | - |
| `main/research/settings.ts` | `DEFAULT_RESEARCH_SETTINGS` | - |
| `main/research/settings.ts` | `ResearchSettingsStore` | - |
| `main/research/settings.ts` | `ResearchSettings` *(type)* | - |
| `main/research/settings.ts` | `ResearchSettingsResult` *(type)* | - |
| `main/scripts/script-vault.ts` | `ScriptVault` | - |
| `main/scripts/script-vault.ts` | `SavedScriptMeta` *(type)* | - |
| `main/search/search-engine.ts` | `KNOWN_ENGINES` | - |
| `main/search/search-engine.ts` | `DEFAULT_ENGINE_CHAIN` | Default fallback chain: JS-free, consent-resistant providers first; Google last (it challenges often). |
| `main/search/search-engine.ts` | `SearchHub` | - |
| `main/search/search-engine.ts` | `SearchResult` *(type)* | `search_web` — a configurable, multi-engine search hub (TODO_RESEARCH_CRAWL.md §5, Feature 5). |
| `main/search/search-engine.ts` | `SearchAttempt` *(type)* | - |
| `main/search/search-engine.ts` | `SearchOutcome` *(type)* | - |
| `main/search/search-engine.ts` | `SearchHubDeps` *(type)* | - |
| `main/session/session-vault.ts` | `SessionVault` | - |
| `main/session/session-vault.ts` | `SessionSnapshot` *(type)* | - |
| `main/settings/jev.ts` | `DEFAULT_JEV_SETTINGS` | - |
| `main/settings/jev.ts` | `JevSettingsStore` | JEV is an optional feature (not an experimental one): it is offered only when |
| `main/settings/jev.ts` | `JevMode` *(type)* | - |
| `main/settings/jev.ts` | `JevSettings` *(type)* | - |
| `main/shadow-walk/ax-controls.ts` | `findSealedControls` | Find interactive controls inside closed shadow roots. |
| `main/shadow-walk/ax-controls.ts` | `SealedRateLimitError` | - |
| `main/shadow-walk/ax-controls.ts` | `SealedRect` *(type)* | - |
| `main/shadow-walk/ax-controls.ts` | `SealedControl` *(type)* | - |
| `main/shadow-walk/ax-controls.ts` | `SealedFindOptions` *(type)* | - |
| `main/shadow-walk/ax-controls.ts` | `SealedFindResult` *(type)* | - |
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
| `main/shadow-walk/settings.ts` | `normalizeShadowWalkSettings` | - |
| `main/shadow-walk/settings.ts` | `loadShadowWalkSettings` | - |
| `main/shadow-walk/settings.ts` | `saveShadowWalkSettings` | - |
| `main/shadow-walk/settings.ts` | `shadowWalkStatus` | - |
| `main/shadow-walk/settings.ts` | `shadowWalkRefusal` | Structured refusal for a guarded surface, or null when the call may proceed. |
| `main/shadow-walk/settings.ts` | `SHADOW_WALK_SETTINGS_FILE` | - |
| `main/shadow-walk/settings.ts` | `DEFAULT_SHADOW_WALK_SETTINGS` | - |
| `main/shadow-walk/settings.ts` | `shadowWalkSettings` | - |
| `main/shadow-walk/settings.ts` | `ShadowWalkSettingsStore` | - |
| `main/shadow-walk/settings.ts` | `ShadowWalkSettings` *(type)* | - |
| `main/shadow-walk/settings.ts` | `ShadowWalkSettingsResult` *(type)* | - |
| `main/shadow-walk/settings.ts` | `ShadowWalkSurface` *(type)* | - |
| `main/shadow-walk/settings.ts` | `ShadowWalkRefusal` *(type)* | - |
| `main/shadow-walk/settings.ts` | `ShadowWalkStatus` *(type)* | - |
| `main/shadow-walk/tab-walk.ts` | `runTabWalk` | Walk sequential focus from a host. |
| `main/shadow-walk/tab-walk.ts` | `TabWalkOptions` *(type)* | - |
| `main/shadow-walk/tab-walk.ts` | `TabWalkStep` *(type)* | - |
| `main/shadow-walk/tab-walk.ts` | `TabWalkResult` *(type)* | - |
| `main/shield/consent-controller.ts` | `ConsentController` | When to use: the chassis — own the consent sweep: answered-origins memory, timed attempts and the explicit dismiss. |
| `main/shield/consent-controller.ts` | `ConsentControllerDeps` *(type)* | When to use: building the chassis — the wall breaker, the policy and the log/telemetry come from it. |
| `main/shield/shield-breaker.ts` | `ShieldBreaker` | - |
| `main/shield/shield-breaker.ts` | `ShieldDismissResult` *(type)* | - |
| `main/shield/shield-breaker.ts` | `ConsentPolicy` *(type)* | How to answer a consent wall. This is a *preference*, not a licence to click anything that says |
| `main/snapshots/rendered-snapshot.ts` | `RenderedSnapshotEngine` | - |
| `main/snapshots/rendered-snapshot.ts` | `RenderedSnapshotOptions` *(type)* | - |
| `main/snapshots/rendered-snapshot.ts` | `RenderedSnapshotResult` *(type)* | - |
| `main/tabs/tab-manager.ts` | `TabManager` | - |
| `main/tabs/tab-manager.ts` | `TabInstance` *(type)* | - |
| `main/tabs/tab-manager.ts` | `TabManagerOptions` *(type)* | - |
| `main/tabs/window-open-policy.ts` | `isAuthPopupUrl` | True when the URL looks like an interactive sign-in or authorization endpoint. Used as a |
| `main/tabs/window-open-policy.ts` | `isPopupWindowRequest` | True when this request needs a real window to keep its opener relationship intact. |
| `main/tabs/window-open-policy.ts` | `popupWindowSize` | Window size requested by a `window.open` features string, clamped to something usable. |
| `main/tabs/window-open-policy.ts` | `WindowOpenRequest` *(type)* | How a renderer's `window.open()` / `target="_blank"` request should be handled. |
| `main/tabs/window-open-policy.ts` | `PopupSize` *(type)* | - |
| `main/telemetry/action-ledger.ts` | `ActionLedger` | - |
| `main/telemetry/action-ledger.ts` | `FieldFacts` *(type)* | Typed facts about the form control an action addressed. |
| `main/telemetry/action-ledger.ts` | `TransitionTarget` *(type)* | - |
| `main/telemetry/action-ledger.ts` | `AddressMode` *(type)* | - |
| `main/telemetry/action-ledger.ts` | `TransitionRecord` *(type)* | - |
| `main/telemetry/action-ledger.ts` | `TypingOutcome` *(type)* | Evidence collected around a typing action (all in-page; the value itself never leaves the page). |
| `main/telemetry/action-ledger.ts` | `TypingChannel` *(type)* | - |
| `main/telemetry/action-ledger.ts` | `ActionLedgerOptions` *(type)* | - |
| `main/telemetry/chaos-kinematics.ts` | `generateChaosTrajectory` | Generates an advanced bio-kinematic trajectory incorporating chaos math, |
| `main/telemetry/chaos-kinematics.ts` | `Point` *(type)* | Kuang Grade Mark Eleven — Bio-Kinematic Chaos & Neuromotor Mouse Engine |
| `main/telemetry/chaos-kinematics.ts` | `PathStep` *(type)* | - |
| `main/telemetry/chaos-kinematics.ts` | `ChaosKinematicsOptions` *(type)* | - |
| `main/telemetry/host-fingerprint.ts` | `detectHostBrowserProfile` | Clean, zero-subprocess host browser profile detector. |
| `main/telemetry/host-fingerprint.ts` | `HostBrowserProfile` *(type)* | - |
| `main/telemetry/input-profile.ts` | `loadInputProfile` | Resolve the active profile: defaults, then the file, then env overrides. |
| `main/telemetry/input-profile.ts` | `saveInputProfile` | Persist a (partial) profile, clamped, and return the profile that is now active. |
| `main/telemetry/input-profile.ts` | `DEFAULT_INPUT_PROFILE` | - |
| `main/telemetry/input-profile.ts` | `InputProfile` *(type)* | - |
| `main/telemetry/input-simulator.ts` | `HumanizedInputSimulator` | - |
| `main/telemetry/input-simulator.ts` | `InputTelemetryReporter` *(type)* | - |
| `main/tools/settings.ts` | `normalizeToolSettings` | - |
| `main/tools/settings.ts` | `DEFAULT_TOOL_SETTINGS` | - |
| `main/tools/settings.ts` | `ToolSettingsStore` | File-backed store. One instance is shared by the IPC handlers and the local bridge. |
| `main/tools/settings.ts` | `ToolSettingsValidation` *(type)* | - |
| `main/tray/tray-manager.ts` | `TrayManager` | - |
| `main/tray/tray-manager.ts` | `TrayManagerOptions` *(type)* | - |
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
| `main/wrap/render.ts` | `safeHost` | - |
| `main/wrap/render.ts` | `previewUrl` | The preview URL for a plan. |
| `main/wrap/render.ts` | `secretVariants` | - |
| `main/wrap/render.ts` | `redactText` | - |
| `main/wrap/render.ts` | `redactDeep` | - |
| `main/wrap/render.ts` | `parseJson` | - |
| `main/wrap/render.ts` | `toRecords` | - |
| `main/wrap/render.ts` | `fence` | - |
| `main/wrap/render.ts` | `clip` | - |
| `main/wrap/render.ts` | `failure` | - |
| `main/wrap/render.ts` | `isPlainObject` | - |
| `main/wrap/render.ts` | `clampInt` | - |
| `main/wrap/render.ts` | `Rendered` *(type)* | - |
| `main/wrap/rendering.ts` | `renderWrapped` | Render one page (or a merged selection) through the wrapper's recipe. |
| `main/wrap/rendering.ts` | `Rendered` *(type)* | The markdown, records and documents a recipe produced for one or more pages. |
| `main/wrap/resolve.ts` | `resolveWrapper` | When to use: `run` / `preview` / `test` on either executor core — resolve the |
| `main/wrap/resolve.ts` | `WrapperResolution` *(type)* | When to use: the result of resolving an id-or-inline wrapper — the wrapper, or the code and message to return. |
| `main/wrap/secrets.ts` | `SecretStore` | - |
| `main/wrap/secrets.ts` | `WrapSecretKind` *(type)* | - |
| `main/wrap/secrets.ts` | `WrapOAuthMetadata` *(type)* | - |
| `main/wrap/secrets.ts` | `WrapSecretMetadata` *(type)* | - |
| `main/wrap/secrets.ts` | `WrapSecretInput` *(type)* | - |
| `main/wrap/secrets.ts` | `SecretCipher` *(type)* | - |
| `main/wrap/secrets.ts` | `SecretResolution` *(type)* | - |
| `main/wrap/secrets.ts` | `TokenRequest` *(type)* | - |
| `main/wrap/secrets.ts` | `TokenResult` *(type)* | - |
| `main/wrap/secrets.ts` | `TokenMinter` *(type)* | - |
| `main/wrap/secrets.ts` | `SecretStoreOptions` *(type)* | - |
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
| `main/wrap/types.ts` | `WrapMethod` *(type)* | - |
| `main/wrap/types.ts` | `WrapFormat` *(type)* | - |
| `main/wrap/types.ts` | `WrapInputSchema` *(type)* | The subset of JSON Schema used by wrapper inputs. |
| `main/wrap/types.ts` | `WrapRequest` *(type)* | - |
| `main/wrap/types.ts` | `WrapWrapper` *(type)* | - |
| `main/wrap/types.ts` | `WrapManifestEntry` *(type)* | - |
| `main/wrap/types.ts` | `WrapPreview` *(type)* | - |
| `main/wrap/types.ts` | `WrapErrorInfo` *(type)* | - |
| `main/wrap/types.ts` | `WrapResponseInfo` *(type)* | - |
| `main/wrap/types.ts` | `WrapIndexed` *(type)* | - |
| `main/wrap/types.ts` | `WrapRunResult` *(type)* | - |
| `main/wrap/validate-wrapper.ts` | `validateWrapper` | - |
| `main/wrap/validate-wrapper.ts` | `isPlainObject` | - |
| `main/wrap/validate-wrapper.ts` | `WrapperValidation` *(type)* | - |
| `main/zoom/controller.ts` | `ZoomController` | When to use: the chassis — own the zoom policy, override and rendered proportions. |
| `main/zoom/controller.ts` | `ZoomControllerDeps` *(type)* | When to use: building the chassis — everything zoom reads through. |
| `mcp/process-guard.ts` | `installProcessGuards` | When to use: at the top of a stdio MCP server entrypoint, before connecting |
| `mcp/process-guard.ts` | `ProcessGuardOptions` *(type)* | Process resilience shared by the stdio MCP entrypoints. |
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
| `mcp/tools-catalog-types.ts` | `ToolCatalogItem` *(type)* | When to use: any surface that registers or inspects a catalog entry — the one item shape for the whole catalog. |
| `preload/index.ts` | `ElectronAPI` *(type)* | When to use: the preload bridge surface — every renderer call goes through `window.electronAPI`. |
| `renderer/cortex-panel.ts` | `initCortexPanel` | Wire the modal once, after the document has parsed. |
| `renderer/cortex-panel.ts` | `updateActivePage` | Track the active page for the bookmark star and the save form. |
| `renderer/cortex-panel.ts` | `CortexDeps` *(type)* | Callbacks the panel needs from the app shell. |
| `renderer/recording.ts` | `isRecording` | - |
| `renderer/recording.ts` | `beginRecording` | - |
| `renderer/recording.ts` | `finishRecording` | - |
| `renderer/recording.ts` | `BeginPayload` *(type)* | - |
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
| `shared/collaboration.ts` | `CollaborationTargetKind` *(type)* | - |
| `shared/collaboration.ts` | `CollaborationTarget` *(type)* | - |
| `shared/collaboration.ts` | `CollaborationMessageKind` *(type)* | - |
| `shared/collaboration.ts` | `CollaborationMessage` *(type)* | - |
| `shared/collaboration.ts` | `CollaborationThreadStatus` *(type)* | - |
| `shared/collaboration.ts` | `CollaborationThread` *(type)* | - |
| `shared/collaboration.ts` | `CollaborationFilter` *(type)* | - |
| `shared/collaboration.ts` | `CollaborationResult` *(type)* | - |
| `shared/experimental.ts` | `normalizeExperimentalSettings` | - |
| `shared/experimental.ts` | `DEFAULT_EXPERIMENTAL_SETTINGS` | - |
| `shared/experimental.ts` | `ExperimentalSettings` *(type)* | Experimental features. Everything here is opt-in and may change or be removed. |
| `shared/media.ts` | `FfmpegMode` *(type)* | Shared media settings and updater state (main, preload, renderer). |
| `shared/media.ts` | `MediaSettings` *(type)* | - |
| `shared/media.ts` | `MediaUpdaterState` *(type)* | - |
| `shared/media.ts` | `MediaSettingsSnapshot` *(type)* | - |
| `shared/menu.ts` | `PopupMenuItem` *(type)* | One row of a themed popup menu (rendered by src/renderer/menu-popup.ts). |
| `shared/menu.ts` | `PopupMenuSelection` *(type)* | - |
| `shared/menu.ts` | `PopupAnchor` *(type)* | Where a popup should anchor, in shell content-area coordinates. |
| `shared/menu.ts` | `SidebarSurfaceState` *(type)* | Authoritative deck-surface state; native bounds and DOM classes derive from it. |
| `shared/remote.ts` | `RemoteCloudflaredStatus` *(type)* | - |
| `shared/remote.ts` | `RemoteTunnelStatus` *(type)* | - |
| `shared/remote.ts` | `RemoteStatus` *(type)* | - |
| `shared/remote.ts` | `RemoteInfo` *(type)* | - |
| `shared/research-events.ts` | `ResearchTier` *(type)* | Research run events. |
| `shared/research-events.ts` | `ResearchEscalation` *(type)* | - |
| `shared/research-events.ts` | `ResearchAnchorDetail` *(type)* | - |
| `shared/research-events.ts` | `ResearchEvent` *(type)* | - |
| `shared/tool-settings.ts` | `ToolSettings` *(type)* | Persisted overrides for the advertised browser MCP tool surface. |
| `shared/tool-settings.ts` | `ToolManagerAction` *(type)* | - |
| `shared/tool-settings.ts` | `ToolManagerEntry` *(type)* | - |
| `shared/tool-settings.ts` | `ToolManagerState` *(type)* | - |
| `shared/tool-settings.ts` | `ToolManagerResult` *(type)* | - |
| `shared/types.ts` | `AgentStatus` *(type)* | - |
| `shared/types.ts` | `CursorPosition` *(type)* | - |
| `shared/types.ts` | `TelemetryEvent` *(type)* | - |
| `shared/types.ts` | `HarvestedConstruct` *(type)* | - |
| `shared/types.ts` | `TabSummary` *(type)* | - |
| `shared/types.ts` | `ChassisState` *(type)* | - |
| `shared/viewport.ts` | `specFromProfile` | - |
| `shared/viewport.ts` | `normalizeViewportSpec` | - |
| `shared/viewport.ts` | `normalizeDeviceProfile` | - |
| `shared/viewport.ts` | `orientationOf` | - |
| `shared/viewport.ts` | `rotateSpec` | Swap width/height, keeping the physical device size. |
| `shared/viewport.ts` | `fitViewport` | Fit an emulated device inside the browsing area. |
| `shared/viewport.ts` | `findProfile` | - |
| `shared/viewport.ts` | `BUILTIN_PROFILES` | - |
| `shared/viewport.ts` | `MIN_VIEWPORT_DIMENSION` | - |
| `shared/viewport.ts` | `MAX_VIEWPORT_DIMENSION` | - |
| `shared/viewport.ts` | `MIN_DEVICE_SCALE` | - |
| `shared/viewport.ts` | `MAX_DEVICE_SCALE` | - |
| `shared/viewport.ts` | `MAX_CUSTOM_PROFILES` | - |
| `shared/viewport.ts` | `VIEWPORT_MARGIN` | Empty space kept around the emulated device inside the browsing area. |
| `shared/viewport.ts` | `Orientation` *(type)* | Responsive / device emulation contract. |
| `shared/viewport.ts` | `DeviceProfile` *(type)* | - |
| `shared/viewport.ts` | `ViewportSpec` *(type)* | - |
| `shared/viewport.ts` | `ViewportRect` *(type)* | - |
| `shared/viewport.ts` | `ViewportState` *(type)* | - |
| `shared/web-state.ts` | `WebPageState` *(type)* | Page-level signals collected for the WEB STATE tab on the Command Deck. |
| `shared/zoom.ts` | `normalizeZoomSettings` | - |
| `shared/zoom.ts` | `nextZoomStep` | - |
| `shared/zoom.ts` | `clampZoomFactor` | - |
| `shared/zoom.ts` | `DEFAULT_ZOOM_SETTINGS` | - |
| `shared/zoom.ts` | `ZOOM_STEPS` | Chrome-like zoom stops, used by the toolbar and the agent-facing tool. |
| `shared/zoom.ts` | `ZoomMode` *(type)* | Page zoom policy and the shape reported to the HUD, IPC callers and MCP. |
| `shared/zoom.ts` | `ZoomSettings` *(type)* | - |
| `shared/zoom.ts` | `ZoomState` *(type)* | - |

## Modules (119)

| File | Export | When to use |
|---|---|---|
| `main/brand-icon.ts` | `brandIconPath` | When to use: a surface that needs the asset path itself (window icon). |
| `main/brand-icon.ts` | `brandIcon` | When to use: a tray/HIL icon — the brand mark at the requested square size, |
| `main/browser/frame-marks.ts` | `clearFrameMarks` | - |
| `main/browser/frame-marks.ts` | `registerFrameMarks` | - |
| `main/browser/frame-marks.ts` | `resolveFrameMark` | Resolve a frame mark to a live page-space target. Returns null when the frame navigated, the |
| `main/browser-chassis.ts` | `BrowserChassis` | - |
| `main/collaboration/service.ts` | `CollaborationService` | - |
| `main/data-paths.ts` | `dataRoot` | - |
| `main/data-paths.ts` | `dataPath` | - |
| `main/data-paths.ts` | `writeJsonAtomic` | When to use: persisting a JSON settings/state file — mkdir, write to a temp |
| `main/diagnostics/main-log.ts` | `mainLogFile` | - |
| `main/diagnostics/main-log.ts` | `logMainEvent` | - |
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
| `main/marks/format-mark.ts` | `formatMark` | Renders one Set-of-Marks entry as a compact, accessibility-aware line: |
| `main/media/auth.ts` | `needsLogin` | Does yt-dlp's output say the site wants a signed-in session? |
| `main/media/cookie-format.ts` | `toNetscape` | Netscape cookie-file text for yt-dlp's `--cookies`. |
| `main/media/settings.ts` | `normalizeMediaSettings` | - |
| `main/media/settings.ts` | `DEFAULT_MEDIA_SETTINGS` | - |
| `main/media/settings.ts` | `MediaSettingsStore` | - |
| `main/metrics.ts` | `bump` | - |
| `main/metrics.ts` | `snapshot` | - |
| `main/metrics.ts` | `summary` | Grouped summary for `bridge_health` — three numbers instead of a wall of keys. |
| `main/metrics.ts` | `resetMetrics` | - |
| `main/remote/cloudflared.ts` | `findCloudflared` | Find cloudflared without installing or downloading it. |
| `main/remote/ipc.ts` | `registerRemoteIpc` | When to use: main-process startup — register every `remote:*` channel. The |
| `main/remote/token.ts` | `remoteTokenFile` | When to use: a surface that needs the token file path itself (the gateway status UI). |
| `main/remote/token.ts` | `createRemoteToken` | When to use: first start or rotation — create the gateway token and return it. |
| `main/remote/token.ts` | `readRemoteToken` | When to use: a bearer authorizer — read the gateway token from disk, or undefined when absent. |
| `main/security/capability-token.ts` | `tokenPathIn` | The token file path inside a capability directory. |
| `main/security/capability-token.ts` | `createCapabilityToken` | Create (or rotate) the token in `dir`. The caller owns the directory. |
| `main/security/capability-token.ts` | `readCapabilityToken` | Read and validate a token file. A missing, malformed or empty file returns undefined. |
| `main/settings/experimental.ts` | `ExperimentalSettingsStore` | Experimental feature flags persisted next to the other user settings. |
| `main/shadow-walk/part-highlight.ts` | `injectPartHighlight` | - |
| `main/shadow-walk/part-highlight.ts` | `removePartHighlight` | - |
| `main/shadow-walk/part-highlight.ts` | `withPartHighlight` | Run a screenshot capture with exported parts outlined when the lever is on. |
| `main/shadow-walk/sealed-targets.ts` | `clearSealedTokens` | - |
| `main/shadow-walk/sealed-targets.ts` | `issueSealedToken` | - |
| `main/shadow-walk/sealed-targets.ts` | `resolveSealedToken` | Resolve a sealed token to a live top-level viewport centre, scrolling the real node into view. |
| `main/takeover-key.ts` | `isTakeoverShortcut` | When to use: a `before-input-event` handler that must fire the takeover toggle. |
| `main/telemetry/bezier.ts` | `generateOrganicTrajectory` | Generates an organic, human-like trajectory between two coordinates. |
| `main/tools/ipc.ts` | `registerToolSettingsIpc` | Human-only writes over IPC. The bridge exposes a read-only config route to MCP processes. |
| `main/tools/state.ts` | `sanitizeToolSettings` | - |
| `main/tools/state.ts` | `buildToolManagerState` | - |
| `main/ui/menu-popup.ts` | `MenuPopup` | Themed, frameless dropdown hosted in its own small transparent window. |
| `main/viewport/profiles.ts` | `DeviceProfileStore` | - |
| `main/wrap/auth.ts` | `tokenFromHeaders` | - |
| `main/wrap/auth.ts` | `isWrapAuthorized` | - |
| `main/wrap/token.ts` | `readWrapToken` | - |
| `main/wrap/token.ts` | `tokenFile` | - |
| `main/wrap/token.ts` | `createWrapToken` | - |
| `main/zoom/settings.ts` | `ZoomSettingsStore` | The browser zoom policy lives next to the other human settings. The HTTP |
| `mcp/browser-mcp.ts` | `flushLogSync` | Synchronous drain used only on shutdown paths, where async I/O cannot run. |
| `mcp/browser-mcp.ts` | `logMcp` | - |
| `mcp/browser-mcp.ts` | `createBridgeMcpServer` | - |
| `mcp/browser-mcp.ts` | `normalizeIncomingParams` | - |
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
| `mcp/wrap-server.ts` | `createWrapMcpServer` | - |
| `mcp/wrap-tool-schema.ts` | `wrapInputToZodShape` | Convert a wrapper input schema into a Zod raw shape (one entry per property). |
| `mcp/wrap-tool-schema.ts` | `generatedToolName` | Deterministic MCP-safe name for a wrapper: `wrap_` + id with every character outside |
| `mcp/wrap-tool-schema.ts` | `isToolName` | True when `name` is a legal MCP tool name (exported for tests). |
| `renderer/menu-popup.ts` | `bootMenuPopup` | - |
| `renderer/research-panel.ts` | `initResearchPanel` | - |
| `renderer/settings-clients.ts` | `loadConnectPanel` | Read the connect info (once) and repaint the selected client snippet. |
| `renderer/settings-clients.ts` | `initConnectPanel` | Wire the client picker once, after the settings modal markup exists. |
| `renderer/settings-media.ts` | `loadMediaSettings` | Read the media settings and ffmpeg status and paint the form. |
| `renderer/settings-media.ts` | `initMediaPanel` | Wire the media form once, after the settings modal markup exists. |
| `renderer/settings-remote.ts` | `loadRemotePanel` | Read the gateway, tunnel and cloudflared status and paint the panel. |
| `renderer/settings-remote.ts` | `initRemotePanel` | Wire the panel once, after the settings modal markup exists. |
| `renderer/settings-wrap-secrets.ts` | `loadWrapSettings` | Read the credential list and repaint the secret panel and the editor picker. |
| `renderer/settings-wrap-secrets.ts` | `initWrapSecrets` | Wire the credential panel and the wrapper editor once. |
| `renderer/settings-wrap-secrets.ts` | `activeWrapTab` | The wrap subtab the user last selected (credentials or wrappers). |
| `renderer/tools-panel.ts` | `initToolsPanel` | - |
| `renderer/tools-panel.ts` | `refreshToolsPanel` | - |
| `renderer/viewport-controls.ts` | `initViewportControls` | - |
| `shared/brand.ts` | `BRAND` | Single source of truth for user-facing brand strings. |
| `shared/brand.ts` | `LEGACY_USER_DATA_NAMES` | Directory names a previous release used for Electron's `userData`. |
| `shared/version.ts` | `APP_VERSION` | Single source of truth for the application version. |

## Manual Notes

(Add notes here; they are preserved when the index is regenerated.)
