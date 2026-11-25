# Component Index — digest

<!-- generated: run `node scripts/anti-slop/generate-component-index.mjs` to regenerate -->

317 modules, 1003 exports under `src/`. Full "When to use" descriptions live in [docs/COMPONENT_INDEX.md](COMPONENT_INDEX.md) — grep it by concept before creating a component, hook, or utility (see `reuse-before-create`).

| Module | Exports |
|---|---|
| `main/boot/hud-watchdog.ts` | 2: HudWatchdog, HudWatchdogDeps |
| `main/boot/services.ts` | 2: AppServices, ServicesDeps |
| `main/boot/shell-window.ts` | 4: createShellWindow, registerUpdateHandlers, loadShell, ShellWindowDeps |
| `main/boot/start-loops.ts` | 1: startLoops |
| `main/boot/window-boot.ts` | 3: WindowBootSurface, DownloadNotice, WindowBootDeps |
| `main/brand-icon.ts` | 2: brandIconPath, brandIcon |
| `main/browser-chassis.ts` | 1: BrowserChassis |
| `main/browser/frame-eval.ts` | 3: evaluateInFrames, FrameEvalOptions, FrameEvalResult |
| `main/browser/frame-marks.ts` | 3: clearFrameMarks, registerFrameMarks, resolveFrameMark |
| `main/browser/frame-tree.ts` | 3: discoverFrames, FrameHandle, FrameContext |
| `main/browser/frames-inventory.ts` | 5: inventoryFrames, FrameInventoryResult, FramesInventoryDeps, FrameShot, FramesInventoryOptions |
| `main/browser/frames.ts` | 3: listFrames, FrameRect, FrameInfo |
| `main/browser/layout-viewport.ts` | 2: layoutViewport, ViewportRect |
| `main/browser/page-script-surface.ts` | 2: PageScriptSurface, PageScriptSurfaceDeps |
| `main/capabilities.ts` | 1: BRIDGE_CAPABILITIES |
| `main/capture/screenshot-jpeg.ts` | 2: captureScreenshotJpeg, ScreenshotJpegDeps |
| `main/chassis/accessors.ts` | 10: reassertChassisViewport, setViewportVisibility, activeWebContents, pageInfo, currentRevision, bumpRevision, queryChassisJson, prerenderLinks, … (10) |
| `main/chassis/harvest-nav-stack.ts` | 2: createHarvestNavStack, HarvestNavStack |
| `main/chassis/host.ts` | 1: ChassisHost |
| `main/chassis/input-stack.ts` | 2: createInputStack, InputStack |
| `main/chassis/interaction-stack.ts` | 2: createInteractionStack, InteractionStack |
| `main/chassis/llm-stack.ts` | 2: createLlmStack, LlmStack |
| `main/chassis/surfaces.ts` | 14: createPageScriptSurface, createShadowWalkSurface, createResearchViewSurface, createHumanSurface, createDeckController, createJevController, createZoomController, createConsentController, … (14) |
| `main/collaboration/assets/css.ts` | 1: COLLAB_CSS |
| `main/collaboration/assets/note-drawer-a.ts` | 1: NOTE_DRAWER_BODY_A |
| `main/collaboration/assets/note-drawer-b.ts` | 1: NOTE_DRAWER_BODY_B |
| `main/collaboration/assets/overlay-body.ts` | 2: OVERLAY_BODY_A, OVERLAY_BODY_C |
| `main/collaboration/assets/picker-body.ts` | 1: PICKER_BODY |
| `main/collaboration/overlay.ts` | 8: collaborationNoteDrawerScript, collaborationPickerScript, collaborationOverlayScript, COLLABORATION_NOTE_PREFIX, COLLABORATION_CLASS_PREFIX, COLLABORATION_RESOLVE_PREFIX, COLLABORATION_EXIT_PREFIX, CollaborationPickerOptions |
| `main/collaboration/service.ts` | 1: CollaborationService |
| `main/collaboration/store.ts` | 2: CollaborationStore, CreateThreadInput |
| `main/collaboration/surface.ts` | 3: CollaborationSurface, CollaborationNote, CollaborationSurfaceDeps |
| `main/cortex/bookmark-store.ts` | 1: BookmarkStore |
| `main/cortex/chunker.ts` | 3: chunkMarkdown, extractDomain, PageChunk |
| `main/cortex/connection.ts` | 2: seedHistoryRow, CortexConnection |
| `main/cortex/cortex-db.ts` | 2: cortex, CortexDB |
| `main/cortex/embedder.ts` | 9: registerEmbeddingProvider, listEmbeddingProviders, setEmbeddingProvider, getEmbeddingProvider, embedText, generateEmbedding, DEFAULT_PROVIDER_ID, EMBEDDING_DIM, … (9) |
| `main/cortex/history-store.ts` | 1: HistoryStore |
| `main/cortex/script-store.ts` | 1: ScriptStore |
| `main/cortex/types.ts` | 12: tokenizeQuery, toStringArray, bookmarkSearchText, cosineSimilarity, PageHistoryRow, BookmarkRow, RecallResult, HistoryItem, … (12) |
| `main/crawl/crawler.ts` | 9: normalizeUrl, matchesAnyPattern, linksFromMarkdown, Crawler, HumanAssistInfo, CrawlOptions, CrawlPage, CrawlOutcome, … (9) |
| `main/data-paths.ts` | 3: dataRoot, dataPath, writeJsonAtomic |
| `main/decide/config.ts` | 4: resolveDecisionConfig, readStoredDecisionConfig, saveDecisionConfig, decisionStatus |
| `main/decide/decision-client.ts` | 1: runDecision |
| `main/decide/decision-guard.ts` | 5: validateAnswers, decideGuarded, DecisionGuard, GuardRejection, GuardedDecision |
| `main/decide/decision-questions.ts` | 2: summarizeQuestions, DecisionQuestionSummary |
| `main/decide/decision-surface.ts` | 2: DecisionSurface, DecisionSurfaceDeps |
| `main/decide/events.ts` | 2: onDecision, emitDecisionEvent |
| `main/decide/local.ts` | 1: runLocalOnnx |
| `main/decide/sensitive-gate.ts` | 3: detectSensitiveGate, SensitiveGate, GateDetection |
| `main/decide/transport.ts` | 1: runTypesafe |
| `main/decide/types.ts` | 6: DecisionProtocol, DecisionConfig, DecisionCall, DecisionFailureCode, DecisionResult, DecisionEvent |
| `main/deck/collab.ts` | 2: CollabController, CollabControllerDeps |
| `main/deck/controller.ts` | 3: DeckController, DeckMode, DeckControllerDeps |
| `main/diagnostics/console-log.ts` | 2: ConsoleLogBuffer, ConsoleLogEntry |
| `main/diagnostics/main-log.ts` | 2: mainLogFile, logMainEvent |
| `main/downloads/download-manager.ts` | 2: DownloadManager, DownloadRecord |
| `main/downloads/download-surface.ts` | 2: DownloadSurface, DownloadSurfaceDeps |
| `main/drive/driver.ts` | 5: driveTask, DriveStatus, DriveStep, DriveResult, DriveOptions |
| `main/harvest/harvest-surface.ts` | 2: HarvestSurface, HarvestSurfaceDeps |
| `main/harvest/screenshots.ts` | 3: ScreenshotStore, ScreenshotStoreDeps, ScreenshotPayload |
| `main/harvester/dom-serializer.ts` | 3: captureComposedDom, COMPOSE_DOM_SCRIPT, ComposedDom |
| `main/harvester/markdown.ts` | 2: ConstructHarvester, HarvestStats |
| `main/hil/hil-manager.ts` | 4: HilManager, HilRequest, HilResolution, NotificationOptions |
| `main/hil/hil-surface.ts` | 2: HilSurface, HilSurfaceDeps |
| `main/http-bridge.ts` | 1: startHttpBridge |
| `main/http/bookmarks-routes.ts` | 1: handleBookmarkRoutes |
| `main/http/bridge-errors.ts` | 1: sendBridgeError |
| `main/http/bridge-log.ts` | 2: logBridge, redactLogValue |
| `main/http/collaboration-routes.ts` | 2: handleCollaborationRoutes, CollaborationRouteContext |
| `main/http/cortex-routes.ts` | 1: handleCortexRoutes |
| `main/http/decision-routes.ts` | 1: handleDecisionRoutes |
| `main/http/dispatch.ts` | 2: dispatchBridgeRoutes, BridgeDispatchContext |
| `main/http/health-routes.ts` | 2: handleHealthRoutes, HealthRouteContext |
| `main/http/hil-routes.ts` | 1: handleHumanInterventionRoutes |
| `main/http/human-control.ts` | 1: refuseWhileHumanActive |
| `main/http/jev-routes.ts` | 1: handleJevRoutes |
| `main/http/marks-routes.ts` | 1: handleMarkRoutes |
| `main/http/media-routes.ts` | 2: handleMediaRoutes, MediaRouteContext |
| `main/http/nav-routes.ts` | 1: handleNavRoutes |
| `main/http/network-routes.ts` | 2: handleNetworkRoutes, NetworkRouteContext |
| `main/http/primitives-routes.ts` | 1: handlePrimitiveRoutes |
| `main/http/read-routes.ts` | 1: handleReadRoutes |
| `main/http/recording-routes.ts` | 1: handleRecordingRoutes |
| `main/http/request-context.ts` | 2: createRequestContext, BridgeRequestContext |
| `main/http/research-routes.ts` | 1: handleResearchRoutes |
| `main/http/route-table.ts` | 4: dispatchRoute, RouteTableContext, ChassisRouteContext, RouteNotFound |
| `main/http/scripts-routes.ts` | 1: handleScriptRoutes |
| `main/http/server-lifecycle.ts` | 2: logListenError, announceListening |
| `main/http/session-routes.ts` | 1: handleSessionRoutes |
| `main/http/tabs-routes.ts` | 1: handleTabRoutes |
| `main/http/window-routes.ts` | 1: handleWindowRoutes |
| `main/http/workspace-routes.ts` | 1: handleWorkspaceRoutes |
| `main/http/wrap-routes.ts` | 3: handleWrapRoutes, WrapBridge, WrapRouteContext |
| `main/input-actions.ts` | 3: InputActionsController, InputActionsStatus, InputActionsDeps |
| `main/input/human-activity.ts` | 6: shouldCountAsHuman, humanListenerScript, SYNTHETIC_GRACE_MS, HUMAN_CONSOLE_PREFIX, HumanActivityMonitor, HumanActivity |
| `main/input/human-control.ts` | 2: HumanControlSurface, HumanControlDeps |
| `main/input/input-surface.ts` | 2: InputSurface, InputSurfaceDeps |
| `main/ipc/collaboration-ipc.ts` | 2: registerCollaborationIpc, CollaborationIpcDeps |
| `main/ipc/connect-info-ipc.ts` | 2: registerConnectInfoIpc, ConnectInfoDeps |
| `main/ipc/ipc-surface.ts` | 3: createIpcSurface, IpcSurface, IpcSurfaceDeps |
| `main/ipc/media-ipc.ts` | 1: registerMediaIpc |
| `main/ipc/recording-ipc.ts` | 1: registerRecordingIpc |
| `main/ipc/research-ipc.ts` | 2: registerResearchIpc, ResearchIpcDeps |
| `main/ipc/settings-ipc.ts` | 3: registerSettingsIpc, JevPayload, SettingsIpcDeps |
| `main/ipc/web-state-ipc.ts` | 1: registerWebStateIpc |
| `main/ipc/wrap-ipc.ts` | 2: registerWrapIpc, WrapIpcDeps |
| `main/jev/controller.ts` | 3: JevController, JevControllerDeps, JevPolicy |
| `main/jev/engine.ts` | 5: JevEngine, JevSection, JevSession, JevStatus, JevSearchHit |
| `main/jev/policy.ts` | 6: decideFunnel, DEFAULT_FUNNEL_MIN_TOKENS, FunnelBreaker, FunnelReason, FunnelInput, FunnelDecision |
| `main/jev/read-contract.ts` | 5: PageReadRequest, PrecheckPageReadResult, GuardPageReadInput, PageReadRefusal, GuardPageReadResult |
| `main/llm/alternates.ts` | 1: readAlternates |
| `main/llm/llm-surface.ts` | 1: LlmSurface |
| `main/llm/probe-transport.ts` | 3: ProbeTransport, ProbeResponse, ProbeTransportDeps |
| `main/llm/read-surface.ts` | 2: ReadSurface, ReadSurfaceDeps |
| `main/llm/surface-probe.ts` | 2: SurfaceProbe, SurfaceProbeDeps |
| `main/llm/surface-types.ts` | 18: coded, TEXT_ACCEPT, NEGOTIATE_ACCEPT, MARKDOWN_LINK_RE, TEXT_LINK_RE, DEFAULT_READ_CHARS, MAX_READ_CHARS, LlmSurfaceKind, … (18) |
| `main/llm/surface-url.ts` | 4: isPageUrl, kindScope, resolveSurfaceUrl, normalizeUrl |
| `main/marks/format-mark.ts` | 1: formatMark |
| `main/marks/inject-script.ts` | 2: marksInjectorScript, MarksInjectorOptions |

… and 192 more module(s) — grep the full index.

> Capped at 120 modules so it can be loaded into every session; the full index is the source of truth.
