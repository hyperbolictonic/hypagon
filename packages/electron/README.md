# @hyperbolictonic/hypagon-electron

The Electron adapter for the Hypagon browser SDK.

`ElectronTarget` implements `BrowserTarget` over a `WebContents`. It imports
Electron types only, so the class unit-tests with a fake `WebContents` under plain
`node --test`.

```ts
import { ElectronTarget } from '@hyperbolictonic/hypagon-electron';

const target = new ElectronTarget(view.webContents);
await target.navigate('https://example.test/');
const shot = await target.screenshot({ fullPage: true });
```

## Behaviour

- **Viewport screenshots** use `capturePage()`.
- **Full-page screenshots** go through CDP `Page.captureScreenshot` with
  `captureBeyondViewport`, and the pixel size is read from the PNG `IHDR` header.
- **Input** maps to CDP `Input.dispatchMouseEvent` / `Input.dispatchKeyEvent`.
- **`sendCommand`** is the raw `webContents.debugger` passthrough. The optional
  session argument is omitted from the call when it is `undefined`.
- **CDP events** subscribe to the debugger `message` channel; the returned
  function removes the listener.
- **Cookies** are mapped to the portable shape, defaulting the optional Electron
  fields. `no_restriction` becomes `sameSite: 'none'`; an unknown value is omitted.

The host still owns the `WebContents` and the `WebContentsView`; `close()` only
releases adapter-held resources.

## Status

`0.1.0`, private. `electron` is an optional peer dependency, so a headless host
never installs it.

## Scripts

```sh
npm run typecheck:electron
npm run test:sdk
```
