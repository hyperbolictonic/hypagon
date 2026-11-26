/**
 * The in-page ghost cursor: a full-viewport canvas drawing the phosphor trail, the
 * click ripple and the arrow pointer.
 *
 * Why a module: it is ~100 lines of page JavaScript, not process logic. The pointer
 * controller only decides when to install it.
 */

export const VISUAL_CURSOR_SCRIPT = `
        (() => {
          if (window.__kuangCursorActive) return;
          window.__kuangCursorActive = true;

          const canvas = document.createElement('canvas');
          canvas.id = '__kuang_ghost_cursor_canvas';
          canvas.style.position = 'fixed';
          canvas.style.top = '0';
          canvas.style.left = '0';
          canvas.style.width = '100vw';
          canvas.style.height = '100vh';
          canvas.style.pointerEvents = 'none';
          canvas.style.zIndex = '2147483647';
          document.documentElement.appendChild(canvas);

          const ctx = canvas.getContext('2d');
          let trail = [];
          let currentPos = { x: -100, y: -100, isCorrective: false };
          let ripple = null;

          function resize() {
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
          }
          window.addEventListener('resize', resize);
          resize();

          window.__kuangMoveCursor = (x, y, isCorrective) => {
            currentPos = { x, y, isCorrective };
            trail.push({ x, y, alpha: 1.0, isCorrective });
            if (trail.length > 20) trail.shift();
          };

          window.__kuangClickCursor = (x, y) => {
            ripple = { x, y, radius: 4, alpha: 1.0 };
          };

          function render() {
            ctx.clearRect(0, 0, canvas.width, canvas.height);

            // Draw fading phosphor trail
            for (let i = 0; i < trail.length; i++) {
              const p = trail[i];
              p.alpha *= 0.88;
              if (p.alpha > 0.05) {
                ctx.beginPath();
                ctx.arc(p.x, p.y, 2.5 * p.alpha, 0, Math.PI * 2);
                ctx.fillStyle = p.isCorrective
                  ? \`rgba(245, 158, 11, \${p.alpha * 0.9})\`
                  : \`rgba(0, 210, 255, \${p.alpha * 0.8})\`;
                ctx.fill();
              }
            }
            trail = trail.filter(p => p.alpha > 0.05);

            // Draw click ripple
            if (ripple) {
              ctx.beginPath();
              ctx.arc(ripple.x, ripple.y, ripple.radius, 0, Math.PI * 2);
              ctx.strokeStyle = \`rgba(245, 158, 11, \${ripple.alpha})\`;
              ctx.lineWidth = 2;
              ctx.stroke();
              ripple.radius += 2.5;
              ripple.alpha *= 0.88;
              if (ripple.alpha <= 0.05) ripple = null;
            }

            // Draw Cyberdeck Neon Arrow Pointer
            if (currentPos.x >= 0) {
              const cx = currentPos.x;
              const cy = currentPos.y;

              ctx.save();
              ctx.translate(cx, cy);
              ctx.beginPath();
              ctx.moveTo(0, 0);
              ctx.lineTo(0, 16);
              ctx.lineTo(4, 12);
              ctx.lineTo(8, 19);
              ctx.lineTo(11, 17);
              ctx.lineTo(7, 10);
              ctx.lineTo(13, 10);
              ctx.closePath();
              ctx.fillStyle = currentPos.isCorrective ? '#f59e0b' : '#00d2ff';
              ctx.shadowColor = currentPos.isCorrective ? '#f59e0b' : '#00d2ff';
              ctx.shadowBlur = 10;
              ctx.fill();
              ctx.strokeStyle = '#ffffff';
              ctx.lineWidth = 1;
              ctx.stroke();
              ctx.restore();
            }

            requestAnimationFrame(render);
          }
          requestAnimationFrame(render);
        })()
`;
