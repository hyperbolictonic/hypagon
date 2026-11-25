import type { ZoomState } from './zoom.js';
import type { ViewportState } from './viewport.js';

/** When to use: the HUD status badge and the tray menu status line. */
export type AgentStatus = 'IDLE' | 'TRAVERSING' | 'SIMULATING_INPUT' | 'HARVESTING' | 'ERROR' | 'AWAITING_INPUT' | 'HUMAN_INPUT';

/** When to use: the ghost-cursor overlay and the input trace — the last observed pointer position. */
export interface CursorPosition {
  x: number;
  y: number;
  timestamp: number;
}

/** When to use: the HUD feed and the action ledger — one observed browser action. */
export interface TelemetryEvent {
  type: 'mouse_move' | 'click' | 'keystroke' | 'scroll' | 'navigation' | 'harvest';
  x?: number;
  y?: number;
  key?: string;
  url?: string;
  durationMs?: number;
  timestamp: number;
  details?: string;
}

/** When to use: the CONSTRUCT panel and `harvest` — the page as markdown plus its coverage stats. */
export interface HarvestedConstruct {
  url: string;
  title: string;
  timestamp: string;
  rawHtmlLength: number;
  markdownLength: number;
  estimatedTokens: number;
  /** Characters of page text inside the extracted region (same unit as pageChars). */
  extractedChars?: number;
  /** Characters of text in the page body — the denominator for coverage. */
  pageChars?: number;
  /** Which extraction path produced the body. */
  reader?: 'readability' | 'full-body';
  /** Open shadow roots inlined during serialisation. */
  shadowRoots?: number;
  content: string;
}

/** When to use: the tab strip and `list_tabs`. */
export interface TabSummary {
  id: string;
  title: string;
  url: string;
  isLoading: boolean;
  isActive: boolean;
}

/** When to use: the state broadcast that paints the deck — url, agent status, tabs, zoom and viewport. */
export interface ChassisState {
  currentUrl: string;
  pageTitle: string;
  isLoading: boolean;
  agentStatus: AgentStatus;
  activeAction: string;
  cursor: { x: number; y: number };
  /** Whether the active tab can step back / forward, so the toolbar can disable the buttons. */
  canGoBack?: boolean;
  canGoForward?: boolean;
  activeTabId?: string;
  tabs?: TabSummary[];
  /** Page zoom policy and current CSS/physical proportions. */
  zoom?: ZoomState;
  /** Responsive device emulation for the active tab. */
  viewport?: ViewportState;
  stats: {
    totalInteractions: number;
    tokensHarvested: number;
    avgLatencyMs: number;
    uptimeSeconds: number;
  };
}
