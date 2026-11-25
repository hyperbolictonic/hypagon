/**
 * The ghost-cursor trail on the HUD canvas.
 *
 * Why a module: the canvas, its resize, the fading points and the animation loop are one
 * mechanism; the telemetry feed only contributes points.
 */
import { MENU_POPUP_MODE, SIDEBAR_MODE } from './mode.js';

const canvas = document.getElementById('radar-canvas') as HTMLCanvasElement;
const ctx = canvas.getContext('2d');
const cursorTrail: Array<{ x: number; y: number; alpha: number }> = [];

/** When to use: a telemetry event with coordinates — add its point to the trail. */
export function pushTrailPoint(x: number, y: number): void {
  cursorTrail.push({ x, y, alpha: 1.0 });
  if (cursorTrail.length > 40) cursorTrail.shift();
}

function resizeCanvas(): void {
  if (!canvas || !canvas.parentElement) return;
  canvas.width = canvas.parentElement.clientWidth;
  canvas.height = canvas.parentElement.clientHeight;
}

/** Render loop for the organic ghost-cursor trail. */
function renderTrail(): void {
  if (SIDEBAR_MODE || MENU_POPUP_MODE || !ctx || !canvas) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  for (let i = cursorTrail.length - 1; i >= 0; i--) {
    const pt = cursorTrail[i];
    pt.alpha -= 0.02;

    if (pt.alpha <= 0) {
      cursorTrail.splice(i, 1);
      continue;
    }

    ctx.save();
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, 4, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(0, 210, 255, ${pt.alpha})`;
    ctx.shadowColor = '#00d2ff';
    ctx.shadowBlur = 8;
    ctx.fill();
    ctx.restore();
  }

  // Draw connecting line between last points
  if (cursorTrail.length > 1) {
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(cursorTrail[0].x, cursorTrail[0].y);
    for (let i = 1; i < cursorTrail.length; i++) {
      ctx.lineTo(cursorTrail[i].x, cursorTrail[i].y);
    }
    ctx.strokeStyle = 'rgba(0, 210, 255, 0.25)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();
  }

  requestAnimationFrame(renderTrail);
}

/** When to use: the HUD boot — size the canvas and start the loop. */
export function initTrail(): void {
  window.addEventListener('resize', resizeCanvas);
  resizeCanvas();
  requestAnimationFrame(renderTrail);
}
