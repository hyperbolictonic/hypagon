import { contextBridge, ipcRenderer } from 'electron';
import type { ChassisState, HarvestedConstruct, TelemetryEvent, TabSummary } from '../shared/types.js';
import type { PopupAnchor, PopupMenuItem, SidebarSurfaceState } from '../shared/menu.js';
import type { ResearchEvent } from '../shared/research-events.js';
import type { ElectronAPI } from './api-types.js';

export type { ElectronAPI } from './api-types.js';

const api: ElectronAPI = {
  getState: () => ipcRenderer.invoke('chassis:get-state'),
  getLatestConstruct: () => ipcRenderer.invoke('chassis:get-latest-construct'),
  getLogs: () => ipcRenderer.invoke('chassis:get-logs'),
  resumeAgent: async () => {
    try {
      return { ok: true, ...(await ipcRenderer.invoke('chassis:resume-human')) };
    } catch (error: any) {
      return { ok: false, error: error?.message || String(error) };
    }
  },
  takeOverAgent: async () => {
    try {
      return { ok: true, ...(await ipcRenderer.invoke('chassis:take-over-human')) };
    } catch (error: any) {
      return { ok: false, error: error?.message || String(error) };
    }
  },
  getHumanStatus: () => ipcRenderer.invoke('chassis:get-human-status'),
  navigate: (url: string) => ipcRenderer.invoke('chassis:navigate', url),
  goBack: () => ipcRenderer.invoke('chassis:go-back'),
  goForward: () => ipcRenderer.invoke('chassis:go-forward'),
  reload: () => ipcRenderer.invoke('chassis:reload'),
  getNavState: () => ipcRenderer.invoke('chassis:get-nav-state'),
  getInputProfile: () => ipcRenderer.invoke('input:get-profile'),
  saveInputProfile: (patch) => ipcRenderer.invoke('input:save-profile', patch),
  harvest: () => ipcRenderer.invoke('chassis:harvest'),
  setViewportVisibility: (visible: boolean) => ipcRenderer.send('chassis:set-viewport-visibility', visible),
  getSidebarMode: () => ipcRenderer.invoke('chassis:get-sidebar-mode'),
  setSidebarMode: (mode) => ipcRenderer.send('chassis:set-sidebar-mode', mode),
  toggleSidebarMode: () => ipcRenderer.send('chassis:toggle-sidebar-mode'),
  onSidebarMode: (callback) => {
    const handler = (_: any, mode: 'docked' | 'floating' | 'collapsed') => callback(mode);
    ipcRenderer.on('chassis:sidebar-mode', handler);
    return () => ipcRenderer.removeListener('chassis:sidebar-mode', handler);
  },
  setSidebarOrbEdge: (edge: 'left' | 'right') => ipcRenderer.send('chassis:set-sidebar-orb-edge', edge),
  orbitDragMove: (dx, dy) => ipcRenderer.send('chassis:orbit-drag', { dx, dy }),
  orbitDragEnd: () => ipcRenderer.send('chassis:orbit-drag-end'),
  setCollabMode: (open: boolean) => ipcRenderer.send('chassis:set-collab-mode', Boolean(open)),
  collabNavigate: (delta: number) => ipcRenderer.send('chassis:collab-navigate', delta),
  collabToggleList: (anchor?: PopupAnchor) => ipcRenderer.send('chassis:collab-toggle-list', anchor),
  escapeCollabUi: () => ipcRenderer.send('chassis:collab-escape'),
  getSidebarState: () => ipcRenderer.invoke('chassis:get-sidebar-state'),
  getSidebarBounds: () => ipcRenderer.invoke('chassis:get-sidebar-bounds'),
  onSidebarState: (callback) => {
    const handler = (_: any, state: SidebarSurfaceState) => callback(state);
    ipcRenderer.on('chassis:sidebar-state', handler);
    return () => ipcRenderer.removeListener('chassis:sidebar-state', handler);
  },

  getTabs: () => ipcRenderer.invoke('chassis:get-tabs'),
  createTab: (url?: string) => ipcRenderer.invoke('chassis:create-tab', url),
  switchTab: (tabId: string) => ipcRenderer.invoke('chassis:switch-tab', tabId),
  closeTab: (tabId?: string) => ipcRenderer.invoke('chassis:close-tab', tabId),
  getZoom: () => ipcRenderer.invoke('chassis:zoom:get'),
  setZoom: (input) => ipcRenderer.invoke('chassis:zoom:set', input || {}),
  setZoomMode: (mode) => ipcRenderer.invoke('chassis:zoom:mode', mode),
  getViewport: () => ipcRenderer.invoke('chassis:viewport:get'),
  setViewport: (input) => ipcRenderer.invoke('chassis:viewport:set', input || {}),
  resetViewport: () => ipcRenderer.invoke('chassis:viewport:reset'),
  saveDeviceProfile: (input) => ipcRenderer.invoke('viewport:profile:save', input),
  deleteDeviceProfile: (id) => ipcRenderer.invoke('viewport:profile:delete', id),
  openDevTools: () => ipcRenderer.invoke('chassis:devtools:open'),
  hudHeartbeat: () => ipcRenderer.send('chassis:hud-heartbeat'),

  recallMemory: (query: string, options?: any) => ipcRenderer.invoke('cortex:recall', query, options),
  getHistory: (options?: any) => ipcRenderer.invoke('cortex:get-history', options),
  clearHistory: (olderThan?: string) => ipcRenderer.invoke('cortex:clear-history', olderThan),
  suggestUrls: (query: string, options?: any) => ipcRenderer.invoke('cortex:suggest-urls', query, options),
  addBookmark: (bookmark: any) => ipcRenderer.invoke('cortex:add-bookmark', bookmark),
  listBookmarks: (options?: any) => ipcRenderer.invoke('cortex:list-bookmarks', options),
  deleteBookmark: (urlOrId: string) => ipcRenderer.invoke('cortex:delete-bookmark', urlOrId),
  isBookmarked: (url: string) => ipcRenderer.invoke('cortex:is-bookmarked', url),

  getWebState: () => ipcRenderer.invoke('chassis:web-state'),
  getExperimentalSettings: () => ipcRenderer.invoke('settings:get-experimental'),
  saveExperimentalSettings: (patch: any) => ipcRenderer.invoke('settings:save-experimental', patch),
  onExperimentalSettings: (callback) => {
    const handler = (_: any, settings: any) => callback(settings);
    ipcRenderer.on('experimental:settings', handler);
    return () => ipcRenderer.removeListener('experimental:settings', handler);
  },
  getJevSettings: () => ipcRenderer.invoke('settings:get-jev'),
  saveJevSettings: (patch: { power?: boolean; mode?: 'prefer' | 'enforce' }) => ipcRenderer.invoke('settings:save-jev', patch),
  onJevSettings: (callback) => {
    const handler = (_: any, settings: any) => callback(settings);
    ipcRenderer.on('jev:settings', handler);
    return () => ipcRenderer.removeListener('jev:settings', handler);
  },
  getDecisionSettings: () => ipcRenderer.invoke('settings:get-decision'),
  saveDecisionSettings: (config: any) => ipcRenderer.invoke('settings:save-decision', config),
  testDecisionModel: () => ipcRenderer.invoke('settings:test-decision'),
  getDecisions: () => ipcRenderer.invoke('chassis:get-decisions'),
  copyToClipboard: (text: string) => ipcRenderer.invoke('app:copy-text', text),
  getUpdateStatus: () => ipcRenderer.invoke('app:update-status'),
  checkForUpdates: () => ipcRenderer.invoke('app:update-check'),
  installUpdate: () => ipcRenderer.invoke('app:update-install'),

  onUpdateStatus: (callback) => {
    const handler = (_: any, state: any) => callback(state);
    ipcRenderer.on('app:update-status', handler);
    return () => ipcRenderer.removeListener('app:update-status', handler);
  },

  onDecision: (callback) => {
    const handler = (_: any, event: any) => callback(event);
    ipcRenderer.on('chassis:decision', handler);
    return () => ipcRenderer.removeListener('chassis:decision', handler);
  },

  onDecisionStatus: (callback) => {
    const handler = (_: any, status: any) => callback(status);
    ipcRenderer.on('chassis:decision-status', handler);
    return () => ipcRenderer.removeListener('chassis:decision-status', handler);
  },

  onTabsUpdated: (callback) => {
    const handler = (_: any, tabs: TabSummary[]) => callback(tabs);
    ipcRenderer.on('chassis:tabs-updated', handler);
    return () => ipcRenderer.removeListener('chassis:tabs-updated', handler);
  },

  onStateUpdated: (callback) => {
    const handler = (_: any, state: ChassisState) => callback(state);
    ipcRenderer.on('chassis:state-updated', handler);
    return () => ipcRenderer.removeListener('chassis:state-updated', handler);
  },

  onTelemetry: (callback) => {
    const handler = (_: any, event: TelemetryEvent) => callback(event);
    ipcRenderer.on('chassis:telemetry', handler);
    return () => ipcRenderer.removeListener('chassis:telemetry', handler);
  },

  researchRun: (opts) => ipcRenderer.invoke('research:run', opts),

  onResearchEvent: (callback) => {
    const handler = (_: any, event: ResearchEvent) => callback(event);
    ipcRenderer.on('research:event', handler);
    return () => ipcRenderer.removeListener('research:event', handler);
  },

  onConstructHarvested: (callback) => {
    const handler = (_: any, construct: HarvestedConstruct) => callback(construct);
    ipcRenderer.on('chassis:construct-harvested', handler);
    return () => ipcRenderer.removeListener('chassis:construct-harvested', handler);
  },

  onLog: (callback) => {
    const handler = (_: any, log: any) => callback(log);
    ipcRenderer.on('chassis:log', handler);
    return () => ipcRenderer.removeListener('chassis:log', handler);
  },

  resolveHil: (id?: string, notes?: string) => ipcRenderer.invoke('hil:resolve', { id, notes }),
  cancelHil: (id?: string) => ipcRenderer.invoke('hil:cancel', { id }),
  getActiveHil: () => ipcRenderer.invoke('hil:get-active'),

  reloadHil: () => ipcRenderer.invoke('hil:reload'),

  relocateCitation: (opts) => ipcRenderer.invoke('research:relocate', opts),

  revalidateCitations: (opts) => ipcRenderer.invoke('research:revalidate', opts),

  onHilRequested: (callback) => {
    const handler = (_: any, req: any) => callback(req);
    ipcRenderer.on('hil:requested', handler);
    return () => ipcRenderer.removeListener('hil:requested', handler);
  },

  onHilCleared: (callback) => {
    const handler = () => callback();
    ipcRenderer.on('hil:cleared', handler);
    return () => ipcRenderer.removeListener('hil:cleared', handler);
  },

  getRecordingConfig: () => ipcRenderer.invoke('recording:config:get'),
  getMediaSettings: () => ipcRenderer.invoke('media:settings:get'),
  saveMediaSettings: (patch) => ipcRenderer.invoke('media:settings:save', patch),
  checkMediaUpdate: () => ipcRenderer.invoke('media:update:check'),
  pickMediaDir: () => ipcRenderer.invoke('media:pick-dir'),
  pickFfmpegPath: () => ipcRenderer.invoke('media:pick-ffmpeg'),
  getFfmpegStatus: () => ipcRenderer.invoke('media:ffmpeg:status'),
  installFfmpeg: () => ipcRenderer.invoke('media:ffmpeg:install'),
  getConnectInfo: () => ipcRenderer.invoke('app:connect-info'),
  getToolManager: () => ipcRenderer.invoke('tools:get'),
  saveToolManager: (settings) => ipcRenderer.invoke('tools:save', settings),
  resetToolManager: () => ipcRenderer.invoke('tools:reset'),
  listCollaborationThreads: (filter?: any) => ipcRenderer.invoke('collaboration:list', filter),
  startCollaborationPicker: () => ipcRenderer.invoke('collaboration:start-picker'),
  getMenuPopupItems: () => ipcRenderer.invoke('menu-popup:items'),
  onMenuPopupShow: (callback) => {
    const handler = (_: any, items: PopupMenuItem[]) => callback(Array.isArray(items) ? items : []);
    ipcRenderer.on('menu-popup:show', handler);
    return () => ipcRenderer.removeListener('menu-popup:show', handler);
  },
  menuPopupSelect: (id: string, action?: string) => ipcRenderer.send('menu-popup:select', id, action),
  menuPopupClose: () => ipcRenderer.send('menu-popup:close'),
  onCollaborationUpdated: (callback) => {
    const handler = () => callback();
    ipcRenderer.on('collaboration:updated', handler);
    return () => ipcRenderer.removeListener('collaboration:updated', handler);
  },
  getRemoteInfo: () => ipcRenderer.invoke('remote:info'),
  setRemoteEnabled: (enabled: boolean) => ipcRenderer.invoke('remote:set-enabled', enabled),
  rotateRemoteToken: () => ipcRenderer.invoke('remote:rotate-token'),
  disconnectRemoteSessions: () => ipcRenderer.invoke('remote:disconnect-sessions'),
  setRemoteTunnelEnabled: (enabled: boolean) => ipcRenderer.invoke('remote:set-tunnel-enabled', enabled),
  setRemoteTunnelConfig: (hostname: string, token?: string) => ipcRenderer.invoke('remote:set-tunnel-config', hostname, token),
  setCloudflaredMode: (mode: 'manual' | 'automatic') => ipcRenderer.invoke('remote:set-cloudflared-mode', mode),
  checkCloudflared: () => ipcRenderer.invoke('remote:check-cloudflared'),
  installCloudflared: () => ipcRenderer.invoke('remote:install-cloudflared'),
  setRemoteAuthMode: (mode: 'bearer' | 'oauth') => ipcRenderer.invoke('remote:set-auth-mode', mode),
  rotateOAuthClient: () => ipcRenderer.invoke('remote:rotate-oauth-client'),
  saveRecordingConfig: (config: any) => ipcRenderer.invoke('recording:config:save', config),
  pickRecordingDir: () => ipcRenderer.invoke('recording:pick-dir'),
  startRecording: (name?: string) => ipcRenderer.invoke('recording:start', name),
  stopRecording: () => ipcRenderer.invoke('recording:stop'),
  getRecordingStatus: () => ipcRenderer.invoke('recording:status'),
  listRecordings: () => ipcRenderer.invoke('recording:list'),
  saveRecording: (buffer: ArrayBuffer, frames: number) => ipcRenderer.invoke('recording:save', buffer, frames),
  recordingReady: () => ipcRenderer.send('recording:ready'),
  recordingFailed: (message: string) => ipcRenderer.send('recording:failed', message),

  onRecordingBegin: (callback) => {
    const handler = (_: any, payload: any) => callback(payload);
    ipcRenderer.on('recording:begin', handler);
    return () => ipcRenderer.removeListener('recording:begin', handler);
  },

  onRecordingStop: (callback) => {
    const handler = () => callback();
    ipcRenderer.on('recording:stop', handler);
    return () => ipcRenderer.removeListener('recording:stop', handler);
  },

  onRecordingStatus: (callback) => {
    const handler = (_: any, state: any) => callback(state);
    ipcRenderer.on('recording:status', handler);
    return () => ipcRenderer.removeListener('recording:status', handler);
  },

  listWrapSecrets: () => ipcRenderer.invoke('wrap:secrets:list'),
  setWrapSecret: (input: any) => ipcRenderer.invoke('wrap:secrets:set', input),
  deleteWrapSecret: (name: string) => ipcRenderer.invoke('wrap:secrets:delete', name),
  listWrapAudit: (limit?: number) => ipcRenderer.invoke('wrap:audit:list', limit),
  listWrapWrappers: () => ipcRenderer.invoke('wrap:wrappers:list'),
  saveWrapWrapper: (wrapper: any) => ipcRenderer.invoke('wrap:wrappers:save', wrapper),
  deleteWrapWrapper: (id: string) => ipcRenderer.invoke('wrap:wrappers:delete', id),
  getResearchSettings: () => ipcRenderer.invoke('research:settings:get'),
  saveResearchSettings: (settings: any) => ipcRenderer.invoke('research:settings:save', settings),
  getShadowWalkSettings: () => ipcRenderer.invoke('shadowwalk:settings:get'),
  saveShadowWalkSettings: (settings: any) => ipcRenderer.invoke('shadowwalk:settings:save', settings),
  resetShadowWalkSettings: () => ipcRenderer.invoke('shadowwalk:settings:reset'),
  detectShadowPatch: () => ipcRenderer.invoke('shadowwalk:detect'),
  resetResearchSession: () => ipcRenderer.invoke('research:session:reset'),
};

contextBridge.exposeInMainWorld('electronAPI', api);
