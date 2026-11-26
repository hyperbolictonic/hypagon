# @hyperbolictonic/hypagon-browser

The portable browser layer of Hypagon Gateway. It turns any page driver into an
agent-usable page: observe, act, find, extract, wait, marks and harvesting.

The package does **not** bundle Chromium and does **not** import Electron. A host
implements one interface, `BrowserTarget`, and the primitives run against it.

```ts
import type { BrowserTarget } from '@hyperbolictonic/hypagon-browser';

const target: BrowserTarget = myHost.createTarget(); // Electron, CDP, Playwright, ...
```

## The port

`BrowserTarget` is deliberately small:

| Member | Purpose |
| --- | --- |
| `id`, `kind` | stable identity for logs and marks |
| `navigate(url)` | go to a URL |
| `evaluate(script)` | run page code |
| `screenshot({ fullPage })` | PNG bytes and pixel size |
| `input(event)` | synthetic pointer/key events |
| `sendCommand(method, params, sessionId?)` | the CDP escape hatch |
| `onCdpEvent(listener)` | subscribe to CDP events; returns an unsubscribe function |
| `cookies()` | cookies the host would send |
| `url()` | the current URL |
| `close()` | release adapter resources; the host owns the view |

## The host contract

`PrimitivesHost` is what the `Primitives` facade asks its host for: evaluate,
harvest, marks, input, frames, sealed discovery, network traffic and page info.
The Electron app implements it in `src/main/chassis/interaction-stack.ts`; another
host implements the same interface.

## Using the facade

```ts
import { Primitives } from '@hyperbolictonic/hypagon-browser';

const tools = new Primitives(host);
const page = await tools.observe({ as: 'markdown' });
await tools.act({ markId: 3, action: 'click' });
const rows = await tools.extract({ kind: 'list' });
```

## What is in the package

Extracted from the app, with the app still importing through re-export shims:

- **primitives** — `observe`, `act`, `wait`, `find`, `read`, `state`, `net` and
  the `Primitives` facade.
- **targeting** — shadow-aware selectors, text anchors, control facts.
- **marks** — the Set-of-Marks injector, the overlay and the badge formatter.
- **harvesting** — composed-DOM serialisation and Readability/Turndown Markdown.
- **shadow-walk** — component signatures.

Still app-side and planned next: network capture, sealed (closed shadow
root) scanning, and the humanised input driver (which becomes
`@hyperbolictonic/hypagon-stealth`). Frame discovery, geometry and evaluation are
already here.

## Status

`0.1.0`, private. The source is exported directly as TypeScript while the seam
settles; bundling and publishing follow the first full milestone.

## Scripts

```sh
npm run typecheck:browser
npm run test:sdk
```

The tests run under plain `node --test` with type stripping, so the package stays
loadable without a bundler.
