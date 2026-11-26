import test from 'node:test';
import assert from 'node:assert/strict';

import type { BrowserTarget } from '../src/target.ts';
import {
  parseControlFacts,
  controlFactsExpression,
} from '../src/primitives/control-facts.ts';
import { addressedFrameControls } from '../src/primitives/frame-controls.ts';
import { elementExpr, targetBoxScript } from '../src/primitives/dom-targeting.ts';
import {
  componentsText,
  markLine,
  pageText,
  renderExtract,
} from '../src/primitives/projection.ts';
import {
  parseTextTargets,
  resolveTextTargets,
  textTargetExpression,
} from '../src/primitives/text-target.ts';

test('textTargetExpression renders the query and options into a page script', () => {
  const script = textTargetExpression('Sign in', { exact: true, max: 3 });
  assert.match(script, /"query":"Sign in"/);
  assert.match(script, /"exact":true/);
  assert.match(script, /"max":3/);
  assert.match(script, /document\.querySelectorAll/);
});

test('parseTextTargets accepts an object, a JSON string and garbage', () => {
  const hit = parseTextTargets({
    query: 'Sign in',
    unique: true,
    matches: [{ text: 'Sign in', tag: 'button', x: 1, y: 2, width: 3, height: 4, index: 0 }],
  });
  assert.equal(hit.query, 'Sign in');
  assert.equal(hit.unique, true);
  assert.equal(hit.matches.length, 1);

  const parsed = parseTextTargets('{"query":"A","unique":false,"matches":[]}');
  assert.equal(parsed.query, 'A');
  assert.deepEqual(parsed.matches, []);

  assert.deepEqual(parseTextTargets('not json'), { query: '', matches: [], unique: false });
});

test('resolveTextTargets evaluates through the target and tolerates a rejected evaluate', async () => {
  const calls: string[] = [];
  const target = {
    evaluate: async (script: string) => {
      calls.push(script);
      if (script.includes('"query":"boom"')) throw new Error('page gone');
      return { query: 'ok', unique: true, matches: [] };
    },
  } as unknown as BrowserTarget;

  assert.equal((await resolveTextTargets(target, 'ok')).unique, true);
  assert.equal(calls.length, 1);
  assert.deepEqual(await resolveTextTargets(target, 'boom'), {
    query: '',
    matches: [],
    unique: false,
  });
});

test('parseControlFacts reads the control list and tolerates bad input', () => {
  const parsed = parseControlFacts({
    url: 'https://example.test/',
    controls: [{ tag: 'button', role: 'button', name: 'Go', state: [], actions: ['click'], visible: true, occluded: false, disabled: false, region: 'main', rect: { x: 0, y: 0, width: 10, height: 10 } }],
  });
  assert.equal(parsed.url, 'https://example.test/');
  assert.equal(parsed.controls.length, 1);
  assert.deepEqual(parseControlFacts('nope'), { controls: [] });
});

test('controlFactsExpression embeds the selector and clamps the limit', () => {
  const script = controlFactsExpression({ selector: '#main', limit: 9999 });
  assert.match(script, /"selector":"#main"/);
  assert.match(script, /"limit":500/);
});

test('addressedFrameControls yields only child-frame controls with ids >= 100', () => {
  const rows = Array.from(
    addressedFrameControls({
      frames: [
        { depth: 0, controls: [{ id: 1 }] },
        { depth: 1, controls: [{ id: 100 }, { id: 42 }, { id: 'x' }] },
        { depth: 2, controls: undefined },
      ],
    }),
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.control.id, 100);
});

test('elementExpr resolves each locator shape', () => {
  assert.equal(elementExpr({ markId: 7 }), `kqDeep('[data-mark-id="7"]')`);
  assert.equal(elementExpr({ selector: '#email' }), 'kqDeep("#email")');
  assert.equal(elementExpr({ point: { x: 12.4, y: 8.6 } }), 'kqAtPoint(12, 9)');
  assert.equal(elementExpr({}), 'null');
});

test('targetBoxScript scrolls a selector target but not an explicit point', () => {
  assert.match(targetBoxScript({ selector: '#email' }), /scrollIntoView/);
  assert.doesNotMatch(targetBoxScript({ point: { x: 1, y: 2 } }), /scrollIntoView/);
});

test('formatMark renders the badge, value and state', () => {
  assert.equal(
    markLine({ id: 3, tag: 'input', type: 'text', role: 'combobox', text: 'Where to?', value: 'London', state: 'expanded=false,required' }),
    '[#3] <input type="text" role=combobox> "Where to?" {value="London", expanded=false, required}',
  );
  assert.equal(markLine({ id: 1, tag: 'button', text: 'Go' }), '[#1] <button> "Go"');
});

test('componentsText groups by region', () => {
  const text = componentsText([
    { id: 2, role: 'button', name: 'Save', state: [], actions: ['click'], region: 'main' },
    { id: 1, role: 'textbox', name: 'Email', value: 'a@b.c', state: ['required'], actions: ['type'], region: 'form', regionName: 'Login' },
  ]);
  assert.match(text, /## main/);
  assert.match(text, /## form · Login/);
  assert.match(text, /\[1\] textbox\s+"Email" · a@b\.c \[required\] \{type\}/);
});

test('pageText slices by budget and returns a cursor', () => {
  const text = 'a'.repeat(10) + '\n' + 'b'.repeat(10);
  const first = pageText('text', 4, { url: 'u', title: 't' }, text, { budget: 12 });
  assert.equal(first.revision, 4);
  assert.equal(first.total, 21);
  assert.equal(first.truncated, true);
  assert.equal(first.next_cursor, '12');
  assert.equal(first.text.length, 12);

  const rest = pageText('text', 4, { url: 'u', title: 't' }, text, { budget: 12, cursor: first.next_cursor });
  assert.equal(rest.offset, 12);
  assert.equal(rest.truncated, false);
  assert.equal(rest.text.length, 9);

  const all = pageText('text', 4, { url: 'u', title: 't' }, text, { budget: 0 });
  assert.equal(all.text, text);
});

test('pageText extends a cut to the next newline when it is close', () => {
  const cut = pageText('text', 1, { url: 'u', title: 't' }, 'abc\ndef', { budget: 2 });
  assert.equal(cut.text, 'abc');
  assert.equal(cut.next_cursor, '3');
});

test('renderExtract renders tables, app data and lists', () => {
  assert.equal(
    renderExtract({ kind: 'table', headers: ['a', 'b'], rows: [[1, 2]] }),
    '| a | b |\n| 1 | 2 |',
  );
  assert.equal(renderExtract({ kind: 'app_data', sources: [{ source: 'x', bytes: 3, parsed: true }] }), 'x (3B, parsed=true)');
  assert.equal(renderExtract({ rows: [{ text: 'One', href: '/one' }, { text: 'Two' }] }), '1. One -> /one\n2. Two');
  assert.equal(renderExtract(null), '(no data: empty)');
});
