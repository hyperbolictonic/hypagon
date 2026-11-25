# Component Index — digest

<!-- generated: run `node scripts/anti-slop/generate-component-index.mjs` to regenerate -->

219 modules, 783 exports under `src/`. Full "When to use" descriptions live in [docs/COMPONENT_INDEX.md](COMPONENT_INDEX.md) — grep it by concept before creating a component, hook, or utility (see `reuse-before-create`).

| Module | Exports |
|---|---|
| `main/brand-icon.ts` | 2: brandIconPath, brandIcon |
| `main/browser-chassis.ts` | 1: BrowserChassis |
| `main/browser/frame-eval.ts` | 3: evaluateInFrames, FrameEvalOptions, FrameEvalResult |
| `main/browser/frame-marks.ts` | 3: clearFrameMarks, registerFrameMarks, resolveFrameMark |
| `main/browser/frame-tree.ts` | 3: discoverFrames, FrameHandle, FrameContext |
| `main/browser/frames-inventory.ts` | 3: inventoryFrames, FrameInventoryResult, FramesInventoryDeps |
| `main/browser/frames.ts` | 3: listFrames, FrameRect, FrameInfo |
| `main/collaboration/overlay.ts` | 8: collaborationNoteDrawerScript, collaborationPickerScript, collaborationOverlayScript, COLLABORATION_NOTE_PREFIX, COLLABORATION_CLASS_PREFIX, COLLABORATION_RESOLVE_PREFIX, COLLABORATION_EXIT_PREFIX, CollaborationPickerOptions |
| `main/collaboration/service.ts` | 1: CollaborationService |
| `main/collaboration/store.ts` | 2: CollaborationStore, CreateThreadInput |
| `main/cortex/chunker.ts` | 3: chunkMarkdown, extractDomain, PageChunk |
| `main/cortex/cortex-db.ts` | 10: cortex, CortexDB, PageHistoryRow, BookmarkRow, RecallResult, HistoryItem, UrlSuggestion, BookmarkItem, … (10) |
| `main/cortex/embedder.ts` | 9: registerEmbeddingProvider, listEmbeddingProviders, setEmbeddingProvider, getEmbeddingProvider, embedText, generateEmbedding, DEFAULT_PROVIDER_ID, EMBEDDING_DIM, … (9) |
| `main/crawl/crawler.ts` | 9: normalizeUrl, matchesAnyPattern, linksFromMarkdown, Crawler, HumanAssistInfo, CrawlOptions, CrawlPage, CrawlOutcome, … (9) |
| `main/data-paths.ts` | 3: dataRoot, dataPath, writeJsonAtomic |
| `main/decide/decision-client.ts` | 13: resolveDecisionConfig, readStoredDecisionConfig, saveDecisionConfig, decisionStatus, onDecision, emitDecisionEvent, runDecision, DecisionProtocol, … (13) |
| `main/decide/decision-guard.ts` | 5: validateAnswers, decideGuarded, DecisionGuard, GuardRejection, GuardedDecision |
| `main/decide/sensitive-gate.ts` | 3: detectSensitiveGate, SensitiveGate, GateDetection |
| `main/deck/collab.ts` | 2: CollabController, CollabControllerDeps |
| `main/deck/controller.ts` | 3: DeckController, DeckMode, DeckControllerDeps |
| `main/diagnostics/main-log.ts` | 2: mainLogFile, logMainEvent |
| `main/downloads/download-manager.ts` | 2: DownloadManager, DownloadRecord |
| `main/drive/driver.ts` | 5: driveTask, DriveStatus, DriveStep, DriveResult, DriveOptions |
| `main/harvest/screenshots.ts` | 3: ScreenshotStore, ScreenshotStoreDeps, ScreenshotPayload |
| `main/harvester/dom-serializer.ts` | 3: captureComposedDom, COMPOSE_DOM_SCRIPT, ComposedDom |
| `main/harvester/markdown.ts` | 2: ConstructHarvester, HarvestStats |
| `main/hil/hil-manager.ts` | 4: HilManager, HilRequest, HilResolution, NotificationOptions |
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
| `main/jev/controller.ts` | 3: JevController, JevControllerDeps, JevPolicy |
| `main/jev/engine.ts` | 5: JevEngine, JevSection, JevSession, JevStatus, JevSearchHit |
| `main/jev/policy.ts` | 6: decideFunnel, DEFAULT_FUNNEL_MIN_TOKENS, FunnelBreaker, FunnelReason, FunnelInput, FunnelDecision |
| `main/jev/read-contract.ts` | 5: PageReadRequest, PrecheckPageReadResult, GuardPageReadInput, PageReadRefusal, GuardPageReadResult |
| `main/llm/llm-surface.ts` | 10: LlmSurface, LlmSurfaceKind, LlmSurfaceScope, LlmSurfaceNext, LlmSurfaceEndpoint, LlmSurfaceLink, LlmSurfaceReport, LlmFetchResult, … (10) |
| `main/marks/format-mark.ts` | 1: formatMark |
| `main/marks/marks-overlay.ts` | 2: MarksOverlay, MarkItem |
| `main/media/auth.ts` | 1: needsLogin |
| `main/media/binaries.ts` | 8: bundledYtDlpPath, writableYtDlpPath, readYtDlpVersion, ensureYtDlp, isMediaBinary, MediaBinarySource, MediaBinary, MediaBinaryError |
| `main/media/cookie-format.ts` | 1: toNetscape |
| `main/media/cookies.ts` | 2: writeCookieFile, CookieFile |
| `main/media/exec.ts` | 2: runYtDlpProcess, CommandResult |
| `main/media/ffmpeg.ts` | 9: platformKey, managedFfmpegDir, ffmpegFileName, managedFfmpegPath, parseFfmpegVersion, detectFfmpeg, installManagedFfmpeg, FfmpegSource, … (9) |
| `main/media/jobs.ts` | 12: buildFormatSelector, buildDownloadArgs, parseProgressLine, MediaJobs, MediaKind, MediaQuality, MediaJobState, MediaJobFile, … (12) |
| `main/media/platform.ts` | 8: mediaPlatformKey, ytDlpFileName, ytdlpRuntimeOptions, compareYtDlpVersions, ytDlpReleaseAsset, parseChecksum, YtDlpRuntimeKind, YtDlpRuntime |
| `main/media/service.ts` | 10: MediaService, MediaRuntimeStatus, MediaStatus, MediaInfo, MediaInfoResult, MediaServiceError, MediaTranscriptResult, MediaPreviewImage, … (10) |
| `main/media/settings.ts` | 3: normalizeMediaSettings, DEFAULT_MEDIA_SETTINGS, MediaSettingsStore |
| `main/media/transcript.ts` | 5: parseVtt, transcriptDocument, fetchArtifacts, SubtitleArtifacts, ArtifactResult |
| `main/media/updater.ts` | 3: jitter, MediaUpdater, MediaUpdaterOptions |
| `main/menu/context-menu.ts` | 2: attachContextMenu, ContextMenuOptions |
| `main/metrics.ts` | 4: bump, snapshot, summary, resetMetrics |
| `main/migrate-user-data.ts` | 2: migrateLegacyUserData, UserDataMigration |
| `main/navigation-error.ts` | 2: classifyNavigationFailure, NavigationFailure |
| `main/network/impersonate.ts` | 7: resolveCurlBinaryPath, hostPlatformHeaders, impersonateAvailable, isChallenge, fetchStatic, StaticFetchResult, StaticFetchOutcome |
| `main/network/network-interceptor.ts` | 5: NetworkInterceptor, CapturedNetworkRequest, RealtimeStream, StreamMessage, NetworkFilter |
| `main/prerender/prerender-engine.ts` | 3: PrerenderEngine, PrerenderItem, PrerenderOptions |
| `main/primitives/control-facts.ts` | 5: controlFactsExpression, parseControlFacts, ControlAction, ControlFacts, ControlFactsOptions |
| `main/primitives/dom-targeting.ts` | 10: elementExpr, targetBoxScript, fieldFactsScript, focusControlScript, diagnosticsScript, inputProbeInstallScript, inputProbeReadScript, DEEP_DOM_HELPERS, … (10) |
| `main/primitives/primitives.ts` | 14: DEFAULT_MARKDOWN_BUDGET, PrimitiveError, Primitives, PrimitivesHost, PrimitiveErrorCode, WaitCondition, ConditionResult, WaitResult, … (14) |
| `main/primitives/text-target.ts` | 6: textTargetExpression, parseTextTargets, resolveTextTargets, TextTargetOptions, TextTargetMatch, TextTargetResult |
| `main/recipes/compile.ts` | 3: compileDriveSteps, DriveStepLike, CompileOptions |
| `main/recipes/recipe-store.ts` | 11: loadRecipes, originOf, recipesFor, saveRecipe, deleteRecipe, recordResult, retireRecipe, RecipeStep, … (11) |
| `main/recipes/replay.ts` | 4: replayRecipe, RecipeRunner, ReplayStepResult, ReplayResult |
| `main/recording/recording-service.ts` | 16: onRecordingStatus, setRecordingWindow, loadRecordingConfig, getRecordingConfig, saveRecordingConfig, getRecordingStatus, pickRecordingDir, startRecording, … (16) |
| `main/remote/cloudflared.ts` | 1: findCloudflared |
| `main/remote/ipc.ts` | 1: registerRemoteIpc |
| `main/remote/oauth-client.ts` | 5: oauthClientFile, readOAuthClient, createOAuthClient, ensureOAuthClient, OAuthClientCredentials |
| `main/remote/service.ts` | 2: RemoteService, RemoteServiceOptions |
| `main/remote/settings.ts` | 3: loadRemoteSettings, saveRemoteSettings, RemoteSettings |
| `main/remote/token.ts` | 3: remoteTokenFile, createRemoteToken, readRemoteToken |
| `main/research/anchor-store.ts` | 2: AnchorStore, StoredAnchor |
| `main/research/anchors.ts` | 6: relocateCitation, relocateCitations, anchorHighlights, CitationAnchor, CitationCandidate, CitationRelocation |
| `main/research/citation-controller.ts` | 4: CitationController, HumanHandoffResult, CitationControllerDeps, RevalidationSummary |
| `main/research/crawl-orchestrator.ts` | 4: CrawlOrchestrator, CrawlOrchestratorDeps, RenderCrawlOptions, RenderCrawlResult |
| `main/research/detached-view.ts` | 4: DetachedViewController, DetachedLoadOptions, DetachedLoadResult, DetachedViewDeps |
| `main/research/researcher.ts` | 6: extractHighlights, Researcher, ResearchOptions, ResearchSource, ResearchOutcome, ResearcherDeps |
| `main/research/session-controller.ts` | 3: researchError, ResearchSessionController, ResearchSessionDeps |
| `main/research/settings.ts` | 7: normalizeResearchSettings, looksLikeChallenge, RESEARCH_ENGINES, DEFAULT_RESEARCH_SETTINGS, ResearchSettingsStore, ResearchSettings, ResearchSettingsResult |
| `main/scripts/script-vault.ts` | 2: ScriptVault, SavedScriptMeta |
| `main/search/search-engine.ts` | 7: KNOWN_ENGINES, DEFAULT_ENGINE_CHAIN, SearchHub, SearchResult, SearchAttempt, SearchOutcome, SearchHubDeps |
| `main/security/capability-token.ts` | 3: tokenPathIn, createCapabilityToken, readCapabilityToken |
| `main/session/session-vault.ts` | 2: SessionVault, SessionSnapshot |
| `main/settings/experimental.ts` | 1: ExperimentalSettingsStore |
| `main/settings/jev.ts` | 4: DEFAULT_JEV_SETTINGS, JevSettingsStore, JevMode, JevSettings |
| `main/shadow-walk/ax-controls.ts` | 6: findSealedControls, SealedRateLimitError, SealedRect, SealedControl, SealedFindOptions, SealedFindResult |
| `main/shadow-walk/component-signature.ts` | 4: componentSignatureOf, normalizeSurface, COMPONENT_SIGNATURE_HELPERS, ComponentSurface |
| `main/shadow-walk/force-open.ts` | 5: isForceOpenArmed, syncForceOpen, detectForceOpen, ForceOpenSyncResult, ForceOpenDetection |
| `main/shadow-walk/part-highlight-css.ts` | 2: buildPartHighlightCss, PartHost |
| `main/shadow-walk/part-highlight.ts` | 3: injectPartHighlight, removePartHighlight, withPartHighlight |
| `main/shadow-walk/sealed-targets.ts` | 3: clearSealedTokens, issueSealedToken, resolveSealedToken |
| `main/shadow-walk/settings.ts` | 14: normalizeShadowWalkSettings, loadShadowWalkSettings, saveShadowWalkSettings, shadowWalkStatus, shadowWalkRefusal, SHADOW_WALK_SETTINGS_FILE, DEFAULT_SHADOW_WALK_SETTINGS, shadowWalkSettings, … (14) |
| `main/shadow-walk/tab-walk.ts` | 4: runTabWalk, TabWalkOptions, TabWalkStep, TabWalkResult |

… and 93 more module(s) — grep the full index.

> Capped at 120 modules so it can be loaded into every session; the full index is the source of truth.
