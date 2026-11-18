/**
 * Decision-event bus: completed calls for the HUD's DECISIONS tab.
 *
 * One process-wide listener set; a UI listener must never break a decision, so every
 * call is isolated.
 *
 * When to use: the HUD subscribes (`onDecision`) and the client publishes
 * (`emitDecisionEvent`). Never gate a decision on a listener.
 */

import type { DecisionEvent } from './decision-types.js';

const listeners = new Set<(event: DecisionEvent) => void>();

/** Subscribe to completed decision calls (the HUD mirrors this; it never gates the call). */
export function onDecision(listener: (event: DecisionEvent) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** When to use: publishing a decision outcome to the HUD timeline. */
export function emitDecisionEvent(event: DecisionEvent): void {
  for (const listener of listeners) {
    try {
      listener(event);
    } catch {
      // A UI listener must never break a decision.
    }
  }
}

export type { DecisionEvent } from './decision-types.js';
