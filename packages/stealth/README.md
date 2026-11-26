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

## Status

`0.1.0`, private. The movement engine is extracted; the pointer and keyboard
driver, profile loading, human-activity detection and sealed scanning follow.

## Scripts

```sh
npm run typecheck:stealth
npm run test:sdk
```
