import { DuffingAttractor, OrnsteinUhlenbeckNoise, gaussianRandom, type Point } from './pointer-noise.js';

export type { Point } from './pointer-noise.js';

/**
 * Kuang Grade Mark Eleven — Bio-Kinematic Chaos & Neuromotor Mouse Engine
 *
 * Implements advanced biological physics, fractal chaos mathematics, and human motor
 * control neuroscience to defeat sophisticated behavioral anti-bot sensors (Cloudflare
 * Turnstile, Datadome, Akamai, Kasada, PerimeterX).
 *
 * Biological & Mathematical Foundations:
 * 1. Ornstein-Uhlenbeck Stochastic Drift: Mean-reverting pink noise (1/f) for physiological muscle tremor.
 * 2. Flash & Hogan Minimum Jerk + Asymmetric Log-Normal Velocity: Ballistic reach (30%) + visual braking (70%).
 * 3. The Two-Thirds Power Law: Biomechanical speed-curvature coupling (v ~ k^(-1/3)).
 * 4. Target Overshoot & Saccadic Recoil: Momentum overshoot with corrective micro-adjustments.
 * 5. Duffing Strange Attractor Perturbation: Non-periodic deterministic chaotic wandering.
 */

export interface PathStep extends Point {
  delayMs: number;
  velocity: number; // pixels per ms
  acceleration?: number; // px/ms^2
  curvature?: number; // 1/radius
  isCorrective?: boolean; // true during saccadic post-overshoot recoil
}

/** When to use: tuning the Bezier pointer path (distance, chaos, device). */
export interface ChaosKinematicsOptions {
  steps?: number;
  deviationMultiplier?: number;
  baseDelayMs?: number;
  enablePinkNoise?: boolean;
  enableAsymmetricVelocity?: boolean;
  enableTwoThirdsLaw?: boolean;
  enableOvershoot?: boolean;
  enableChaoticAttractor?: boolean;
}

function cubicBezier(p0: Point, p1: Point, p2: Point, p3: Point, t: number): Point {
  const oneMinusT = 1 - t;
  const oneMinusT2 = oneMinusT * oneMinusT;
  const oneMinusT3 = oneMinusT2 * oneMinusT;
  const t2 = t * t;
  const t3 = t2 * t;

  return {
    x: oneMinusT3 * p0.x + 3 * oneMinusT2 * t * p1.x + 3 * oneMinusT * t2 * p2.x + t3 * p3.x,
    y: oneMinusT3 * p0.y + 3 * oneMinusT2 * t * p1.y + 3 * oneMinusT * t2 * p2.y + t3 * p3.y,
  };
}

/**
 * Flash & Hogan Minimum Jerk trajectory polynomial (5th-order) with asymmetric skew.
 * Pure minimum-jerk: s(tau) = 10*tau^3 - 15*tau^4 + 6*tau^5 for tau in [0, 1].
 * Skewed by exponent gamma to produce asymmetric acceleration:
 *   - Fast, explosive ballistic reach (~30% duration)
 *   - Extended sensory deceleration & braking (~70% duration)
 */
function asymmetricMinimumJerk(t: number, skew: number = 0.72): number {
  const skewedT = Math.pow(Math.max(0, Math.min(1, t)), skew);
  const tau2 = skewedT * skewedT;
  const tau3 = tau2 * skewedT;
  const tau4 = tau3 * skewedT;
  const tau5 = tau4 * skewedT;

  return 10 * tau3 - 15 * tau4 + 6 * tau5;
}

/**
 * Generates an advanced bio-kinematic trajectory incorporating chaos math,
 * fractional Brownian motion, and biological human motor neuroscience.
 */
export function generateChaosTrajectory(
  start: Point,
  target: Point,
  options: ChaosKinematicsOptions = {}
): PathStep[] {
  const dx = target.x - start.x;
  const dy = target.y - start.y;
  const distance = Math.hypot(dx, dy);

  if (distance === 0) {
    return [{ x: target.x, y: target.y, delayMs: 16, velocity: 0 }];
  }

  const enablePinkNoise = options.enablePinkNoise ?? true;
  const enableAsymmetricVelocity = options.enableAsymmetricVelocity ?? true;
  const enableTwoThirdsLaw = options.enableTwoThirdsLaw ?? true;
  const enableOvershoot = options.enableOvershoot ?? true;
  const enableChaoticAttractor = options.enableChaoticAttractor ?? true;

  // Determine if this movement warrants an organic ballistic overshoot (>130px distance)
  const shouldOvershoot = enableOvershoot && distance > 130 && Math.random() < 0.75;
  const overshootDistance = shouldOvershoot ? 3 + Math.random() * 5 : 0;

  // Direction vector
  const unitDirX = dx / distance;
  const unitDirY = dy / distance;

  // Perpendicular normal vector
  const normalX = -unitDirY;
  const normalY = unitDirX;

  // Primary arrival target (overshoot point if applicable)
  const primaryTarget: Point = shouldOvershoot
    ? {
        x: target.x + unitDirX * overshootDistance + normalX * (Math.random() - 0.5) * 2,
        y: target.y + unitDirY * overshootDistance + normalY * (Math.random() - 0.5) * 2,
      }
    : { ...target };

  // Dynamic step count based on Fitts' Index of Difficulty: ID = log2(2D / W)
  const baseSteps = options.steps ?? Math.max(38, Math.min(140, Math.floor(distance / 5.2)));
  const deviation = options.deviationMultiplier ?? 0.22;

  // Control points with organic asymmetrical deviation
  const curveMag1 = (gaussianRandom() * 0.4 - 0.15) * distance * deviation;
  const curveMag2 = (gaussianRandom() * 0.4 - 0.15) * distance * deviation;

  const cp1: Point = {
    x: start.x + dx * 0.28 + normalX * curveMag1,
    y: start.y + dy * 0.28 + normalY * curveMag1,
  };

  const cp2: Point = {
    x: start.x + dx * 0.72 + normalX * curveMag2,
    y: start.y + dy * 0.72 + normalY * curveMag2,
  };

  const trajectory: PathStep[] = [];
  const ouNoise = new OrnsteinUhlenbeckNoise(0.7, 0.9);
  const duffing = new DuffingAttractor();

  let prevPoint = start;
  let prevVelocity = 0;

  // Phase 1: Ballistic Reach Trajectory
  for (let i = 0; i <= baseSteps; i++) {
    const rawT = i / baseSteps;
    const progress = enableAsymmetricVelocity ? asymmetricMinimumJerk(rawT) : rawT * rawT * (3 - 2 * rawT);

    const basePoint = cubicBezier(start, cp1, cp2, primaryTarget, progress);

    // Chaos Perturbation 1: Duffing Attractor Wandering (scaled to micro-pixels)
    let chaosOffset = 0;
    if (enableChaoticAttractor) {
      const attractorVal = duffing.step(0.04);
      // Wandering is higher mid-flight and settles at start/end
      const envelope = Math.sin(rawT * Math.PI);
      chaosOffset = attractorVal * envelope * 2.8;
    }

    // Chaos Perturbation 2: Ornstein-Uhlenbeck Pink Tremor Noise
    let tremor: Point = { x: 0, y: 0 };
    if (enablePinkNoise) {
      // Tremor dampens as the cursor hones into the target
      const endDamping = Math.max(0.12, 1 - rawT * 0.85);
      const rawTremor = ouNoise.next(0.4);
      tremor = {
        x: rawTremor.x * endDamping,
        y: rawTremor.y * endDamping,
      };
    }

    const currentX = Math.round(basePoint.x + normalX * chaosOffset + tremor.x);
    const currentY = Math.round(basePoint.y + normalY * chaosOffset + tremor.y);

    const stepDist = Math.hypot(currentX - prevPoint.x, currentY - prevPoint.y);

    // Human Timing via Asymmetric Velocity & Two-Thirds Power Law
    // Ballistic peak occurs around 30% progress
    let speedProfile = Math.sin(Math.pow(rawT, 0.65) * Math.PI);
    speedProfile = Math.max(0.15, speedProfile);

    // Two-Thirds Power Law curvature adjustment
    let curvatureFactor = 1.0;
    if (enableTwoThirdsLaw && i > 1) {
      const v1 = { x: prevPoint.x - (trajectory[i - 2]?.x || start.x), y: prevPoint.y - (trajectory[i - 2]?.y || start.y) };
      const v2 = { x: currentX - prevPoint.x, y: currentY - prevPoint.y };
      const mag1 = Math.hypot(v1.x, v1.y) || 1;
      const mag2 = Math.hypot(v2.x, v2.y) || 1;
      const dot = (v1.x * v2.x + v1.y * v2.y) / (mag1 * mag2);
      const angle = Math.acos(Math.max(-1, Math.min(1, dot)));
      const localCurvature = angle / (stepDist || 1);
      // v ~ kappa^(-1/3) => delay ~ kappa^(1/3)
      curvatureFactor = 1.0 + Math.pow(Math.min(localCurvature * 10, 2.5), 1 / 3) * 0.35;
    }

    // Base delay between 11ms and 26ms
    let stepDelay = Math.max(9, Math.round((20 / (speedProfile + 0.3)) * curvatureFactor));

    // Deceleration braking phase towards primary target
    if (rawT > 0.85) {
      stepDelay = Math.round(stepDelay * (1.1 + (rawT - 0.85) * 2));
    }

    const velocity = stepDelay > 0 ? parseFloat((stepDist / stepDelay).toFixed(2)) : 0;
    const accel = parseFloat(((velocity - prevVelocity) / (stepDelay || 1)).toFixed(3));

    trajectory.push({
      x: currentX,
      y: currentY,
      delayMs: stepDelay,
      velocity,
      acceleration: accel,
      isCorrective: false,
    });

    prevPoint = { x: currentX, y: currentY };
    prevVelocity = velocity;
  }

  // Phase 2: Saccadic Micro-Correction Loop (if overshoot occurred)
  if (shouldOvershoot) {
    const recoilSteps = 8 + Math.floor(Math.random() * 5); // 8-12 corrective micro-steps (~40-80ms)
    const overshootEnd = trajectory[trajectory.length - 1];

    // Brief neural reaction pause (35-65ms) where eye detects overshoot
    const hesitationDelay = 35 + Math.floor(Math.random() * 30);

    for (let j = 1; j <= recoilSteps; j++) {
      const recoilT = j / recoilSteps;
      // Exponential dampening pull back to exact target centroid
      const recoilProgress = 1 - Math.exp(-3.5 * recoilT);

      const rx = Math.round(overshootEnd.x + (target.x - overshootEnd.x) * recoilProgress);
      const ry = Math.round(overshootEnd.y + (target.y - overshootEnd.y) * recoilProgress);

      const rDist = Math.hypot(rx - prevPoint.x, ry - prevPoint.y);
      const rDelay = j === 1 ? hesitationDelay : Math.max(8, Math.round(14 - j * 0.4));
      const rVelocity = parseFloat((rDist / rDelay).toFixed(2));

      trajectory.push({
        x: rx,
        y: ry,
        delayMs: rDelay,
        velocity: rVelocity,
        isCorrective: true,
      });

      prevPoint = { x: rx, y: ry };
    }
  }

  // Guarantee absolute precision at final coordinate
  if (trajectory.length > 0) {
    trajectory[trajectory.length - 1].x = target.x;
    trajectory[trajectory.length - 1].y = target.y;
  }

  return trajectory;
}
