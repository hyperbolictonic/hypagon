/**
 * What the drive loop asks its decision model.
 *
 * The loop's quality is mostly prompt shape: the operation vocabulary, the component
 * table, the last action's outcome and the optional page text. Keeping them here
 * means the loop reads as control flow, and the model-facing contract is reviewable
 * on its own.
 *
 * When to use: changing what the decision model sees during `POST /drive`, or reading
 * how a component/value is looked up for an action.
 */

/** When to use: the operation vocabulary offered to the decision model. */
export const OPERATIONS = {
  click: 'Actuate a control: submit, dismiss, choose an option, follow a link, sort — INCLUDING clicking a suggestion from an open autocomplete list after typing.',
  type_text: 'Type a value into a text field or editable control. If a suggestion list is already open, prefer clicking the matching suggestion instead.',
  done: 'The goal is already satisfied by what is visible.',
  blocked: 'A wall (CAPTCHA, consent, login, payment) prevents progress.',
};

/** When to use: building the choice criteria for a target question from components. */
export function criteriaFor(components: any[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const c of components.slice(0, 40)) {
    out[String(c.id)] = `${c.role}${c.name ? `: ${c.name}` : ''}`.slice(0, 100);
  }
  return out;
}

/** When to use: resolving a caller-supplied value for a component by id or name. */
export function lookupValue(values: Record<string, string> | undefined, component: any): string | undefined {
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

/** When to use: assembling the state text for one drive step (goal, page, last action, components, text). */
export function buildDriveState(input: {
  goal: string;
  title?: string;
  lastStep?: { operation?: string; typedChars?: number; targetName?: string; target?: string | number };
  components: any[];
  pageText?: string;
}): string {
  const { goal, title, lastStep, components, pageText } = input;
  const lastActionLine = lastStep
    ? `Last action: ${lastStep.operation === 'type_text' ? `typed ${lastStep.typedChars || 0} characters into` : 'clicked'} "${lastStep.targetName || `#${lastStep.target}`}". If that opened a suggestion list or a menu, choose the matching item with click; otherwise continue toward the goal.`
    : '';

  return [
    `Goal: ${goal}`,
    title ? `Page: ${title}` : '',
    lastActionLine,
    'Visible components:',
    ...components
      .slice(0, 40)
      .map((c) => `[${c.id}] ${c.role} "${c.name || ''}"${c.value ? ` value "${c.value}"` : ''} {${(c.actions || []).join(',')}}`),
    pageText ? `\nVisible page text:\n${pageText.slice(0, 2500)}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

/** When to use: assembling the typed questions for one drive step (operation, done, per-action targets). */
export function buildDriveQuestions(clickable: any[], typeable: any[]): Record<string, any> {
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
