/**
 * Every HUD element handle, exported once.
 *
 * The state painter, the stats readout and the IPC bootstrap all read these, so they live here
 * rather than at the top of the entry point.
 */

/** When to use: the urlForm HUD control. */
export const urlForm = document.getElementById('url-form') as HTMLFormElement;

/** When to use: the urlInput HUD control. */
export const urlInput = document.getElementById('url-input') as HTMLInputElement;

/** When to use: the viewportUrlDisplay HUD control. */
export const viewportUrlDisplay = document.getElementById('viewport-url-display') as HTMLElement;

/** When to use: the viewportLoadingSpinner HUD control. */
export const viewportLoadingSpinner = document.getElementById('viewport-loading-spinner') as HTMLElement;

/** When to use: the agentStatusBadge HUD control. */
export const agentStatusBadge = document.getElementById('agent-status-badge') as HTMLElement;

/** When to use: the activeActionText HUD control. */
export const activeActionText = document.getElementById('active-action-text') as HTMLElement;

/** When to use: the copyConstructBtn HUD control. */
export const copyConstructBtn = document.getElementById('copy-construct-btn') as HTMLButtonElement;

/** When to use: the chassisVersionBadge HUD control. */
export const chassisVersionBadge = document.getElementById('chassis-version');

/** When to use: the aboutVersion HUD control. */
export const aboutVersion = document.getElementById('about-version');

/** When to use: the statVelocity HUD control. */
export const statVelocity = document.getElementById('stat-velocity') as HTMLElement;

/** When to use: the statTokens HUD control. */
export const statTokens = document.getElementById('stat-tokens') as HTMLElement;

/** When to use: the statInteractions HUD control. */
export const statInteractions = document.getElementById('stat-interactions') as HTMLElement;

/** When to use: the tabBtnTelemetry HUD control. */
export const tabBtnTelemetry = document.getElementById('tab-btn-telemetry') as HTMLButtonElement;

/** When to use: the tabBtnConstruct HUD control. */
export const tabBtnConstruct = document.getElementById('tab-btn-construct') as HTMLButtonElement;

/** When to use: the tabBtnLogs HUD control. */
export const tabBtnLogs = document.getElementById('tab-btn-logs') as HTMLButtonElement;

/** When to use: the tabContentTelemetry HUD control. */
export const tabContentTelemetry = document.getElementById('tab-content-telemetry') as HTMLElement;

/** When to use: the tabContentConstruct HUD control. */
export const tabContentConstruct = document.getElementById('tab-content-construct') as HTMLElement;

/** When to use: the tabContentLogs HUD control. */
export const tabContentLogs = document.getElementById('tab-content-logs') as HTMLElement;
