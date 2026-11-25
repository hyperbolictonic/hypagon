/**
 * The decision-event fan-out.
 *
 * The HUD mirrors every completed call; a listener can never delay or fail a
 * decision. Kept separate from the transport so the entry point and the HUD
 * share one bus without importing the model code.
 */
import type { DecisionEvent } from './types.js';

const listeners = new Set<(event: DecisionEvent) => void>();

/** Subscribe to completed decision calls (the HUD mirrors this; it never gates the call). */
export function onDecision(listener: (event: DecisionEvent) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** When to use: after a call completes — fan the record out to the HUD. */
export function emitDecisionEvent(event: DecisionEvent): void {
  for (const listener of listeners) {
    try {
      listener(event);
    } catch {
      // A UI listener must never break a decision.
    }
  }
}
