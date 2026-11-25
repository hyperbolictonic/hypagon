/**
 * Deterministic guard around a decision call: validate the answer, drop the option that failed,
 * ask again with what's left, and stop with an honest "no decision" when nothing survives.
 *
 * Why this is mechanical (and allowed to live in Kuang): nothing here decides *what is right*.
 * It only checks facts Kuang already owns — is the chosen id in the list we offered, does that
 * component actually accept the operation, is the confidence above the bar, do the answers
 * contradict each other. A rejection removes exactly that option, so the next call cannot repeat
 * the same mistake. When the options run out, the result is `accepted:false, fallback:"agent"` —
 * the LLM keeps the last word, which is where judgement belongs.
 *
 * The loop costs one model call per attempt (Jev answers in ~200–500 ms), and each attempt is
 * reported so the HUD/ledger can show what was eliminated and why.
 */

import { runDecision, emitDecisionEvent, type DecisionResult } from './decision-client.js';
import { summarizeQuestions } from './decision-questions.js';

/** When to use: `decideGuarded` and the decide route — the confidence floor, the allowed operations and the offered components. */
export interface DecisionGuard {
  /** Minimum confidence for a choice to be accepted (0–1). Omit to accept any confidence. */
  threshold?: number;
  /** Operations that may be accepted. Default: click, type_text, done, blocked. */
  operations?: string[];
  /** Components offered to the model, with their affordances. Used to reject impossible targets. */
  components?: Array<{ id: string | number; actions?: string[]; name?: string }>;
}

/** When to use: reading why a decision candidate was eliminated — question, option and reason. */
export interface GuardRejection {
  question: string;
  option: string;
  reason: string;
}

/** When to use: the decide route and `drive` — the accepted answer plus attempts, eliminations, fallbacks and gates. */
export interface GuardedDecision {
  ok: boolean;
  accepted: boolean;
  protocol?: string;
  model?: string;
  answers?: Record<string, any>;
  attempts: number;
  removed: Record<string, string[]>;
  rejections: GuardRejection[];
  reasons: string[];
  /** True when every candidate was eliminated without an acceptable answer. */
  exhausted?: boolean;
  /** Present when the caller must decide (the model could not produce an acceptable answer). */
  fallback?: 'agent' | 'human';
  /** Set when a sensitive gate stopped the call before the model (age verification, CAPTCHA). */
  gate?: 'age_verification' | 'captcha';
  /** Set when an image was dropped because the endpoint would not accept it. */
  imageNote?: string;
  latencyMs?: number;
  error?: DecisionResult['error'];
}

const DEFAULT_OPERATIONS = ['click', 'type_text', 'done', 'blocked'];

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));

/** Remove one option from a choice question, in whichever shape the backend uses. */
function withoutOption(question: any, option: string): any {
  const next = clone(question);
  if (next.criteria && typeof next.criteria === 'object' && !Array.isArray(next.criteria)) {
    delete next.criteria[option];
  }
  if (Array.isArray(next.options)) {
    next.options = next.options.filter((o: string) => o !== option);
  }
  if (next.descriptions && typeof next.descriptions === 'object') {
    delete next.descriptions[option];
  }
  return next;
}

function optionCount(question: any): number {
  if (Array.isArray(question.options)) return question.options.length;
  if (question.criteria && typeof question.criteria === 'object') return Object.keys(question.criteria).length;
  return 0;
}

/**
 * Validate one answer set. Returns the offending (question, option) pairs so the caller can
 * remove exactly those, plus human-readable reasons for the record.
 */
export function validateAnswers(answers: Record<string, any>, guard: DecisionGuard): { ok: boolean; rejections: GuardRejection[] } {
  const rejections: GuardRejection[] = [];
  const threshold = typeof guard.threshold === 'number' ? guard.threshold : 0;
  const allowedOperations = guard.operations && guard.operations.length ? guard.operations : DEFAULT_OPERATIONS;

  const operation = answers?.operation?.choice;

  if (operation !== undefined && !allowedOperations.includes(operation)) {
    rejections.push({ question: 'operation', option: String(operation), reason: `"${operation}" is not an allowed operation` });
  }

  // Confidence gate on every choice answer.
  if (threshold > 0) {
    for (const [id, answer] of Object.entries(answers || {})) {
      if (answer && typeof answer === 'object' && 'choice' in answer) {
        const confidence = Number((answer as any).confidence ?? 0);
        if (confidence < threshold) {
          rejections.push({
            question: id,
            option: String((answer as any).choice),
            reason: `confidence ${confidence.toFixed(2)} is below the ${threshold.toFixed(2)} threshold`,
          });
        }
      }
    }
  }

  // A target must exist and accept the chosen operation.
  if (guard.components && guard.components.length) {
    for (const [id, answer] of Object.entries(answers || {})) {
      if (!/target/i.test(id) || !answer || typeof answer !== 'object' || !('choice' in answer)) continue;
      const chosen = String((answer as any).choice);
      const component = guard.components.find((c) => String(c.id) === chosen);
      if (!component) {
        rejections.push({ question: id, option: chosen, reason: `component ${chosen} was not in the offered list` });
        continue;
      }
      if (operation && component.actions && component.actions.length && operation !== 'done' && operation !== 'blocked') {
        // The operation vocabulary ("type_text") and the affordance vocabulary ("type") differ.
        const requiredAction = operation === 'type_text' ? 'type' : operation;
        if (!component.actions.includes(requiredAction)) {
          rejections.push({
            question: id,
            option: chosen,
            reason: `component ${chosen} does not accept "${operation}" (actions: ${component.actions.join(', ')})`,
          });
        }
      }
    }
  }

  // Contradiction: a terminal operation has nothing to act on.
  if (operation === 'done' || operation === 'blocked') {
    const targetAnswer = Object.entries(answers || {}).find(([id, a]) => /target/i.test(id) && a && typeof a === 'object' && 'choice' in a);
    if (targetAnswer) {
      rejections.push({
        question: 'operation',
        option: String(operation),
        reason: `operation "${operation}" needs no target, but a target (${(targetAnswer[1] as any).choice}) was chosen`,
      });
    }
  }

  // Contradiction: claims the goal is met while also choosing another operation.
  const doneP = answers?.done?.noul ?? answers?.done?.probability;
  const isDone = typeof doneP === 'number' ? doneP >= 0.5 : answers?.done?.answer;
  if (isDone === true && operation !== undefined && operation !== 'done') {
    rejections.push({
      question: 'operation',
      option: String(operation),
      reason: `"done" question is true while the operation is "${operation}"`,
    });
  }

  return { ok: rejections.length === 0, rejections };
}

/** Mirror the final verdict into the HUD, so an eliminated set is visible as such. */
function emitNoDecision(state: unknown, questions: Record<string, any>, reasons: string[], attempts: number, protocol?: string, model?: string) {
  emitDecisionEvent({
    ts: Date.now(),
    protocol: protocol as any,
    model,
    ok: false,
    latencyMs: undefined,
    error: { code: 'NO_DECISION', message: `${attempts} attempt(s): ${reasons.join('; ')}` },
    statePreview: (typeof state === 'string' ? state : JSON.stringify(state ?? '')).slice(0, 160),
    questions: summarizeQuestions(questions),
  });
}

/** A non-human failure ends the run without eliminations. */
function terminalFailure(
  result: DecisionResult,
  attempt: number,
  removed: Record<string, string[]>,
  rejections: GuardRejection[],
  reasons: string[],
  started: number,
): GuardedDecision {
  return {
    ok: false,
    accepted: false,
    protocol: result.protocol,
    model: result.model,
    attempts: attempt,
    removed,
    rejections,
    reasons: [...reasons, result.error?.message || 'decision call failed'],
    latencyMs: Date.now() - started,
    error: result.error,
  };
}

/** A sensitive gate stopped the call before the model: hand straight to the human. */
function humanRequired(
  result: DecisionResult,
  attempt: number,
  removed: Record<string, string[]>,
  rejections: GuardRejection[],
  started: number,
): GuardedDecision {
  return {
    ok: false,
    accepted: false,
    fallback: 'human',
    gate: result.gate,
    protocol: result.protocol,
    model: result.model,
    attempts: attempt,
    removed,
    rejections,
    reasons: [result.error?.message, result.error?.hint].filter(Boolean) as string[],
    latencyMs: Date.now() - started,
    error: result.error,
  };
}

/** The model produced an answer the guard accepts. */
function acceptedDecision(
  result: DecisionResult,
  attempt: number,
  removed: Record<string, string[]>,
  rejections: GuardRejection[],
  reasons: string[],
  started: number,
): GuardedDecision {
  return {
    ok: true,
    accepted: true,
    protocol: result.protocol,
    model: result.model,
    answers: result.answers,
    attempts: attempt,
    removed,
    rejections,
    reasons,
    latencyMs: Date.now() - started,
    imageNote: result.imageNote,
    gate: result.gate,
  };
}

/** Every option was eliminated (or the attempt budget ran out): the agent decides. */
function exhaustedDecision(args: {
  attempt: number;
  result?: DecisionResult;
  removed: Record<string, string[]>;
  rejections: GuardRejection[];
  reasons: string[];
  message: string;
  started: number;
}): GuardedDecision {
  const { attempt, result, removed, rejections, reasons, message, started } = args;
  return {
    ok: true,
    accepted: false,
    exhausted: true,
    fallback: 'agent',
    protocol: result?.protocol,
    model: result?.model,
    answers: result?.answers,
    attempts: attempt,
    removed,
    rejections,
    reasons: [...reasons, message],
    latencyMs: Date.now() - started,
  };
}

/** Remove one rejected option; true when that question has no options left. */
function eliminate(
  rejection: GuardRejection,
  questions: Record<string, any>,
  removed: Record<string, string[]>,
  reasons: string[],
): boolean {
  reasons.push(rejection.reason);
  const question = questions[rejection.question];
  if (!question) return false;
  const next = withoutOption(question, rejection.option);
  questions[rejection.question] = next;
  (removed[rejection.question] ||= []).push(rejection.option);
  return optionCount(next) < 1;
}

/**
 * Ask, validate, eliminate, repeat. `maxAttempts` includes the first call (default 3).
 */
export async function decideGuarded(opts: {
  state: unknown;
  questions: Record<string, any>;
  model?: string;
  guard?: DecisionGuard;
  maxAttempts?: number;
  assets?: Record<string, unknown>;
  pageUrl?: string;
}): Promise<GuardedDecision> {
  const guard = opts.guard || {};
  const maxAttempts = Math.max(1, Math.min(Number(opts.maxAttempts ?? 1), 5));
  const removed: Record<string, string[]> = {};
  const rejections: GuardRejection[] = [];
  const reasons: string[] = [];
  const questions = clone(opts.questions || {});
  const started = Date.now();

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const result = await runDecision({ state: opts.state, questions, model: opts.model, assets: opts.assets, pageUrl: opts.pageUrl });
    if (!result.ok) {
      // A sensitive gate is not a failed attempt: no model was called, no option is elimable.
      if (result.error?.code === 'HUMAN_REQUIRED') return humanRequired(result, attempt, removed, rejections, started);
      return terminalFailure(result, attempt, removed, rejections, reasons, started);
    }

    const verdict = validateAnswers(result.answers || {}, guard);
    if (verdict.ok) return acceptedDecision(result, attempt, removed, rejections, reasons, started);

    rejections.push(...verdict.rejections);
    for (const rejection of verdict.rejections) {
      if (!eliminate(rejection, questions, removed, reasons)) continue;
      const message = `every option for "${rejection.question}" was eliminated`;
      emitNoDecision(opts.state, opts.questions, [...reasons, message], attempt, result.protocol, result.model);
      return exhaustedDecision({ attempt, result, removed, rejections, reasons, message, started });
    }
  }

  const message = `${maxAttempts} attempt(s) produced no acceptable answer — the agent decides`;
  emitNoDecision(opts.state, opts.questions, [...reasons, `${maxAttempts} attempt(s) produced no acceptable answer`], maxAttempts);
  return exhaustedDecision({ attempt: maxAttempts, removed, rejections, reasons, message, started });
}
