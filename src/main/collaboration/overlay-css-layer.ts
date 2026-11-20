/** When to use: the thread overlay layer (cards, connectors, active state). */
export const LAYER_CSS = `#__kuang_collaboration_layer {
  position: fixed;
  inset: 0;
  z-index: 2147483646;
  pointer-events: none;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Ubuntu, Cantarell, 'Helvetica Neue', Arial, sans-serif;
}
#__kuang_collaboration_layer .hb-box {
  position: absolute;
  box-sizing: border-box;
  border: 2px dashed rgba(34, 211, 238, 0.85);
  border-radius: 8px;
  background: rgba(34, 211, 238, 0.05);
  box-shadow: 0 0 18px rgba(34, 211, 238, 0.22);
}
#__kuang_collaboration_layer .hb-agent {
  position: absolute;
  box-sizing: border-box;
  width: 250px;
  max-width: calc(100vw - 24px);
  padding: 9px 11px;
  border-radius: 10px;
  background: #0d1221;
  border: 1px solid rgba(34, 211, 238, 0.32);
  box-shadow: 0 14px 34px rgba(2, 6, 23, 0.5);
  pointer-events: auto;
  cursor: pointer;
}
#__kuang_collaboration_layer .hb-agent-head {
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #22d3ee;
}
#__kuang_collaboration_layer .hb-agent-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #22d3ee;
  box-shadow: 0 0 0 3px rgba(34, 211, 238, 0.18);
}
#__kuang_collaboration_layer .hb-agent-id {
  margin-left: auto;
  color: #64748b;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-weight: 500;
}
#__kuang_collaboration_layer .hb-resolve {
  display: none;
  align-items: center;
  justify-content: center;
  width: 21px;
  height: 21px;
  padding: 0;
  border: 1px solid rgba(34, 197, 94, 0.45);
  border-radius: 6px;
  background: rgba(34, 197, 94, 0.12);
  color: #86efac;
  font: 700 12px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  cursor: pointer;
  pointer-events: auto;
}
#__kuang_collaboration_layer.is-collab-active .hb-resolve { display: inline-flex; }
#__kuang_collaboration_layer .hb-resolve:hover { background: rgba(34, 197, 94, 0.24); }
#__kuang_collaboration_layer .hb-resolve:disabled { opacity: 0.6; cursor: wait; }
#__kuang_collaboration_layer .hb-agent-body {
  margin-top: 6px;
  color: #cbd5e1;
  font-size: 12px;
  line-height: 1.45;
  white-space: pre-wrap;
  word-break: break-word;
}
#__kuang_collaboration_layer .hb-agent-body.is-clamped {
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
#__kuang_collaboration_layer .hb-agent-arrow {
  position: absolute;
  width: 10px;
  height: 10px;
  background: #0d1221;
  border-top: 1px solid rgba(34, 211, 238, 0.32);
  border-right: 1px solid rgba(34, 211, 238, 0.32);
}
#__kuang_collaboration_layer .hb-box.hb-human {
  border-color: rgba(245, 158, 11, 0.85);
  background: rgba(245, 158, 11, 0.05);
  box-shadow: 0 0 18px rgba(245, 158, 11, 0.2);
}
#__kuang_collaboration_layer .hb-agent.hb-human { border-color: rgba(245, 158, 11, 0.35); }
#__kuang_collaboration_layer .hb-agent.hb-human .hb-agent-head { color: #f59e0b; }
#__kuang_collaboration_layer .hb-agent.hb-human .hb-agent-dot {
  background: #f59e0b;
  box-shadow: 0 0 0 3px rgba(245, 158, 11, 0.18);
}
#__kuang_collaboration_layer .hb-agent.hb-human .hb-agent-arrow {
  border-color: rgba(245, 158, 11, 0.35);
}
#__kuang_collaboration_layer .hb-box.hb-focus-ring {
  border-width: 3px;
  border-color: rgba(245, 158, 11, 0.95);
  box-shadow: 0 0 0 4px rgba(245, 158, 11, 0.28), 0 0 26px rgba(245, 158, 11, 0.35);
}
#__kuang_collaboration_layer .hb-box.hb-flash {
  animation: hb-thread-flash 1500ms ease-out;
}
@keyframes hb-thread-flash {
  0% { box-shadow: 0 0 0 6px rgba(245, 158, 11, 0.55); }
  100% { box-shadow: 0 0 18px rgba(245, 158, 11, 0.2); }
}
/* Element selection keeps a persistent amber outline so the human always
   knows which element the collab toolbar is attached to. */
.hb-el-selected {
  outline: 2px solid rgba(245, 158, 11, 0.9) !important;
  outline-offset: 1px;
}
`;
