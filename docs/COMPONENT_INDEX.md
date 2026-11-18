# Component Index

<!-- generated: run `node scripts/anti-slop/generate-component-index.mjs` to regenerate -->

Inventory of shared layouts, components, hooks, services, and utilities under `src/`. 165 files, 658 exports.

> Rule of use: before creating any new component, hook, or utility, check this file first (see the `reuse-before-create` skill). When you add a shared abstraction, rerun the generator and fill in the "When to use" column.

## Utils (3)

| File | Export | When to use |
|---|---|---|
| `main/utils/json-navigator.ts` | `JsonNavigator` | - |
| `main/utils/json-navigator.ts` | `JsonQueryOptions` *(type)* | JSON Navigator Engine |
| `main/utils/json-navigator.ts` | `JsonQueryResult` *(type)* | - |

## Types (577)

| File | Export | When to use |
|---|---|---|
| `main/bridge/context.ts` | `WrapBridge` *(type)* | When to use: wire the optional REST/wrap, media, collaboration and settings services into the bridge. |
| `main/bridge/context.ts` | `BridgeDeps` *(type)* | When to use: pass the long-lived services a route family may need. |
| `main/bridge/context.ts` | `BridgeHandler` *(type)* | When to use: handle one parsed request; return true when the route family answered it. |
| `main/bridge/context.ts` | `BridgeContext` *(type)* | When to use: read request fields and answer without touching `req`/`res` directly. |
| `main/bridge/dispatch.ts` | `dispatchRouteTable` | When to use: dispatch a request against a family route table; false means "not my prefix". |
| `main/bridge/dispatch.ts` | `TableHandler` *(type)* | When to use: a route family hands control back to the bridge when the path is outside its prefix. |
| `main/browser/frame-eval.ts` | `evaluateInFrames` | Evaluate `expression` in the main frame and up to `maxFrames` child frames. |
| `main/browser/frame-eval.ts` | `FrameEvalOptions` *(type)* | - |
| `main/browser/frame-eval.ts` | `FrameEvalResult` *(type)* | - |
| `main/browser/frame-tree.ts` | `discoverFrames` | - |
| `main/browser/frame-tree.ts` | `FrameHandle` *(type)* | - |
| `main/browser/frame-tree.ts` | `FrameContext` *(type)* | - |
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
| `main/cortex/cortex-db.ts` | `cortex` | When to use: the process-wide Cortex store (history, bookmarks, semantic recall). |
| `main/cortex/cortex-db.ts` | `CortexDB` | When to use: opening the local LanceDB memory store, or building an isolated instance in tests. |
| `main/cortex/cortex-db.ts` | `PageHistoryRow` *(type)* | When to use: reading a raw history row from the store (visit time, title, domain). |
| `main/cortex/cortex-db.ts` | `BookmarkRow` *(type)* | When to use: reading a raw bookmark row from the store. |
| `main/cortex/cortex-db.ts` | `RecallResult` *(type)* | When to use: returning a ranked semantic recall hit (page chunk, score, source). |
| `main/cortex/cortex-db.ts` | `HistoryItem` *(type)* | When to use: shaping a history entry for `GET /cortex/history` and the deck. |
| `main/cortex/cortex-db.ts` | `UrlSuggestion` *(type)* | When to use: shaping an address-bar suggestion for `GET /cortex/suggest`. |
| `main/cortex/cortex-db.ts` | `BookmarkItem` *(type)* | When to use: shaping a bookmark for `GET /bookmarks` and the deck. |
| `main/cortex/cortex-db.ts` | `ScriptRow` *(type)* | When to use: reading a stored script row from the vault table. |
| `main/cortex/cortex-db.ts` | `ScriptItem` *(type)* | When to use: shaping a script for `GET /scripts/list` and recall results. |
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
| `main/downloads/download-manager.ts` | `DownloadManager` | - |
| `main/downloads/download-manager.ts` | `DownloadRecord` *(type)* | - |
| `main/drive/driver.ts` | `driveTask` | Run the loop until a stop condition. Never throws: every failure is a typed status. |
| `main/drive/driver.ts` | `DriveStatus` *(type)* | - |
| `main/drive/driver.ts` | `DriveStep` *(type)* | - |
| `main/drive/driver.ts` | `DriveResult` *(type)* | - |
| `main/drive/driver.ts` | `DriveOptions` *(type)* | - |
| `main/harvester/dom-serializer.ts` | `captureComposedDom` | Serialise the active page's composed DOM (light + open shadow roots). |
| `main/harvester/dom-serializer.ts` | `COMPOSE_DOM_SCRIPT` | JS evaluated in the page. Must stay self-contained: no imports, no template |
| `main/harvester/dom-serializer.ts` | `ComposedDom` *(type)* | Composed-DOM serialisation for the Markdown harvester. |
| `main/harvester/markdown.ts` | `ConstructHarvester` | - |
| `main/harvester/markdown.ts` | `HarvestStats` *(type)* | - |
| `main/hil/hil-manager.ts` | `HilManager` | - |
| `main/hil/hil-manager.ts` | `HilRequest` *(type)* | - |
| `main/hil/hil-manager.ts` | `HilResolution` *(type)* | - |
| `main/hil/hil-manager.ts` | `NotificationOptions` *(type)* | - |
| `main/input/human-activity.ts` | `shouldCountAsHuman` | Pure decision used by the monitor and by tests. |
| `main/input/human-activity.ts` | `humanListenerScript` | Self-contained listener. Idempotent: a second injection is a no-op. |
| `main/input/human-activity.ts` | `SYNTHETIC_GRACE_MS` | How long after our own dispatch a trusted event is still considered synthetic. |
| `main/input/human-activity.ts` | `HUMAN_CONSOLE_PREFIX` | Console prefix the page uses; anything else is ignored. |
| `main/input/human-activity.ts` | `HumanActivityMonitor` | - |
| `main/input/human-activity.ts` | `HumanActivity` *(type)* | Human takeover detection. |
| `main/input/human-control.ts` | `HumanControl` | When to use: the bridge, the deck or the MCP server asks whether a person has the |
| `main/input/human-control.ts` | `HumanControlHost` *(type)* | When to use: implement this when constructing a `HumanControl` — the chassis |
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
| `main/media/jobs.ts` | `MediaJobs` | When to use: enqueueing, cancelling and listing media jobs from the bridge. |
| `main/media/jobs.ts` | `MediaKind` *(type)* | When to use: selecting the downloader mode (video or audio-only). |
| `main/media/jobs.ts` | `MediaQuality` *(type)* | When to use: capping the selected format (best, 1080/720/480, worst). |
| `main/media/jobs.ts` | `MediaJobState` *(type)* | When to use: reporting or observing a media job lifecycle state. |
| `main/media/jobs.ts` | `MediaJobFile` *(type)* | When to use: describing one downloaded file (path, bytes, format note). |
| `main/media/jobs.ts` | `MediaProgress` *(type)* | When to use: reporting download progress (percent, speed, ETA) to the deck. |
| `main/media/jobs.ts` | `MediaJob` *(type)* | When to use: queueing, cancelling or inspecting one media job. |
| `main/media/jobs.ts` | `MediaJobInput` *(type)* | When to use: starting a media job from a URL plus kind/quality options. |
| `main/media/jobs.ts` | `MediaJobsOptions` *(type)* | When to use: constructing the job queue (binary paths, ffmpeg) in the app or tests. |
| `main/media/platform.ts` | `mediaPlatformKey` | `win32-x64`, `darwin-arm64`, `linux-x64` — matches `bin/media/<key>`. |
| `main/media/platform.ts` | `ytDlpFileName` | - |
| `main/media/platform.ts` | `ytdlpRuntimeOptions` | Point yt-dlp at Electron's own binary as a Node runtime. |
| `main/media/platform.ts` | `compareYtDlpVersions` | Compare `2026.10.26`-style versions. Returns >0 when `a` is newer. |
| `main/media/platform.ts` | `ytDlpReleaseAsset` | The GitHub release asset name for a target platform. |
| `main/media/platform.ts` | `parseChecksum` | Find one asset hash in a `SHA2-256SUMS` file. |
| `main/media/platform.ts` | `YtDlpRuntimeKind` *(type)* | Pure helpers for the media tooling: platform naming and the yt-dlp runtime. |
| `main/media/platform.ts` | `YtDlpRuntime` *(type)* | - |
| `main/media/service.ts` | `MediaService` | When to use: starting media jobs from the bridge, or wiring the media tools in the app. |
| `main/media/service.ts` | `MediaRuntimeStatus` *(type)* | When to use: reporting only the media runtime fields on the health payload. |
| `main/media/service.ts` | `MediaStatus` *(type)* | When to use: rendering the deck media panel or `GET /media/status`. |
| `main/media/service.ts` | `MediaInfo` *(type)* | When to use: answering `GET /media/info` with a resolved URL title/duration/formats. |
| `main/media/service.ts` | `MediaInfoResult` *(type)* | When to use: returning metadata (or the refusal) from `POST /media/info`. |
| `main/media/service.ts` | `MediaServiceError` *(type)* | When to use: carrying a binary/job failure with its code up to the route. |
| `main/media/service.ts` | `MediaTranscriptResult` *(type)* | When to use: returning a transcript or subtitle document from `POST /media/transcript`. |
| `main/media/service.ts` | `MediaPreviewImage` *(type)* | When to use: attaching a generated thumbnail to `POST /media/preview`. |
| `main/media/service.ts` | `MediaPreviewResult` *(type)* | When to use: returning preview frames (or the refusal) from `POST /media/preview`. |
| `main/media/service.ts` | `MediaDownloadResult` *(type)* | When to use: returning a finished download (path, bytes, title) from `POST /media/download`. |
| `main/media/transcript.ts` | `parseVtt` | VTT → plain text. |
| `main/media/transcript.ts` | `transcriptDocument` | The document stored in Cortex for one transcript. |
| `main/media/transcript.ts` | `fetchArtifacts` | Fetch captions (and optionally the thumbnail) into `dir`. |
| `main/media/transcript.ts` | `SubtitleArtifacts` *(type)* | - |
| `main/media/transcript.ts` | `ArtifactResult` *(type)* | - |
| `main/media/updater.ts` | `jitter` | ±10% jitter so a fleet of installs does not hit GitHub on the same second. |
| `main/media/updater.ts` | `MediaUpdater` | - |
| `main/media/updater.ts` | `MediaUpdaterOptions` *(type)* | - |
| `main/menu/context-menu.ts` | `attachContextMenu` | - |
| `main/menu/context-menu.ts` | `ContextMenuOptions` *(type)* | - |
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
| `main/primitives/primitives.ts` | `PrimitiveError` | When to use: throwing a structured primitive failure that the bridge maps to a status. |
| `main/primitives/primitives.ts` | `Primitives` | When to use: driving observe/find/act/wait/extract/collect — the agent-facing primitive layer. |
| `main/primitives/primitives.ts` | `PrimitivesHost` *(type)* | Primitives — the orthogonal observe / act / wait layer. |
| `main/primitives/primitives.ts` | `PrimitiveErrorCode` *(type)* | When to use: branching on a primitive failure; the codes map to bridge HTTP statuses. |
| `main/primitives/primitives.ts` | `WaitCondition` *(type)* | When to use: describing one wait_for/expect condition (selector, text, url, count, ...). |
| `main/primitives/primitives.ts` | `ConditionResult` *(type)* | When to use: reading the per-condition outcome of wait_for/expect. |
| `main/primitives/primitives.ts` | `WaitResult` *(type)* | When to use: returning the aggregate wait verdict (ok, attempts, elapsed, results). |
| `main/primitives/primitives.ts` | `PageState` *(type)* | When to use: comparing revisions, URLs and text lengths for the diff primitive. |
| `main/primitives/primitives.ts` | `ObserveOptions` *(type)* | When to use: shaping observe output (format, region, budget, cursor, frames). |
| `main/primitives/primitives.ts` | `ExtractOptions` *(type)* | When to use: shaping extract (list, table, tables, app_data, schema_org). |
| `main/primitives/primitives.ts` | `CollectOptions` *(type)* | When to use: shaping collect_all (container, scroll step, delay, max scrolls). |
| `main/primitives/primitives.ts` | `FindOptions` *(type)* | When to use: shaping find (role/name/text/regex/selector, offscreen, frames). |
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
| `main/recording/recording-service.ts` | `onRecordingStatus` | When to use: the deck subscribes to recorder state changes (start/stop/failure). |
| `main/recording/recording-service.ts` | `setRecordingWindow` | When to use: wiring the window the recorder captures; called once during app bootstrap. |
| `main/recording/recording-service.ts` | `loadRecordingConfig` | When to use: restoring persisted recording settings at startup. |
| `main/recording/recording-service.ts` | `getRecordingConfig` | When to use: reading the effective recording settings where a tool is about to run. |
| `main/recording/recording-service.ts` | `saveRecordingConfig` | When to use: applying a settings patch from IPC; returns the normalised config. |
| `main/recording/recording-service.ts` | `getRecordingStatus` | When to use: answering health, the deck and the tool gate with the current recorder state. |
| `main/recording/recording-service.ts` | `pickRecordingDir` | When to use: the human chooses a new capture folder from Settings → Recording. |
| `main/recording/recording-service.ts` | `startRecording` | Start recording the Cyberdeck window. Resolves when the renderer has the stream running. |
| `main/recording/recording-service.ts` | `readyRecording` | Called by the renderer once the stream and encoder are actually running. |
| `main/recording/recording-service.ts` | `stopRecording` | Ask the renderer to finalise; the file is written when it calls `saveRecording`. |
| `main/recording/recording-service.ts` | `saveRecording` | Called from the renderer with the finished WebM bytes. |
| `main/recording/recording-service.ts` | `failRecording` | When to use: surfacing a capture failure to the deck and clearing the in-progress state. |
| `main/recording/recording-service.ts` | `listRecordings` | Finished recordings, newest first. Paths are absolute and ready for a file-upload field. |
| `main/recording/recording-service.ts` | `RecordingConfig` *(type)* | When to use: reading or patching the recording settings (enabled, tools switch, output directory). |
| `main/recording/recording-service.ts` | `RecordingResult` *(type)* | When to use: reporting a finished recording (path, bytes, frames) to the caller and HUD. |
| `main/recording/recording-service.ts` | `RecordingStatus` *(type)* | When to use: rendering the deck recorder or answering `GET /recording/status`. |
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
| `main/research/researcher.ts` | `extractHighlights` | Extractive highlights: paragraphs of the source that mention the most query terms, best first. |
| `main/research/researcher.ts` | `Researcher` | - |
| `main/research/researcher.ts` | `ResearchOptions` *(type)* | - |
| `main/research/researcher.ts` | `ResearchSource` *(type)* | - |
| `main/research/researcher.ts` | `ResearchOutcome` *(type)* | - |
| `main/research/researcher.ts` | `ResearcherDeps` *(type)* | - |
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
| `main/settings/jev.ts` | `JevSettingsStore` | - |
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
| `main/shadow-walk/settings.ts` | `normalizeShadowWalkSettings` | When to use: validating settings from disk or IPC before they are saved or applied. |
| `main/shadow-walk/settings.ts` | `loadShadowWalkSettings` | When to use: reading the effective settings (file plus env overrides) at the point of use. |
| `main/shadow-walk/settings.ts` | `saveShadowWalkSettings` | When to use: persisting a settings patch from IPC; returns validation errors untouched. |
| `main/shadow-walk/settings.ts` | `shadowWalkStatus` | When to use: building the flat status snapshot for the HUD and the bridge health payload. |
| `main/shadow-walk/settings.ts` | `shadowWalkRefusal` | Structured refusal for a guarded surface, or null when the call may proceed. |
| `main/shadow-walk/settings.ts` | `SHADOW_WALK_SETTINGS_FILE` | When to use: locating the persisted Shadow Walk settings file (tests, diagnostics). |
| `main/shadow-walk/settings.ts` | `DEFAULT_SHADOW_WALK_SETTINGS` | When to use: a fresh profile, a corrupt settings file, or resetting to the shipped defaults. |
| `main/shadow-walk/settings.ts` | `shadowWalkSettings` | When to use: the process-wide store; prefer `loadShadowWalkSettings`/`saveShadowWalkSettings`. |
| `main/shadow-walk/settings.ts` | `ShadowWalkSettingsStore` | When to use: constructing an isolated store in tests, or reading/saving the real profile file. |
| `main/shadow-walk/settings.ts` | `ShadowWalkSettings` *(type)* | When to use: reading or patching the Shadow Walk levers (master switch plus per-surface toggles). |
| `main/shadow-walk/settings.ts` | `ShadowWalkSettingsResult` *(type)* | When to use: handing a save/normalize outcome back to the settings UI; errors are shown verbatim. |
| `main/shadow-walk/settings.ts` | `ShadowWalkSurface` *(type)* | When to use: asking `shadowWalkRefusal` whether one guarded surface may run. |
| `main/shadow-walk/settings.ts` | `ShadowWalkRefusal` *(type)* | When to use: a guarded call is disabled — carry the code/message to the caller instead of throwing. |
| `main/shadow-walk/settings.ts` | `ShadowWalkStatus` *(type)* | When to use: rendering Settings → Shadow Walk or the `/health` shadowWalk block. |
| `main/shadow-walk/tab-walk.ts` | `runTabWalk` | Walk sequential focus from a host. |
| `main/shadow-walk/tab-walk.ts` | `TabWalkOptions` *(type)* | - |
| `main/shadow-walk/tab-walk.ts` | `TabWalkStep` *(type)* | - |
| `main/shadow-walk/tab-walk.ts` | `TabWalkResult` *(type)* | - |
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
| `main/wrap/executor.ts` | `WrapTransportError` | - |
| `main/wrap/executor.ts` | `WrapExecutor` | - |
| `main/wrap/executor.ts` | `WrapIndexDocument` *(type)* | One rendered document handed to an opt-in indexer (Cortex). |
| `main/wrap/executor.ts` | `WrapIndexContext` *(type)* | - |
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
| `main/wrap/render.ts` | `renderPayload` | Recipe rendering for one payload, with the legacy fallbacks. |
| `main/wrap/render.ts` | `safeHost` | When to use: logging or showing a URL without leaking its query or credentials. |
| `main/wrap/render.ts` | `previewUrl` | The preview URL for a plan. |
| `main/wrap/render.ts` | `secretVariants` | When to use: collecting every encoding of a stored secret before redacting output. |
| `main/wrap/render.ts` | `redactText` | When to use: masking secret values in a string before it reaches a log or an agent. |
| `main/wrap/render.ts` | `redactDeep` | When to use: recursively redacting secret values in parsed JSON before returning it. |
| `main/wrap/render.ts` | `parseJson` | When to use: decoding a response body as JSON only when the content type or text really is JSON. |
| `main/wrap/render.ts` | `toRecords` | When to use: normalising a JSON payload into record objects for the records view. |
| `main/wrap/render.ts` | `fence` | When to use: rendering a body as a fenced code block, clipped to a character budget. |
| `main/wrap/render.ts` | `clip` | When to use: truncating text with a visible marker for previews and logs. |
| `main/wrap/render.ts` | `failure` | When to use: building the wrap surface failure envelope (code, message, status). |
| `main/wrap/render.ts` | `isPlainObject` | When to use: checking a parsed value is a JSON object before reading keys off it. |
| `main/wrap/render.ts` | `clampInt` | When to use: bounding a numeric option (limit, timeout) to a supported range. |
| `main/wrap/render.ts` | `Rendered` *(type)* | When to use: reading the result of `renderPayload` — body text or fence plus paging notes. |
| `main/wrap/secrets.ts` | `SecretStore` | When to use: storing or resolving wrapper credentials; values never leave the store unredacted. |
| `main/wrap/secrets.ts` | `WrapSecretKind` *(type)* | When to use: declaring whether a wrapper credential is a static value or an OAuth2 client. |
| `main/wrap/secrets.ts` | `WrapOAuthMetadata` *(type)* | When to use: describing the token endpoint and client of an OAuth2 wrapper credential. |
| `main/wrap/secrets.ts` | `WrapSecretMetadata` *(type)* | When to use: listing stored credentials in Settings → Wrappers without exposing values. |
| `main/wrap/secrets.ts` | `WrapSecretInput` *(type)* | When to use: creating or updating a stored credential from the settings UI. |
| `main/wrap/secrets.ts` | `SecretCipher` *(type)* | When to use: injecting a different at-rest cipher in tests or a host with its own key store. |
| `main/wrap/secrets.ts` | `SecretResolution` *(type)* | When to use: reading a resolved credential just before a wrapped request is sent. |
| `main/wrap/secrets.ts` | `TokenRequest` *(type)* | When to use: implementing a TokenMinter or minting an OAuth2 token for a wrapper. |
| `main/wrap/secrets.ts` | `TokenResult` *(type)* | When to use: returning a minted token (or the failure) from a TokenMinter. |
| `main/wrap/secrets.ts` | `TokenMinter` *(type)* | When to use: supplying the OAuth2 token exchange used by an oauth2 wrapper credential. |
| `main/wrap/secrets.ts` | `SecretStoreOptions` *(type)* | When to use: constructing an isolated SecretStore (custom file, cipher) in tests. |
| `main/wrap/security.ts` | `assertSafeUrl` | - |
| `main/wrap/security.ts` | `isPrivateHostname` | A hostname that is private by name alone, before any lookup. |
| `main/wrap/security.ts` | `isPrivateAddress` | - |
| `main/wrap/security.ts` | `resolveHosts` | The resolver the policy uses when the host injects none. Exported so a second |
| `main/wrap/security.ts` | `WrapSecurityError` | - |
| `main/wrap/security.ts` | `UrlPolicy` *(type)* | - |
| `main/wrap/store.ts` | `WrapStore` | - |
| `main/wrap/store.ts` | `StoreResult` *(type)* | - |
| `main/wrap/types.ts` | `WrapMethod` *(type)* | When to use: declaring the HTTP method of a saved wrapper. |
| `main/wrap/types.ts` | `WrapFormat` *(type)* | When to use: choosing whether a wrapper renders markdown, JSON, or both. |
| `main/wrap/types.ts` | `WrapInputSchema` *(type)* | The subset of JSON Schema used by wrapper inputs. |
| `main/wrap/types.ts` | `WrapRequest` *(type)* | When to use: describing the outbound request template of a wrapper (URL, headers, body). |
| `main/wrap/types.ts` | `WrapWrapper` *(type)* | When to use: creating, storing or executing a saved REST wrapper. |
| `main/wrap/types.ts` | `WrapManifestEntry` *(type)* | When to use: listing a wrapper in `wrap_list` or the settings table. |
| `main/wrap/types.ts` | `WrapPreview` *(type)* | When to use: showing a dry run — resolved URL, redacted headers and the request body. |
| `main/wrap/types.ts` | `WrapErrorInfo` *(type)* | When to use: returning a structured wrapper failure (code, status, redacted detail). |
| `main/wrap/types.ts` | `WrapResponseInfo` *(type)* | When to use: reporting status, bytes, content type and paging for a wrapper run. |
| `main/wrap/types.ts` | `WrapIndexed` *(type)* | When to use: reading the manifest index (ids, names, secrets) for generated tools. |
| `main/wrap/types.ts` | `WrapRunResult` *(type)* | When to use: returning a wrapper execution result (rendered body, response info, paging). |
| `main/wrap/validate-wrapper.ts` | `validateWrapper` | - |
| `main/wrap/validate-wrapper.ts` | `isPlainObject` | - |
| `main/wrap/validate-wrapper.ts` | `WrapperValidation` *(type)* | - |
| `main/zoom/runtime.ts` | `ZoomRuntime` | When to use: the chassis, the deck or the MCP zoom tool needs the page-zoom policy, |
| `main/zoom/runtime.ts` | `ZoomRuntimeHost` *(type)* | When to use: implement this when constructing a `ZoomRuntime` — the chassis |
| `mcp/tool-groups.ts` | `groupAction` | - |
| `mcp/tool-groups.ts` | `TOOL_GROUPS` | - |
| `mcp/tool-groups.ts` | `META_TOOL_NAMES` | - |
| `mcp/tool-groups.ts` | `CONSOLIDATED_GROUPED_TOOLS` | - |
| `mcp/tool-groups.ts` | `CONSOLIDATED_HIDDEN_TOOLS` | `collect_all` is folded into `extract`; old callers can still use it by name. |
| `mcp/tool-groups.ts` | `ToolArgs` *(type)* | Consolidated MCP surface. |
| `mcp/tool-groups.ts` | `ToolGroupAction` *(type)* | - |
| `mcp/tool-groups.ts` | `ToolGroupDefinition` *(type)* | - |
| `mcp/tools-catalog.ts` | `TOOLS_CATALOG` | - |
| `mcp/tools-catalog.ts` | `TIER_LABELS` | Discoverability tiers (docs/TOOL_CATALOG_REVIEW.md §3, Phase 4). |
| `mcp/tools-catalog.ts` | `TOOL_TIERS` | - |
| `mcp/tools-catalog.ts` | `DEFAULT_TOOL_ORDER` | Curated default order for `tools/list` and the Settings -> Tools list. |
| `mcp/tools-catalog.ts` | `ToolCatalogItem` *(type)* | - |
| `preload/index.ts` | `ElectronAPI` *(type)* | - |
| `renderer/recording.ts` | `isRecording` | - |
| `renderer/recording.ts` | `beginRecording` | - |
| `renderer/recording.ts` | `finishRecording` | - |
| `renderer/recording.ts` | `BeginPayload` *(type)* | - |
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
| `shared/viewport.ts` | `specFromProfile` | When to use: turn a stored device profile into the active emulation spec. |
| `shared/viewport.ts` | `normalizeViewportSpec` | When to use: validate untrusted input (IPC, bridge, settings file) before applying emulation. |
| `shared/viewport.ts` | `normalizeDeviceProfile` | When to use: validate a custom profile before saving it to settings. |
| `shared/viewport.ts` | `orientationOf` | When to use: label the current spec portrait or landscape for the HUD. |
| `shared/viewport.ts` | `rotateSpec` | Swap width/height, keeping the physical device size. |
| `shared/viewport.ts` | `fitViewport` | Fit an emulated device inside the browsing area. |
| `shared/viewport.ts` | `findProfile` | When to use: resolve a profile id against the merged built-in and custom list. |
| `shared/viewport.ts` | `BUILTIN_PROFILES` | When to use: seed the profile picker; these ship with the app and cannot be deleted. |
| `shared/viewport.ts` | `MIN_VIEWPORT_DIMENSION` | When to use: clamp width/height so an emulated page stays renderable. |
| `shared/viewport.ts` | `MAX_VIEWPORT_DIMENSION` | When to use: clamp width/height to the largest sane emulated device. |
| `shared/viewport.ts` | `MIN_DEVICE_SCALE` | When to use: clamp an emulated DPR below the smallest useful value. |
| `shared/viewport.ts` | `MAX_DEVICE_SCALE` | When to use: clamp an emulated DPR above the largest useful value. |
| `shared/viewport.ts` | `MAX_CUSTOM_PROFILES` | When to use: cap how many human-added profiles are stored in settings. |
| `shared/viewport.ts` | `VIEWPORT_MARGIN` | Empty space kept around the emulated device inside the browsing area. |
| `shared/viewport.ts` | `Orientation` *(type)* | When to use: label the current device orientation in the HUD and tool results. |
| `shared/viewport.ts` | `DeviceProfile` *(type)* | When to use: describe one emulated device, built-in or human-added, in the profile picker. |
| `shared/viewport.ts` | `ViewportSpec` *(type)* | When to use: carry the active emulation settings between the HUD, IPC and `browser_viewport`. |
| `shared/viewport.ts` | `ViewportRect` *(type)* | When to use: place the native browsing view inside the letterboxed emulation area. |
| `shared/viewport.ts` | `ViewportState` *(type)* | When to use: read emulation as one snapshot - active spec, frame, scale and profile list. |
| `shared/web-state.ts` | `WebPageState` *(type)* | Page-level signals collected for the WEB STATE tab on the Command Deck. |
| `shared/zoom.ts` | `normalizeZoomSettings` | - |
| `shared/zoom.ts` | `nextZoomStep` | - |
| `shared/zoom.ts` | `clampZoomFactor` | - |
| `shared/zoom.ts` | `DEFAULT_ZOOM_SETTINGS` | - |
| `shared/zoom.ts` | `ZOOM_STEPS` | Chrome-like zoom stops, used by the toolbar and the agent-facing tool. |
| `shared/zoom.ts` | `ZoomMode` *(type)* | Page zoom policy and the shape reported to the HUD, IPC callers and MCP. |
| `shared/zoom.ts` | `ZoomSettings` *(type)* | - |
| `shared/zoom.ts` | `ZoomState` *(type)* | - |

## Modules (78)

| File | Export | When to use |
|---|---|---|
| `main/bridge/routes/collaboration.ts` | `handleCollaborationRoutes` | When to use: the request targets `/collaboration/*`; returns false for other paths. |
| `main/bridge/routes/decision.ts` | `handleDecisionRoutes` | When to use: the request is a decision-model call, its transcript or the drive loop. |
| `main/bridge/routes/inspection.ts` | `handleInspectionRoutes` | When to use: the request reads the page, frames, screenshots or downloaded documents. |
| `main/bridge/routes/interaction.ts` | `handleInteractionRoutes` | When to use: the request is a navigation, action, recipe, mark or script call. |
| `main/bridge/routes/media.ts` | `handleMediaRoutes` | When to use: the request targets `/media/*`; returns false for other paths. |
| `main/bridge/routes/memory.ts` | `handleMemoryRoutes` | When to use: the request targets Cortex memory or bookmarks; false leaves it to other families. |
| `main/bridge/routes/network.ts` | `handleNetworkRoutes` | When to use: the request reads or clears network traffic, streams or capture buffers. |
| `main/bridge/routes/primitives.ts` | `handlePrimitiveRoutes` | When to use: the request is a primitives call (observe, find, act, wait, extract, collect). |
| `main/bridge/routes/research.ts` | `handleResearchRoutes` | When to use: the request is a research/extraction call; returns false for other paths. |
| `main/bridge/routes/session.ts` | `handleSessionRoutes` | When to use: the request is a recording, session/context, HIL or window call. |
| `main/bridge/routes/system.ts` | `handleSystemRoutes` | When to use: the request is a health/config/metrics/human-control call. These are |
| `main/bridge/routes/view.ts` | `handleViewRoutes` | When to use: the request targets tabs, zoom or viewport; false leaves it to other families. |
| `main/bridge/routes/wrap.ts` | `handleWrapRoutes` | When to use: the request targets `/wrap/*`; handles auth and returns false for other paths. |
| `main/browser/frame-marks.ts` | `clearFrameMarks` | - |
| `main/browser/frame-marks.ts` | `registerFrameMarks` | - |
| `main/browser/frame-marks.ts` | `resolveFrameMark` | Resolve a frame mark to a live page-space target. Returns null when the frame navigated, the |
| `main/browser-chassis.ts` | `BrowserChassis` | - |
| `main/collaboration/service.ts` | `CollaborationService` | - |
| `main/data-paths.ts` | `dataRoot` | - |
| `main/data-paths.ts` | `dataPath` | - |
| `main/diagnostics/main-log.ts` | `mainLogFile` | - |
| `main/diagnostics/main-log.ts` | `logMainEvent` | - |
| `main/http-bridge.ts` | `startHttpBridge` | - |
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
| `main/remote/token.ts` | `remoteTokenFile` | When to use: resolve the remote gateway's capability-token path under its data directory. |
| `main/remote/token.ts` | `createRemoteToken` | When to use: rotate the remote-gateway token on app start. The caller owns the directory. |
| `main/remote/token.ts` | `readRemoteToken` | When to use: authenticate a remote request against the token file on disk. |
| `main/settings/experimental.ts` | `ExperimentalSettingsStore` | - |
| `main/settings/json-file.ts` | `readJsonFile` | When to use: decoding a settings file; returns null when it is missing, unreadable |
| `main/settings/json-file.ts` | `writeJsonFileAtomic` | When to use: replacing a settings file atomically; returns the underlying error |
| `main/shadow-walk/part-highlight.ts` | `injectPartHighlight` | - |
| `main/shadow-walk/part-highlight.ts` | `removePartHighlight` | - |
| `main/shadow-walk/part-highlight.ts` | `withPartHighlight` | Run a screenshot capture with exported parts outlined when the lever is on. |
| `main/shadow-walk/sealed-targets.ts` | `clearSealedTokens` | - |
| `main/shadow-walk/sealed-targets.ts` | `issueSealedToken` | - |
| `main/shadow-walk/sealed-targets.ts` | `resolveSealedToken` | Resolve a sealed token to a live top-level viewport centre, scrolling the real node into view. |
| `main/snapshots/screenshot-store.ts` | `screenshotsDir` | When to use: writing a screenshot and needing the capture folder (created if absent). |
| `main/snapshots/screenshot-store.ts` | `pruneScreenshots` | When to use: trimming old captures — called after every write and by |
| `main/telemetry/bezier.ts` | `generateOrganicTrajectory` | Generates an organic, human-like trajectory between two coordinates. |
| `main/token-file.ts` | `createTokenFile` | When to use: mint a fresh capability token at `target`, replacing any previous file atomically. |
| `main/token-file.ts` | `readTokenFile` | When to use: validate a token file read by a companion process. A missing, unreadable, |
| `main/tools/ipc.ts` | `registerToolSettingsIpc` | Human-only writes over IPC. The bridge exposes a read-only config route to MCP processes. |
| `main/tools/state.ts` | `sanitizeToolSettings` | - |
| `main/tools/state.ts` | `buildToolManagerState` | - |
| `main/ui/menu-popup.ts` | `MenuPopup` | Themed, frameless dropdown hosted in its own small transparent window. |
| `main/viewport/profiles.ts` | `DeviceProfileStore` | - |
| `main/wrap/auth.ts` | `tokenFromHeaders` | - |
| `main/wrap/auth.ts` | `isWrapAuthorized` | - |
| `main/wrap/token.ts` | `tokenFile` | When to use: resolve the wrap bridge's capability-token path under its data directory. |
| `main/wrap/token.ts` | `createWrapToken` | When to use: rotate the wrap-bridge token on app start so old processes lose access. |
| `main/wrap/token.ts` | `readWrapToken` | When to use: authenticate a wrap request against the token file on disk. |
| `main/zoom/settings.ts` | `ZoomSettingsStore` | - |
| `mcp/browser-mcp.ts` | `flushLogSync` | Synchronous drain used only on shutdown paths, where async I/O cannot run. |
| `mcp/browser-mcp.ts` | `logMcp` | - |
| `mcp/browser-mcp.ts` | `createBridgeMcpServer` | - |
| `mcp/browser-mcp.ts` | `normalizeIncomingParams` | - |
| `mcp/format-mark.ts` | `formatMark` | Renders one Set-of-Marks entry as a compact, accessibility-aware line: |
| `mcp/wrap-server.ts` | `createWrapMcpServer` | - |
| `mcp/wrap-tool-schema.ts` | `wrapInputToZodShape` | Convert a wrapper input schema into a Zod raw shape (one entry per property). |
| `mcp/wrap-tool-schema.ts` | `generatedToolName` | Deterministic MCP-safe name for a wrapper: `wrap_` + id with every character outside |
| `mcp/wrap-tool-schema.ts` | `isToolName` | True when `name` is a legal MCP tool name (exported for tests). |
| `renderer/menu-popup.ts` | `bootMenuPopup` | - |
| `renderer/research-panel.ts` | `initResearchPanel` | - |
| `renderer/tools-panel.ts` | `initToolsPanel` | - |
| `renderer/tools-panel.ts` | `refreshToolsPanel` | - |
| `renderer/viewport-controls.ts` | `initViewportControls` | - |
| `shared/brand.ts` | `BRAND` | Single source of truth for user-facing brand strings. |
| `shared/brand.ts` | `LEGACY_USER_DATA_NAMES` | Directory names a previous release used for Electron's `userData`. |
| `shared/version.ts` | `APP_VERSION` | Single source of truth for the application version. |

## Manual Notes

(Add notes here; they are preserved when the index is regenerated.)
