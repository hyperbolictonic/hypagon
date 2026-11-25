/**
 * Opening and closing the research surface, and the launcher's state.
 *
 * Why a module: research is a full-bleed surface — opening it hides the browser view and
 * collapses the sidebar, and closing restores both. That is a mode change with a saved
 * sidebar mode and a launcher dot, so it gets its own object rather than living inside
 * the event handler.
 */
import type { ElectronAPI } from '../../preload/index.js';
import type { ResearchElements } from './elements.js';

type SidebarMode = 'docked' | 'floating' | 'collapsed';

/** When to use: `ResearchChrome` — the nodes it shows, hides and paints. */
export interface ResearchChromeDeps {
  elements: ResearchElements;
  api: ElectronAPI | undefined;
}

/** When to use: `initResearchPanel` — one chrome per panel. */
export class ResearchChrome {
  private readonly deps: ResearchChromeDeps;
  private readonly elements: ResearchElements;
  private visible = false;
  private savedSidebarMode: SidebarMode | null = null;

  constructor(deps: ResearchChromeDeps) {
    this.deps = deps;
    this.elements = deps.elements;
  }

  /** Whether the surface is on screen. */
  get isOpen(): boolean {
    return this.visible;
  }

  /** Take the screen: remember the sidebar, collapse it, hide the browser view. */
  async show(): Promise<void> {
    if (this.visible) return;
    this.visible = true;
    const { api } = this.deps;
    this.savedSidebarMode = (await api?.getSidebarMode?.()) ?? 'floating';
    await api?.setSidebarMode?.('collapsed');
    api?.setViewportVisibility?.(false);
    this.elements.view.classList.remove('hidden');
    this.elements.view.classList.add('flex');
    this.elements.queryInput?.focus();
  }

  /** Give the screen back: show the browser view and restore the sidebar mode. */
  async hide(): Promise<void> {
    if (!this.visible) return;
    this.visible = false;
    const { api } = this.deps;
    this.elements.view.classList.add('hidden');
    this.elements.view.classList.remove('flex');
    api?.setViewportVisibility?.(true);
    if (this.savedSidebarMode) await api?.setSidebarMode?.(this.savedSidebarMode);
  }

  /** The launcher button: open when closed, close when open. */
  async toggle(): Promise<void> {
    if (this.visible) await this.hide();
    else await this.show();
  }

  /** The launcher count badge (hidden at zero). */
  setBadge(count: number): void {
    const badge = this.elements.launcherBadge;
    if (!badge) return;
    if (count > 0) {
      badge.textContent = String(count);
      badge.classList.remove('hidden');
    } else {
      badge.classList.add('hidden');
    }
  }

  /** The launcher dot: idle, running, done (warning when something escalated) or error. */
  setState(state: 'idle' | 'running' | 'done' | 'error', escalated = false): void {
    const dot = this.elements.launcherDot;
    if (!dot) return;
    const tone =
      state === 'idle'
        ? 'bg-base-content/30'
        : state === 'running'
          ? 'bg-accent animate-pulse'
          : state === 'done'
            ? escalated
              ? 'bg-warning'
              : 'bg-success'
            : 'bg-error';
    dot.className = `w-1.5 h-1.5 rounded-full ${tone}`;
  }
}

/**
 * When to use: `initResearchPanel` — the readability control, which zooms the whole
 * dashboard (table, terminal, stats) and remembers the choice.
 */
export function wireFontScale(elements: ResearchElements): void {
  let fontScale = Number(localStorage.getItem('research.fontScale') ?? '1');
  if (!Number.isFinite(fontScale)) fontScale = 1;

  const apply = (): void => {
    elements.view.style.setProperty('zoom', String(fontScale));
    if (elements.fontLabel) elements.fontLabel.textContent = `${Math.round(fontScale * 100)}%`;
    try {
      localStorage.setItem('research.fontScale', String(fontScale));
    } catch {
      /* storage unavailable */
    }
  };

  elements.fontDec?.addEventListener('click', () => {
    fontScale = Math.max(0.8, Math.round((fontScale - 0.1) * 100) / 100);
    apply();
  });
  elements.fontInc?.addEventListener('click', () => {
    fontScale = Math.min(1.8, Math.round((fontScale + 0.1) * 100) / 100);
    apply();
  });
  apply();
}
