/**
 * The HUD/ledger summary of a decision call's typed questions.
 *
 * The client records a call and the guard mirrors a verdict; both publish the
 * same clipped question list, so the shape lives in one place instead of a copy
 * per recorder.
 */

/** When to use: recording what a decision call was asked. */
export interface DecisionQuestionSummary {
  id: string;
  type?: string;
  instruction?: string;
}

/** When to use: one call's questions, flattened for the event log. */
export function summarizeQuestions(questions: Record<string, any>): DecisionQuestionSummary[] {
  return Object.entries(questions || {}).map(([id, q]: [string, any]) => ({
    id,
    type: q?.type,
    instruction: typeof q?.instructions === 'string' ? q.instructions.slice(0, 120) : undefined,
  }));
}
