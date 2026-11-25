/**
 * `drive` — the observe → decide → act loop, in code.
 *
 * This is the latency win from jev-ultrafast: one decision-model call per step instead of an
 * agent turn per step. It is deliberately **plumbing, not policy**:
 *
 *   - it never interprets the goal; the caller supplies it and the questions are fixed
 *   - it never generates text: when the chosen operation is `type_text`, it needs a value the
 *     caller supplied, otherwise it stops and asks (`needs_input`)
 *   - it never acts on a rejected decision (guard + elimination per step)
 *   - it stops on a sensitive gate; the human hand-off is raised by the caller
 *   - it stops on `done`, `blocked`, exhausted candidates, a failed action, or `maxSteps`
 *
 * Every step is returned in a transcript, and the existing ledger records the individual `act`
 * calls, so a run is auditable after the fact.
 */
import type { Primitives } from '../primitives/primitives.js';
import { decideGuarded } from '../decide/decision-guard.js';

/** When to use: reading a `drive` result — how the loop ended (done, blocked, needs input/agent, failed, cap). */
export type DriveStatus =
  | 'done'
  | 'blocked'
  | 'human_required'
  | 'needs_input'
  | 'needs_agent'
  | 'failed'
  | 'max_steps'
  | 'error';

/** When to use: one transcript row of a `drive` run — the operation, target, outcome and URL change. */
export interface DriveStep {
  step: number;
  operation: string;
  target?: number;
  targetName?: string;
  /** Component anchor from the host's exported surface. */
  signature?: string;
  /** Characters typed — never the text itself. */
  typedChars?: number;
  ok: boolean;
  urlChanged?: boolean;
  warning?: string;
  note?: string;
}

/** When to use: the `drive` reply — status, transcript, stop message, and the field/gate when it stopped. */
export interface DriveResult {
  status: DriveStatus;
  goal: string;
  steps: DriveStep[];
  message: string;
  /** Present for `needs_input`: which field needs a value, and what to pass. */
  field?: { id: number; name: string; tag?: string };
  /** Present for `human_required`. */
  gate?: 'age_verification' | 'captcha';
  reasons?: string[];
  url?: string;
  title?: string;
  dryRun?: boolean;
  durationMs: number;
}

/** When to use: calling `drive` — the goal, the values the caller supplies, and the step/threshold budget. */
export interface DriveOptions {
  goal: string;
  /** Field name (or component id) → text to type. Jev decides *where*; you supply *what*. */
  values?: Record<string, string>;
  maxSteps?: number;
  threshold?: number;
  maxAttempts?: number;
  dryRun?: boolean;
  /** Page text for gate detection + context (default true). */
  includePageText?: boolean;
}

const OPERATIONS = {
  click: 'Actuate a control: submit, dismiss, choose an option, follow a link, sort — INCLUDING clicking a suggestion from an open autocomplete list after typing.',
  type_text: 'Type a value into a text field or editable control. If a suggestion list is already open, prefer clicking the matching suggestion instead.',
  done: 'The goal is already satisfied by what is visible.',
  blocked: 'A wall (CAPTCHA, consent, login, payment) prevents progress.',
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function criteriaFor(components: any[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const c of components.slice(0, 40)) {
    out[String(c.id)] = `${c.role}${c.name ? `: ${c.name}` : ''}`.slice(0, 100);
  }
  return out;
}

function lookupValue(values: Record<string, string> | undefined, component: any): string | undefined {
  if (!values) return undefined;
  const id = String(component.id);
  if (values[id] !== undefined) return values[id];
  const name = (component.name || '').trim();
  if (name && values[name] !== undefined) return values[name];
  // Case-insensitive name match, then a contains match, so callers needn't be exact.
  const lower = name.toLowerCase();
  for (const [key, value] of Object.entries(values)) {
    const k = key.trim().toLowerCase();
    if (k === lower) return value;
  }
  for (const [key, value] of Object.entries(values)) {
    const k = key.trim().toLowerCase();
    if (k.length > 2 && (lower.includes(k) || k.includes(lower))) return value;
  }
  return undefined;
}

/** Where the current step's page facts came from; every terminal result repeats them. */
interface DriveContext {
  url?: string;
  title?: string;
  started: number;
}

/** Every terminal branch shares this shape; the extras are status-specific. */
function finish(
  status: DriveStatus,
  opts: DriveOptions,
  steps: DriveStep[],
  ctx: DriveContext,
  message: string,
  extra: Partial<Pick<DriveResult, 'gate' | 'reasons' | 'field' | 'dryRun'>> = {},
): DriveResult {
  return {
    status,
    goal: opts.goal,
    steps,
    message,
    url: ctx.url,
    title: ctx.title,
    durationMs: Date.now() - ctx.started,
    ...extra,
  };
}

/** The state block the decision model reads: goal, page, last action, components, page text. */
function buildState(
  opts: DriveOptions,
  components: any[],
  title: string | undefined,
  lastStep: DriveStep | undefined,
  pageText: string,
): string {
  const lastActionLine = lastStep
    ? `Last action: ${lastStep.operation === 'type_text' ? `typed ${lastStep.typedChars || 0} characters into` : 'clicked'} "${lastStep.targetName || `#${lastStep.target}`}". If that opened a suggestion list or a menu, choose the matching item with click; otherwise continue toward the goal.`
    : '';

  return [
    `Goal: ${opts.goal}`,
    title ? `Page: ${title}` : '',
    lastActionLine,
    'Visible components:',
    ...components
      .slice(0, 40)
      .map(
        (c) =>
          `[${c.id}] ${c.role} "${c.name || ''}"${c.value ? ` value "${c.value}"` : ''} {${(c.actions || []).join(',')}}`,
      ),
    pageText ? `\nVisible page text:\n${pageText.slice(0, 2500)}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

/** The typed questions: one operation choice plus a target question per affordance present. */
function buildQuestions(clickable: any[], typeable: any[]): Record<string, any> {
  const questions: Record<string, any> = {
    operation: { type: 'choice', instructions: 'What is the next operation to reach the goal?', criteria: OPERATIONS },
    done: { type: 'noul', instructions: 'Is the goal already satisfied by the visible state?' },
  };
  if (clickable.length) {
    questions.click_target = { type: 'choice', instructions: 'Which component should be clicked?', criteria: criteriaFor(clickable) };
  }
  if (typeable.length) {
    questions.type_text_target = { type: 'choice', instructions: 'Which component should be typed into?', criteria: criteriaFor(typeable) };
  }
  return questions;
}

/** A decision that cannot act ends the run: a human gate, or no acceptable answer. */
function decisionHalt(decision: any, opts: DriveOptions, steps: DriveStep[], ctx: DriveContext): DriveResult | null {
  if (!decision.ok && decision.gate) {
    return finish('human_required', opts, steps, ctx, decision.reasons?.[0] || 'A human is required.', {
      gate: decision.gate,
      reasons: decision.reasons,
    });
  }
  if (!decision.accepted) {
    return finish(
      'needs_agent',
      opts,
      steps,
      ctx,
      decision.reasons?.join('; ') || 'The decision model could not choose an acceptable action.',
      { reasons: decision.reasons },
    );
  }
  return null;
}

/** The chosen operation either ends the run (done/blocked/unsupported/missing) or names a component. */
function operationHalt(
  operation: string,
  component: any,
  targetId: number | undefined,
  decision: any,
  opts: DriveOptions,
  steps: DriveStep[],
  ctx: DriveContext,
): DriveResult | null {
  switch (operation) {
    case 'done':
      return finish('done', opts, steps, ctx, 'The model reports the goal is satisfied.');
    case 'blocked':
      return finish(
        'blocked',
        opts,
        steps,
        ctx,
        'The model reports a wall (no deterministic gate matched, so the agent decides what to do).',
      );
    case 'click':
    case 'type_text':
      break;
    default:
      return finish('needs_agent', opts, steps, ctx, `Unsupported operation "${operation}".`);
  }
  if (!component) {
    return finish(
      'needs_agent',
      opts,
      steps,
      ctx,
      `The model chose ${operation} on component ${String(targetId)} (answers: ${Object.keys(decision.answers || {}).join(', ')}) but it is no longer present.`,
    );
  }
  return null;
}

/** The text for a type step, or the needs_input result when the caller supplied none. */
function typedValueOrHalt(
  operation: string,
  component: any,
  opts: DriveOptions,
  steps: DriveStep[],
  ctx: DriveContext,
): { text?: string; halt?: DriveResult } {
  if (operation !== 'type_text') return {};
  const text = lookupValue(opts.values, component);
  if (text !== undefined) return { text };
  return {
    halt: finish(
      'needs_input',
      opts,
      steps,
      ctx,
      `The next step is to type into "${component.name || `#${component.id}`}". Supply a value for it and call drive again.`,
      { field: { id: Number(component.id), name: component.name || '', tag: component.tag } },
    ),
  };
}

/** Run the act call once; a thrown error becomes the same typed envelope as a refused action. */
function performAction(primitives: Primitives, component: any, operation: string, text: string | undefined): Promise<any> {
  return primitives
    .act({
      markId: Number(component.id),
      action: operation === 'type_text' ? 'type' : 'click',
      text,
      clearFirst: operation === 'type_text',
    } as any)
    .catch((err: any) => ({ ok: false, error: { code: 'ACTION_FAILED', message: String(err?.message || err) } }));
}

/** Append one transcript row; the text itself is never recorded, only its length. */
function recordStep(
  steps: DriveStep[],
  step: number,
  operation: string,
  component: any,
  targetName: string | undefined,
  signature: string | undefined,
  typedChars: number | undefined,
  acted: any,
): boolean {
  const ok = acted?.ok === true;
  steps.push({
    step,
    operation,
    target: Number(component.id),
    targetName,
    signature,
    typedChars,
    ok,
    urlChanged: Boolean(acted?.delta?.urlChanged),
    warning: acted?.warning,
    note: ok ? undefined : acted?.error?.code,
  });
  return ok;
}

/** Let the page settle before the next look — cheap, and it stops us reading a half-rendered state. */
async function settle(primitives: Primitives): Promise<void> {
  await primitives.waitFor([{ type: 'stable', target: 'text', holdMs: 250 }], { timeoutMs: 2500 }).catch(() => {});
  await sleep(150);
}

/**
 * Run the loop until a stop condition. Never throws: every failure is a typed status.
 */
export async function driveTask(primitives: Primitives, opts: DriveOptions): Promise<DriveResult> {
  const ctx: DriveContext = { started: Date.now() };
  const maxSteps = Math.max(1, Math.min(Number(opts.maxSteps ?? 10), 25));
  const threshold = typeof opts.threshold === 'number' ? opts.threshold : 0.45;
  const maxAttempts = Math.max(1, Math.min(Number(opts.maxAttempts ?? 2), 3));
  const steps: DriveStep[] = [];

  for (let step = 1; step <= maxSteps; step++) {
    const comps = await primitives.observe({ as: 'components' });
    const components: any[] = comps.components || [];
    ctx.url = comps.url;
    ctx.title = comps.title;

    if (!components.length) {
      return finish('blocked', opts, steps, ctx, 'No interactive components on the page.');
    }

    const clickable = components.filter((c) => (c.actions || []).includes('click') && c.name);
    const typeable = components.filter((c) => (c.actions || []).includes('type'));

    let pageText = '';
    if (opts.includePageText !== false) {
      const text = await primitives.observe({ as: 'text', budget: 2500 }).catch(() => null);
      pageText = typeof text?.text === 'string' ? text.text : '';
    }

    const state = buildState(opts, components, ctx.title, steps[steps.length - 1], pageText);
    const decision = await decideGuarded({
      state,
      questions: buildQuestions(clickable, typeable),
      guard: { threshold, components: components.map((c) => ({ id: c.id, actions: c.actions, name: c.name })) },
      maxAttempts,
      pageUrl: ctx.url,
    } as any);

    const halted = decisionHalt(decision, opts, steps, ctx);
    if (halted) return halted;

    const operation = String((decision.answers as any)?.operation?.choice || '');
    const targetAnswer = (decision.answers as any)?.[`${operation}_target`];
    const targetId = targetAnswer?.choice !== undefined ? Number(targetAnswer.choice) : undefined;
    const component = targetId !== undefined ? components.find((c) => Number(c.id) === targetId) : undefined;

    const opHalted = operationHalt(operation, component, targetId, decision, opts, steps, ctx);
    if (opHalted) return opHalted;

    const typed = typedValueOrHalt(operation, component, opts, steps, ctx);
    if (typed.halt) return typed.halt;

    if (opts.dryRun) {
      steps.push({ step, operation, target: Number(component.id), targetName: component.name, signature: component.signature, typedChars: typed.text?.length, ok: true, note: 'dry run' });
      return finish(
        'needs_agent',
        opts,
        steps,
        ctx,
        `Dry run: would ${operation === 'type_text' ? `type ${typed.text!.length} chars into` : 'click'} "${component.name || `#${component.id}`}".`,
        { dryRun: true },
      );
    }

    const acted = await performAction(primitives, component, operation, typed.text);
    const ok = recordStep(steps, step, operation, component, component.name, component.signature, typed.text?.length, acted);

    if (!ok) {
      // One retry for a click that provably did nothing; then stop rather than flail.
      if (step < maxSteps && reactedWouldRetry(acted)) {
        continue;
      }
      return finish('failed', opts, steps, ctx, acted?.error?.message || 'The action did not succeed.');
    }

    await settle(primitives);
  }

  return finish('max_steps', opts, steps, ctx, `Stopped after ${maxSteps} steps without reaching the goal.`);
}

/** A no-effect click is worth one more attempt; a rejected type is not (the field refuses input). */
function reactedWouldRetry(acted: any): boolean {
  const code = acted?.error?.code;
  if (code === 'TYPE_NO_EFFECT') return false;
  if (code === 'STALE_REF' || code === 'NO_TARGET') return false;
  return true;
}
