import test from 'node:test';
import assert from 'node:assert/strict';

import type { BrowserTarget } from '../src/target.ts';
import { createBrowserHost, createBrowserTools } from '../src/host.ts';

const MARK = {
  id: 1,
  tag: 'BUTTON',
  text: 'Go',
  rect: { x: 10, y: 20, width: 40, height: 20 },
  center: { x: 30, y: 30 },
};

function fakeTarget(): { target: BrowserTarget; scripts: string[] } {
  const scripts: string[] = [];
  const target = {
    id: 'host-test',
    kind: 'chrome-cdp',
    url: () => 'https://example.test/',
    onCdpEvent: () => () => undefined,
    sendCommand: async (method: string) => {
      if (method === 'Accessibility.enable') return {};
      if (method === 'Accessibility.getFullAXTree') {
        return { nodes: [{ role: { value: 'button' }, name: { value: 'Go' } }] };
      }
      return {};
    },
    evaluate: async (script: string) => {
      scripts.push(script);
      if (script === 'document.title') return 'Example';
      if (script.includes('newStaticAnchors')) return { marks: [MARK], newStaticAnchors: {} };
      if (script.includes('data-mark-id="1"')) {
        return { x: 30, y: 30, covered: false, tag: 'BUTTON', name: 'Go', rect: MARK.rect };
      }
      if (script.includes('var SKIP')) {
        return { html: '<article><h1>Example</h1><p>Hello world.</p></article>', shadowRoots: 0 };
      }
      if (script.includes('rows') || script.includes('kind')) {
        return { kind: 'list', rows: [{ text: 'One' }, { text: 'Two' }] };
      }
      if (script.includes('url: location.href')) {
        return { url: 'https://example.test/', title: 'Example', nodeCount: 3, height: 100, scrollY: 0, textLen: 10, textHash: 1 };
      }
      return null;
    },
  } as unknown as BrowserTarget;
  return { target, scripts };
}

test('observe(som) and find work without an input driver', async () => {
  const { target } = fakeTarget();
  const { primitives } = createBrowserTools({ target, network: false });

  const som = await primitives.observe({ as: 'som' });
  assert.equal(som.count, 1);
  assert.match(som.text, /\[#1\] <BUTTON> "Go"/);

  const found = await primitives.find({ contains: 'Go' });
  assert.equal(found.count, 1);
  assert.equal(found.marks[0]?.id, 1);
});

test('observe(markdown) harvests the composed DOM', async () => {
  const { target } = fakeTarget();
  const { primitives } = createBrowserTools({ target, network: false });
  const page = await primitives.observe({ as: 'markdown' });
  assert.match(page.text, /Example/);
  assert.match(page.text, /Hello world/);
});

test('extract returns structured rows', async () => {
  const { target } = fakeTarget();
  const { primitives } = createBrowserTools({ target, network: false });
  const result = await primitives.extract({ kind: 'list' });
  assert.deepEqual(result.rows, [{ text: 'One' }, { text: 'Two' }]);
});

test('act(click) resolves the mark and uses the input port', async () => {
  const { target } = fakeTarget();
  const clicks: Array<{ x: number; y: number }> = [];
  const { primitives } = createBrowserTools({
    target,
    network: false,
    input: {
      click: async (_target, point) => {
        clicks.push(point);
      },
      typeText: async () => undefined,
      pressKey: async () => undefined,
      moveMouse: async () => undefined,
      insertText: async () => true,
      pasteText: async () => true,
    },
  });

  const result = await primitives.act({ markId: 1, action: 'click' });
  assert.equal(result.ok, true);
  assert.deepEqual(clicks, [{ x: 30, y: 30 }]);
});

test('act without an input driver reports NOT_SUPPORTED', async () => {
  const { target } = fakeTarget();
  const { primitives } = createBrowserTools({ target, network: false });
  await assert.rejects(
    () => primitives.act({ markId: 1, action: 'click' }),
    (error: any) => error.code === 'NOT_SUPPORTED',
  );
});

test('state and AX snapshot are available to a target-only host', async () => {
  const { target } = fakeTarget();
  const host = createBrowserHost({ target, network: false });
  assert.equal(typeof host.revision(), 'number');
  const snap = await host.snapshotRenderedPage!({ format: 'ax_tree' });
  assert.match(snap.content, /button "Go"/);
});
