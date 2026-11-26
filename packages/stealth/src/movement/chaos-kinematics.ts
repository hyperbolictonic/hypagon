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

export interface Point {
  x: number;
  y: number;
}

/** When to use: a generated pointer path — one point plus its delay, velocity and curvature. */
export interface PathStep extends Point {
  delayMs: number;
  velocity: number; // pixels per ms
  acceleration?: number; // px/ms^2
  curvature?: number; // 1/radius
  isCorrective?: boolean; // true during saccadic post-overshoot recoil
}

/** When to use: tuning `generateChaosTrajectory` — step count, deviation, pacing and noise. */
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

/**
 * Standard Normal Gaussian Random Generator via Box-Muller Transform
 */
function gaussianRandom(): number {
  let u = 0;
  let v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

/**
 * 2D Ornstein-Uhlenbeck Stochastic Process for Physiological Tremor ($1/f$ Pink Noise)
 * Continuous mean-reverting process simulating muscle elasticity and tendon friction.
 */
class OrnsteinUhlenbeckNoise {
  private x: number = 0;
  private y: number = 0;
  private theta: number = 0.65; // Mean reversion speed
  private sigma: number = 0.85; // Volatility / tremor amplitude

  constructor(theta?: number, sigma?: number) {
    if (theta !== undefined) this.theta = theta;
    if (sigma !== undefined) this.sigma = sigma;
  }

  public next(dt: number = 0.5): Point {
    // dX = -theta * X * dt + sigma * sqrt(dt) * dW
    this.x += -this.theta * this.x * dt + this.sigma * Math.sqrt(dt) * gaussianRandom();
    this.y += -this.theta * this.y * dt + this.sigma * Math.sqrt(dt) * gaussianRandom();
    return { x: this.x, y: this.y };
  }
}

/**
 * Duffing Chaotic Attractor for Non-Periodic Trajectory Wandering
 * dx/dt = y
 * dy/dt = -delta*y - alpha*x - beta*x^3 + gamma*cos(omega*t)
 */
class DuffingAttractor {
  private x: number = 0.1;
  private y: number = 0.0;
  private t: number = 0.0;

  // Classic chaotic parameters
  private delta: number = 0.25;
  private alpha: number = -1.0;
  private beta: number = 1.0;
  private gamma: number = 0.3;
  private omega: number = 1.0;

  constructor() {
    this.x = 0.05 + (Math.random() - 0.5) * 0.1;
    this.y = (Math.random() - 0.5) * 0.1;
    this.t = Math.random() * Math.PI * 2;
  }

  public step(dt: number = 0.05): number {
    // RK4 Integration for numerical stability
    const fx = (y: number) => y;
    const fy = (x: number, y: number, t: number) =>
      -this.delta * y - this.alpha * x - this.beta * x * x * x + this.gamma * Math.cos(this.omega * t);

    const k1x = fx(this.y);
    const k1y = fy(this.x, this.y, this.t);

    const k2x = fx(this.y + 0.5 * dt * k1y);
    const k2y = fy(this.x + 0.5 * dt * k1x, this.y + 0.5 * dt * k1y, this.t + 0.5 * dt);

    const k3x = fx(this.y + 0.5 * dt * k2y);
    const k3y = fy(this.x + 0.5 * dt * k2x, this.y + 0.5 * dt * k2y, this.t + 0.5 * dt);

    const k4x = fx(this.y + dt * k3y);
    const k4y = fy(this.x + dt * k3x, this.y + dt * k3y, this.t + dt);

    this.x += (dt / 6) * (k1x + 2 * k2x + 2 * k3x + k4x);
    this.y += (dt / 6) * (k1y + 2 * k2y + 2 * k3y + k4y);
    this.t += dt;

    return this.x;
  }
}

/**
 * Calculates a point on a cubic Bézier curve.
 */
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

/** The geometry one glide needs, decided once before the samples are walked. */
interface PathPlan {
  start: Point;
  target: Point;
  /** Where the ballistic phase aims: the target, or a little past it when overshooting. */
  primaryTarget: Point;
  cp1: Point;
  cp2: Point;
  /** Unit normal to the path, for the drift and tremor offsets. */
  normalX: number;
  normalY: number;
  baseSteps: number;
  shouldOvershoot: boolean;
  features: {
    pinkNoise: boolean;
    asymmetricVelocity: boolean;
    twoThirdsLaw: boolean;
    chaoticAttractor: boolean;
  };
}

/**
 * Decide the curve: the overshoot, the control points and the step count.
 *
 * The random draws here are ordered exactly as they were inline (overshoot, jitter,
 * then the two control-point gaussians) so a seeded glide is byte-identical.
 */
function planPath(start: Point, target: Point, distance: number, options: ChaosKinematicsOptions): PathPlan {
  const enablePinkNoise = options.enablePinkNoise ?? true;
  const enableAsymmetricVelocity = options.enableAsymmetricVelocity ?? true;
  const enableTwoThirdsLaw = options.enableTwoThirdsLaw ?? true;
  const enableOvershoot = options.enableOvershoot ?? true;
  const enableChaoticAttractor = options.enableChaoticAttractor ?? true;

  // Determine if this movement warrants an organic ballistic overshoot (>130px distance)
  const shouldOvershoot = enableOvershoot && distance > 130 && Math.random() < 0.75;
  const overshootDistance = shouldOvershoot ? 3 + Math.random() * 5 : 0;

  // Direction vector and its perpendicular normal
  const unitDirX = (target.x - start.x) / distance;
  const unitDirY = (target.y - start.y) / distance;
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

  return {
    start,
    target,
    primaryTarget,
    cp1: {
      x: start.x + (target.x - start.x) * 0.28 + normalX * curveMag1,
      y: start.y + (target.y - start.y) * 0.28 + normalY * curveMag1,
    },
    cp2: {
      x: start.x + (target.x - start.x) * 0.72 + normalX * curveMag2,
      y: start.y + (target.y - start.y) * 0.72 + normalY * curveMag2,
    },
    normalX,
    normalY,
    baseSteps,
    shouldOvershoot,
    features: {
      pinkNoise: enablePinkNoise,
      asymmetricVelocity: enableAsymmetricVelocity,
      twoThirdsLaw: enableTwoThirdsLaw,
      chaoticAttractor: enableChaoticAttractor,
    },
  };
}

/** The state the chaos perturbations carry from sample to sample. */
interface ChaosClock {
  ou: OrnsteinUhlenbeckNoise;
  duffing: DuffingAttractor;
}

/** The two chaos offsets for one sample: a Duffing wander and an OU tremor. */
function perturbation(plan: PathPlan, clock: ChaosClock, rawT: number): { x: number; y: number } {
  // Chaos Perturbation 1: Duffing Attractor Wandering (scaled to micro-pixels)
  let chaosOffset = 0;
  if (plan.features.chaoticAttractor) {
    const attractorVal = clock.duffing.step(0.04);
    // Wandering is higher mid-flight and settles at start/end
    const envelope = Math.sin(rawT * Math.PI);
    chaosOffset = attractorVal * envelope * 2.8;
  }

  // Chaos Perturbation 2: Ornstein-Uhlenbeck Pink Tremor Noise
  let tremor: Point = { x: 0, y: 0 };
  if (plan.features.pinkNoise) {
    // Tremor dampens as the cursor hones into the target
    const endDamping = Math.max(0.12, 1 - rawT * 0.85);
    const rawTremor = clock.ou.next(0.4);
    tremor = { x: rawTremor.x * endDamping, y: rawTremor.y * endDamping };
  }

  return { x: plan.normalX * chaosOffset + tremor.x, y: plan.normalY * chaosOffset + tremor.y };
}

/**
 * One sample's timing: an asymmetric minimum-jerk speed profile, the two-thirds power
 * law curvature adjustment and the braking phase, all in milliseconds.
 */
function sampleTiming(args: {
  rawT: number;
  index: number;
  trajectory: PathStep[];
  start: Point;
  prevPoint: Point;
  current: Point;
  prevVelocity: number;
  features: PathPlan['features'];
}): { delayMs: number; velocity: number; acceleration: number } {
  const { rawT, index, trajectory, start, prevPoint, current, prevVelocity, features } = args;
  const stepDist = Math.hypot(current.x - prevPoint.x, current.y - prevPoint.y);

  // Human Timing via Asymmetric Velocity & Two-Thirds Power Law
  // Ballistic peak occurs around 30% progress
  let speedProfile = Math.sin(Math.pow(rawT, 0.65) * Math.PI);
  speedProfile = Math.max(0.15, speedProfile);

  // Two-Thirds Power Law curvature adjustment
  let curvatureFactor = 1.0;
  if (features.twoThirdsLaw && index > 1) {
    const v1 = { x: prevPoint.x - (trajectory[index - 2]?.x || start.x), y: prevPoint.y - (trajectory[index - 2]?.y || start.y) };
    const v2 = { x: current.x - prevPoint.x, y: current.y - prevPoint.y };
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
  const acceleration = parseFloat(((velocity - prevVelocity) / (stepDelay || 1)).toFixed(3));
  return { delayMs: stepDelay, velocity, acceleration };
}

/**
 * Phase 1: the ballistic reach.
 *
 * Each sample is the Bézier point plus the chaos offsets, timed by the profile above.
 * The draws stay in their original order (Duffing, then tremor) so a seeded glide is
 * reproducible.
 */
function reachPhase(plan: PathPlan): PathStep[] {
  const { start, baseSteps } = plan;
  const trajectory: PathStep[] = [];
  const clock: ChaosClock = { ou: new OrnsteinUhlenbeckNoise(0.7, 0.9), duffing: new DuffingAttractor() };

  let prevPoint = start;
  let prevVelocity = 0;

  for (let i = 0; i <= baseSteps; i++) {
    const rawT = i / baseSteps;
    const progress = plan.features.asymmetricVelocity ? asymmetricMinimumJerk(rawT) : rawT * rawT * (3 - 2 * rawT);
    const basePoint = cubicBezier(start, plan.cp1, plan.cp2, plan.primaryTarget, progress);
    const offset = perturbation(plan, clock, rawT);

    const current = { x: Math.round(basePoint.x + offset.x), y: Math.round(basePoint.y + offset.y) };
    const timing = sampleTiming({
      rawT,
      index: i,
      trajectory,
      start,
      prevPoint,
      current,
      prevVelocity,
      features: plan.features,
    });

    trajectory.push({ ...current, ...timing, isCorrective: false });
    prevPoint = current;
    prevVelocity = timing.velocity;
  }

  return trajectory;
}

/**
 * Phase 2: the saccadic micro-correction, when the ballistic phase overshot.
 *
 * An exponential pull back to the exact target after a short neural reaction pause.
 */
function correctionPhase(plan: PathPlan, trajectory: PathStep[]): void {
  const { target } = plan;
  const overshootEnd = trajectory[trajectory.length - 1];
  const recoilSteps = 8 + Math.floor(Math.random() * 5); // 8-12 corrective micro-steps (~40-80ms)
  // Brief neural reaction pause (35-65ms) where eye detects overshoot
  const hesitationDelay = 35 + Math.floor(Math.random() * 30);
  let prevX = overshootEnd.x;
  let prevY = overshootEnd.y;

  for (let j = 1; j <= recoilSteps; j++) {
    const recoilT = j / recoilSteps;
    // Exponential dampening pull back to exact target centroid
    const recoilProgress = 1 - Math.exp(-3.5 * recoilT);

    const rx = Math.round(overshootEnd.x + (target.x - overshootEnd.x) * recoilProgress);
    const ry = Math.round(overshootEnd.y + (target.y - overshootEnd.y) * recoilProgress);

    const rDist = Math.hypot(rx - prevX, ry - prevY);
    const rDelay = j === 1 ? hesitationDelay : Math.max(8, Math.round(14 - j * 0.4));
    const rVelocity = parseFloat((rDist / rDelay).toFixed(2));

    trajectory.push({
      x: rx,
      y: ry,
      delayMs: rDelay,
      velocity: rVelocity,
      isCorrective: true,
    });

    prevX = rx;
    prevY = ry;
  }
}

/**
 * Generates an advanced bio-kinematic trajectory incorporating chaos math,
 * fractional Brownian motion, and biological human motor neuroscience.
 *
 * Why it reads as steps: the curve is planned once, the ballistic reach is walked, the
 * saccadic correction follows only after an overshoot, and the last point is pinned to
 * the target. Each step is a function, so a change to the timing cannot perturb the
 * geometry (or the order of the random draws).
 */
export function generateChaosTrajectory(
  start: Point,
  target: Point,
  options: ChaosKinematicsOptions = {}
): PathStep[] {
  const distance = Math.hypot(target.x - start.x, target.y - start.y);

  if (distance === 0) {
    return [{ x: target.x, y: target.y, delayMs: 16, velocity: 0 }];
  }

  const plan = planPath(start, target, distance, options);
  const trajectory = reachPhase(plan);
  if (plan.shouldOvershoot) correctionPhase(plan, trajectory);

  // Guarantee absolute precision at final coordinate
  if (trajectory.length > 0) {
    trajectory[trajectory.length - 1].x = target.x;
    trajectory[trajectory.length - 1].y = target.y;
  }

  return trajectory;
}
