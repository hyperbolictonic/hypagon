/**
 * Boot loops.
 *
 * The uptime tick and the HUD watchdog are the only periodic work the chassis
 * starts at construction. They read the host contract, so they live here rather
 * than as chassis methods.
 */
import type { ChassisHost } from '../chassis/host.js';

/** When to use: the chassis constructor — start the uptime tick and the HUD watchdog. */
export function startLoops(host: ChassisHost): void {
  setInterval(() => {
    host.state.stats.uptimeSeconds++;
    host.telemetry.broadcastState();
  }, 1000);

  // A renderer can stop painting without exiting. The watchdog reloads it once
  // if the heartbeat goes quiet while the window is visible.
  host.hud.start();
}
