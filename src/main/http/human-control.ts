/**
 * The human-control pause policy.
 *
 * Why a module: an explicit takeover must pause the agent's *mutations* while
 * leaving reads available so health, observations and the HIL banner still work.
 * That allowlist is the whole policy, and it is easy to widen by accident while
 * editing the main handler — so it lives here, next to the refusal it produces.
 */
import type { BrowserChassis } from '../browser-chassis.js';
import type { RouteTableContext } from './route-table.js';

/** Mutations a person's takeover must not race; everything else is refused with 409. */
const HUMAN_CONTROL_ALLOWED = new Set([
  '/health',
  '/human/status',
  '/human/takeover',
  '/human/resume',
  '/hil/active',
  '/hil/history',
  '/hil/request',
  '/hil/resolve',
  '/hil/cancel',
]);

/**
 * When to use: the top of the bridge handler — answer 409 and report true when a
 * person holds the browser and this request would mutate it. GET always passes.
 */
export function refuseWhileHumanActive(
  chassis: BrowserChassis,
  method: string | undefined,
  pathname: string,
  sendJson: RouteTableContext['sendJson'],
): boolean {
  if (!chassis.isHumanActive() || method === 'GET' || HUMAN_CONTROL_ALLOWED.has(pathname)) return false;
  sendJson(
    {
      success: false,
      error: 'HUMAN_CONTROL: a person has taken control of the browser. Wait for them to press RESUME before acting.',
      code: 'HUMAN_CONTROL',
    },
    409,
  );
  return true;
}
