/**
 * Pointer noise models: the chaotic and stochastic motion sources behind the
 * humanised cursor path.
 *
 * Three pieces, each with one job: Box-Muller Gaussian noise, a mean-reverting
 * Ornstein-Uhlenbeck tremor, and a Duffing attractor for non-periodic wandering.
 * The trajectory composer in chaos-kinematics.ts samples these.
 *
 * When to use: generating tremor/wander for a synthetic pointer path, or tuning how
 * chaotic a path feels. Never use these for anything security-sensitive.
 */

/** When to use: a 2-D point or offset in CSS pixels. */
export interface Point {
  x: number;
  y: number;
}

/** When to use: drawing one standard-normal sample (Box-Muller) for the noise models. */
export function gaussianRandom(): number {
  let u = 0;
  let v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

/**
 * When to use: adding physiological tremor to a path — a continuous mean-reverting
 * process (muscle elasticity / tendon friction), i.e. 1/f pink noise.
 */
export class OrnsteinUhlenbeckNoise {
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
 * When to use: making a path wander non-periodically (Duffing attractor, RK4-integrated):
 * dx/dt = y, dy/dt = -delta*y - alpha*x - beta*x^3 + gamma*cos(omega*t).
 */
export class DuffingAttractor {
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
