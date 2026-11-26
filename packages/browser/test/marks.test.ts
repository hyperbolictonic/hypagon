import test from 'node:test';
import assert from 'node:assert/strict';

import type { BrowserTarget } from '../src/target.ts';
import { MarksOverlay, type MarkItem } from '../src/marks/marks-overlay.ts';
import { marksInjectorScript } from '../src/marks/inject-script.ts';

const MARK: MarkItem = {
  id: 1,
  tag: 'BUTTON',
  text: 'Buy',
  rect: { x: 10, y: 20, width: 30, height: 10 },
  center: { x: 25, y: 25 },
};

function lookupTarget(scripts: string[]): BrowserTarget {
  return {
    url: () => 'https://example.test/flights',
    evaluate: async (script: string) => {
      scripts.push(script);
      if (script.includes('newStaticAnchors')) {
        return { marks: [MARK], newStaticAnchors: { 'button|buy': 1 } };
      }
      if (script.includes('data-mark-id')) {
        return { x: 12, y: 22, covered: false, tag: 'BUTTON', name: 'Buy now', rect: { x: 10, y: 20, width: 30, height: 10 } };
      }
      return undefined;
    },
  } as unknown as BrowserTarget;
}

test('injectMarks evaluates the injector, caches the active set and returns the rows', async () => {
  const scripts: string[] = [];
  const overlay = new MarksOverlay();
  const marks = await overlay.injectMarks(lookupTarget(scripts), { includeOffscreen: true });
  assert.equal(marks.length, 1);
  assert.equal(marks[0]?.text, 'Buy');
  assert.equal(scripts.length, 1);
  assert.match(scripts[0]!, /data-mark-id/);
  assert.deepEqual(overlay.getActiveMarks(), [MARK]);
});

test('getMarkTarget returns live geometry and identity, falling back to the cache', async () => {
  const scripts: string[] = [];
  const overlay = new MarksOverlay();
  await overlay.injectMarks(lookupTarget(scripts), {});

  const live = await overlay.getMarkTarget(lookupTarget(scripts), 1);
  assert.deepEqual(live?.currentCenter, { x: 12, y: 22 });
  assert.equal(live?.mark.text, 'Buy');

  const missing = await overlay.getMarkTarget(
    { url: () => 'u', evaluate: async () => null } as unknown as BrowserTarget,
    1,
  );
  assert.deepEqual(missing?.mark, MARK);
});

test('getMarkTarget returns null when neither the page nor the cache knows the id', async () => {
  const overlay = new MarksOverlay();
  const missing = await overlay.getMarkTarget(
    { url: () => 'u', evaluate: async () => null } as unknown as BrowserTarget,
    99,
  );
  assert.equal(missing, null);
});

test('removeMarks evaluates the badge cleanup script', async () => {
  const scripts: string[] = [];
  await new MarksOverlay().removeMarks({
    url: () => 'u',
    evaluate: async (script: string) => {
      scripts.push(script);
      return undefined;
    },
  } as unknown as BrowserTarget);
  assert.equal(scripts.length, 1);
  assert.match(scripts[0]!, /mark-eleven-som-container/);
});

test('the injector script carries the options it was given', () => {
  const script = marksInjectorScript({ includeOffscreen: true, deepOpenRoots: false, existingAnchors: { a: 7 } });
  assert.match(script, /includeOffscreen/);
  assert.match(script, /deepOpenRoots/);
  assert.match(script, /"a":7/);
});
