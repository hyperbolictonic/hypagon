import test from 'node:test';
import assert from 'node:assert/strict';

import type { BrowserTarget } from '../../browser/src/target.ts';
import { createHumanizedBrowserTools } from '../src/host.ts';

process.env.KUANG_CURSOR_BUDGET_MS = '0';

const MARK = {
  id: 1,
  tag: 'BUTTON',
  text: 'Go',
  rect: { x: 10, y: 20, width: 40, height: 20 },
  center: { x: 30, y: 30 },
};

function fakeTarget(): {
  target: BrowserTarget;
  calls: Array<{ method: string; params: Record<string, any> }>;
} {
  const calls: Array<{ method: string; params: Record<string, any> }> = [];
  const target = {
    id: 'stealth-host',
    kind: 'chrome-cdp',
    url: () => 'https://example.test/',
    onCdpEvent: () => () => undefined,
    sendCommand: async (method: string, params: Record<string, any> = {}) => {
      calls.push({ method, params });
      if (method === 'Page.getFrameTree') return {};
      if (method === 'Target.getTargets') return { targetInfos: [] };
      return {};
    },
    evaluate: async (script: string) => {
      if (script === 'document.title') return 'Example';
      if (script.includes('newStaticAnchors')) return { marks: [MARK], newStaticAnchors: {} };
      if (script.includes('data-mark-id="1"')) {
        return { x: 30, y: 30, covered: false, tag: 'BUTTON', name: 'Go', rect: MARK.rect };
      }
      if (script.includes('var SKIP')) {
        return { html: '<article><h1>Example</h1><p>Hello world.</p></article>', shadowRoots: 0 };
      }
      return null;
    },
  } as unknown as BrowserTarget;
  return { target, calls };
}

test('the humanised host observes, finds and clicks with no per-method glue', async () => {
  const { target, calls } = fakeTarget();
  const tools = createHumanizedBrowserTools({ target, network: false, profile: { clickDwellMs: 0 } });

  const som = await tools.primitives.observe({ as: 'som' });
  assert.equal(som.count, 1);

  const found = await tools.primitives.find({ contains: 'Go' });
  assert.equal(found.count, 1);

  const result = await tools.primitives.act({ markId: 1, action: 'click' });
  assert.equal(result.ok, true);

  const pressed = calls.find(
    (call) => call.method === 'Input.dispatchMouseEvent' && call.params.type === 'mousePressed',
  );
  assert.deepEqual({ x: pressed?.params.x, y: pressed?.params.y }, { x: 30, y: 30 });
  assert.ok(calls.some((call) => call.method === 'Input.dispatchMouseEvent' && call.params.type === 'mouseReleased'));
});

test('the humanised host exposes the driver and sealed discovery', async () => {
  const { target } = fakeTarget();
  const tools = createHumanizedBrowserTools({ target, network: false });
  assert.equal(tools.input.lastInputTransport, null);
  tools.input.setProfile({ typingWpm: 200 });

  const sealed = await tools.host.findSealed!({});
  assert.deepEqual(sealed.controls, []);
});

test('the humanised host harvests markdown', async () => {
  const { target } = fakeTarget();
  const tools = createHumanizedBrowserTools({ target, network: false });
  const page = await tools.primitives.observe({ as: 'markdown' });
  assert.match(page.text, /Hello world/);
});
