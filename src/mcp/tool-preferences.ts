/**
 * The tool surface the human configured in Settings, read from the bridge.
 *
 * Order, disabled set, per-tool and per-action instruction overrides, and the JEV gate all come
 * from /tools/config. The cache is deliberately short (2s): a settings change should reach the
 * next tool call without a client restart.
 */
import { collectActionInstructions } from '../shared/tool-settings.js';
import { callBridge } from './browser-surface.js';

/** When to use: the tool order, disabled set, instruction overrides and JEV gate from /tools/config. */
export interface ToolPreferences {
  order: string[];
  disabled: string[];
  instructions: Record<string, string>;
  actionInstructions: Record<string, Record<string, string>>;
  /** JEV is enabled AND a decision model is configured (bridge-computed). */
  jevAvailable: boolean;
  /** 'enforce' refuses unscoped page dumps; 'prefer' only steers. */
  jevMode: 'prefer' | 'enforce';
}

let cachedToolPreferences: { value: ToolPreferences; at: number } | null = null;

/** When to use: once at boot — the bridge owns the human-edited tool settings. */
export async function loadToolPreferences(): Promise<ToolPreferences> {
  if (cachedToolPreferences && Date.now() - cachedToolPreferences.at < 2000) {
    return cachedToolPreferences.value;
  }
  try {
    const data = await callBridge('/tools/config', 'GET');
    const order = Array.isArray(data?.order)
      ? data.order.filter((name: unknown): name is string => typeof name === 'string')
      : [];
    const disabled = Array.isArray(data?.disabled)
      ? data.disabled.filter((name: unknown): name is string => typeof name === 'string')
      : [];
    const instructions: Record<string, string> = {};
    if (data?.instructions && typeof data.instructions === 'object' && !Array.isArray(data.instructions)) {
      for (const [name, text] of Object.entries(data.instructions)) {
        if (typeof text === 'string' && text.trim()) instructions[name] = text.trim();
      }
    }
    const actionInstructions = collectActionInstructions(data?.actionInstructions, (_tool, _action, text) => text.trim());
    const value = {
      order,
      disabled,
      instructions,
      actionInstructions,
      jevAvailable: data?.jev?.available === true,
      jevMode: (data?.jev?.mode === 'enforce' ? 'enforce' : 'prefer') as 'prefer' | 'enforce',
    };
    cachedToolPreferences = { value, at: Date.now() };
    return value;
  } catch {
    return { order: [], disabled: [], instructions: {}, actionInstructions: {}, jevAvailable: false, jevMode: 'prefer' };
  }
}

/** When to use: every tool call — one JSON request to the local bridge with a hard timeout. */
