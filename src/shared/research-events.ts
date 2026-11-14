/**
 * Research run events.
 *
 * These are consumed twice: by the UI (live timeline) and by the calling agent, because a tier
 * change is observable behaviour the agent is paying for. A render after a blocked static fetch
 * must never look like the static fetch simply worked.
 */
export type ResearchTier = 'llm' | 'static' | 'render';

export interface ResearchEscalation {
  from: 'llm' | 'static';
  to: 'render';
  /** Human-readable, but also carried on the outcome so the agent sees it without events. */
  reason: string;
}

export interface ResearchAnchorDetail {
  text: string;
  path: string;
  fingerprint: Record<string, unknown>;
}

export type ResearchEvent =
  | { type: 'run-start'; runId: string; query: string; maxSources: number; at: number }
  | {
      type: 'search-done';
      runId: string;
      engine: string | null;
      results: number;
      blocked: boolean;
      attempts: number;
      at: number;
    }
  | { type: 'source-start'; runId: string; rank: number; url: string; title: string; at: number }
  | {
      type: 'source-done';
      runId: string;
      rank: number;
      url: string;
      title: string;
      via: ResearchTier;
      bytes: number;
      ms: number;
      highlights: number;
      indexed: boolean;
      humanAssisted?: boolean;
      humanMs?: number;
      anchors?: number;
      anchorDetails?: ResearchAnchorDetail[];
      escalation?: ResearchEscalation;
      error?: string;
      at: number;
    }
  | {
      type: 'human-needed';
      runId: string;
      url: string;
      reason: 'challenge' | 'login' | 'consent';
      screenshot?: string;
      at: number;
    }
  | {
      type: 'human-done';
      runId: string;
      url: string;
      via: 'human';
      at: number;
    }
  | {
      type: 'run-done';
      runId: string;
      sources: number;
      indexed: number;
      bytes: number;
      tiers: Record<ResearchTier, number>;
      humans: number;
      anchors: number;
      elapsedMs: number;
      escalations: number;
      notes: string[];
      at: number;
    }
  | { type: 'run-error'; runId: string; message: string; at: number };
