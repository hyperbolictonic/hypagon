# @hyperbolictonic/hypagon-stealth

Humanised movement for the Hypagon browser SDK.

This package is the stealth profile that sits on top of
`@hyperbolictonic/hypagon-browser`: pointer and keyboard pacing, chaos kinematics,
the host fingerprint, human-activity detection, the consent shield and sealed
(closed shadow root) targets.

The package is Electron-free. A host supplies a `BrowserTarget`; the driver sends
CDP input through `sendCommand`.

## Movement

`generateChaosTrajectory(start, target, options)` returns the pointer path the
driver replays: one point with a delay, velocity, acceleration, curvature and a
corrective flag. It models the parts of a hand that make a path look human:

- Ornstein-Uhlenbeck pink-noise tremor;
- asymmetric log-normal acceleration and braking (minimum-jerk);
- the two-thirds power law coupling speed to curvature;
- ballistic overshoot and saccadic micro-corrections;
- a Duffing-attractor perturbation.

`generateOrganicTrajectory` is the stable alias used by the driver.

## Driver

`HumanizedInput` takes a `BrowserTarget` for every action. Optional host ports
supply what only a host knows:

- `NativeInputPort` — `sendInputEvent`-style fallbacks (`mouseMove`, `mouseButton`,
  `wheel`, `key`, `focus`, `paste`) used when CDP is unavailable;
- `ClipboardPort` — the trusted paste;
- `InputMetrics` — the host's counters (`cdp.input`, `action.click/type/scroll`).

The app adapter in `src/main/telemetry/input-simulator.ts` keeps its
`WebContents`-shaped API and supplies the Electron ports, so app call sites did not
change.

## Status

`0.1.0`, private. Extracted: the movement engine, key tables, ghost cursor,
human-activity detection, profile pacing and the portable pointer/keyboard driver.
Still app-side: the host fingerprint/profile probe, the consent shield and sealed
(closed shadow root) scanning.

## Scripts

```sh
npm run typecheck:stealth
npm run test:sdk
```
