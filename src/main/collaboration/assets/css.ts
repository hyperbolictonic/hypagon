/** When to use: injecting the shared styling for either collaboration surface. */
export const COLLAB_CSS = `
#__kuang_collab_drawer {
  position: absolute !important;
  z-index: 2147483647 !important;
  box-sizing: border-box !important;
  margin: 0 !important;
  padding: 0 !important;
  border: 0 !important;
  background: transparent !important;
  color: #e2e8f0 !important;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Ubuntu, Cantarell, 'Helvetica Neue', Arial, sans-serif !important;
  font-size: 13px !important;
  line-height: 1.45 !important;
  -webkit-font-smoothing: antialiased !important;
  pointer-events: auto !important;
  text-align: left !important;
}
#__kuang_collab_drawer .hb-card {
  position: relative;
  display: flex;
  flex-direction: column;
  width: 320px;
  max-width: calc(100vw - 24px);
  border-radius: 12px;
  background: #0d1221;
  border: 1px solid rgba(148, 163, 184, 0.22);
  box-shadow: 0 18px 44px rgba(2, 6, 23, 0.55), 0 2px 8px rgba(2, 6, 23, 0.45);
}
#__kuang_collab_drawer .hb-card.is-collapsed { width: auto; min-width: 150px; }
#__kuang_collab_drawer .hb-head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 9px 10px;
  border-bottom: 1px solid rgba(148, 163, 184, 0.16);
  cursor: grab;
  user-select: none;
}
#__kuang_collab_drawer .hb-card.is-collapsed .hb-head { border-bottom: 0; cursor: pointer; }
#__kuang_collab_drawer .hb-dot {
  flex: 0 0 auto;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #f59e0b;
  box-shadow: 0 0 0 3px rgba(245, 158, 11, 0.18);
}
#__kuang_collab_drawer .hb-title {
  flex: 0 0 auto;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #fbbf24;
  white-space: nowrap;
}
#__kuang_collab_drawer .hb-chip {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 11px;
  color: #94a3b8;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}
#__kuang_collab_drawer .hb-icon {
  flex: 0 0 auto;
  width: 24px;
  height: 24px;
  padding: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: 7px;
  background: transparent;
  color: #94a3b8;
  cursor: pointer;
}
#__kuang_collab_drawer .hb-icon:hover { background: rgba(148, 163, 184, 0.16); color: #e2e8f0; }
#__kuang_collab_drawer .hb-icon[hidden] { display: none; }
#__kuang_collab_drawer .hb-body { padding: 10px 10px 0; }
#__kuang_collab_drawer .hb-card.is-collapsed .hb-body,
#__kuang_collab_drawer .hb-card.is-collapsed .hb-foot { display: none; }
#__kuang_collab_drawer .hb-note {
  display: block;
  width: 100%;
  min-height: 88px;
  resize: none;
  background: rgba(2, 6, 23, 0.65);
  color: #e2e8f0;
  border: 1px solid rgba(148, 163, 184, 0.22);
  border-radius: 9px;
  padding: 9px 10px;
  font-family: inherit;
  font-size: 13px;
  line-height: 1.5;
  outline: none;
}
#__kuang_collab_drawer .hb-note:focus {
  border-color: rgba(245, 158, 11, 0.65);
  box-shadow: 0 0 0 3px rgba(245, 158, 11, 0.14);
}
#__kuang_collab_drawer .hb-note::placeholder { color: #64748b; }
#__kuang_collab_drawer .hb-tags {
  display: block;
  width: 100%;
  margin-top: 8px;
  background: rgba(2, 6, 23, 0.45);
  color: #e2e8f0;
  border: 1px solid rgba(148, 163, 184, 0.18);
  border-radius: 9px;
  padding: 7px 10px;
  font-family: inherit;
  font-size: 12px;
  outline: none;
}
#__kuang_collab_drawer .hb-tags:focus {
  border-color: rgba(245, 158, 11, 0.55);
  box-shadow: 0 0 0 3px rgba(245, 158, 11, 0.12);
}
#__kuang_collab_drawer .hb-tags::placeholder { color: #64748b; }
#__kuang_collab_drawer .hb-foot {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px;
}
#__kuang_collab_drawer .hb-hint {
  flex: 1 1 auto;
  font-size: 11px;
  color: #64748b;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
#__kuang_collab_drawer .hb-btn {
  flex: 0 0 auto;
  border-radius: 8px;
  padding: 7px 12px;
  font-family: inherit;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  border: 1px solid transparent;
}
#__kuang_collab_drawer .hb-ghost {
  background: rgba(148, 163, 184, 0.10);
  color: #cbd5e1;
  border-color: rgba(148, 163, 184, 0.20);
}
#__kuang_collab_drawer .hb-ghost:hover { background: rgba(148, 163, 184, 0.18); color: #e2e8f0; }
#__kuang_collab_drawer .hb-primary { background: #f59e0b; color: #0b1220; }
#__kuang_collab_drawer .hb-primary:hover { background: #fbbf24; }
#__kuang_collab_drawer .hb-arrow {
  position: absolute;
  width: 10px;
  height: 10px;
  background: #0d1221;
  border-top: 1px solid rgba(148, 163, 184, 0.22);
  border-right: 1px solid rgba(148, 163, 184, 0.22);
  display: none;
}
#__kuang_collab_drawer .hb-arrow.is-left { display: block; left: -6px; transform: rotate(135deg); }
#__kuang_collab_drawer .hb-arrow.is-right { display: block; right: -6px; transform: rotate(-45deg); }
#__kuang_collab_drawer .hb-arrow.is-up { display: block; top: -6px; transform: rotate(45deg); }
#__kuang_collab_drawer .hb-arrow.is-down { display: block; bottom: -6px; transform: rotate(225deg); }
#__kuang_collab_selection {
  position: absolute !important;
  z-index: 2147483645 !important;
  box-sizing: border-box !important;
  margin: 0 !important;
  pointer-events: none !important;
  border: 2px solid #f59e0b !important;
  border-radius: 8px !important;
  background: rgba(245, 158, 11, 0.07) !important;
  box-shadow: 0 0 0 3px rgba(245, 158, 11, 0.12), 0 0 22px rgba(245, 158, 11, 0.28) !important;
}
#__kuang_collab_selection .hb-tag {
  position: absolute;
  left: 0;
  top: -10px;
  max-width: 240px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  padding: 1px 7px;
  border-radius: 5px;
  background: #f59e0b;
  color: #0b1220;
  font: 700 10px/1.6 ui-monospace, SFMono-Regular, Menlo, monospace;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}
#__kuang_collab_selection .hb-add {
  position: absolute;
  width: 24px;
  height: 24px;
  padding: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(245, 158, 11, 0.85);
  border-radius: 8px;
  background: #0b1220;
  color: #fbbf24;
  cursor: pointer;
  pointer-events: auto !important;
  box-shadow: 0 4px 14px rgba(2, 6, 23, 0.5);
}
#__kuang_collab_selection .hb-add:hover { background: #f59e0b; color: #0b1220; }
#__kuang_collaboration_layer {
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
#__kuang_collab_elementbar {
  display: flex;
  align-items: center;
  gap: 3px;
  background: rgba(17, 22, 40, 0.96);
  border: 1px solid rgba(245, 158, 11, 0.5);
  border-radius: 10px;
  padding: 4px 5px;
  box-shadow: 0 10px 26px rgba(0, 0, 0, 0.5);
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}
#__kuang_collab_elementbar .hb-el-btn {
  width: 30px;
  height: 30px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border-radius: 8px;
  border: 1px solid rgba(245, 158, 11, 0.35);
  background: rgba(245, 158, 11, 0.12);
  color: #fbbf24;
  font-size: 13px;
  font-weight: 700;
  line-height: 1;
  cursor: pointer;
}
#__kuang_collab_elementbar .hb-el-btn:hover {
  background: rgba(245, 158, 11, 0.24);
}
#__kuang_collab_elementbar .hb-el-close {
  width: auto;
  padding: 0 8px;
  border-color: rgba(148, 163, 184, 0.3);
  background: rgba(148, 163, 184, 0.1);
  color: rgba(226, 232, 240, 0.75);
  font-size: 10px;
}
#__kuang_collab_csspop {
  position: fixed;
  z-index: 2147483647;
  width: 248px;
  padding: 10px;
  border-radius: 12px;
  border: 1px solid rgba(34, 211, 238, 0.3);
  background: rgba(13, 18, 33, 0.97);
  box-shadow: 0 14px 40px rgba(0, 0, 0, 0.55);
  color: #e2e8f0;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}
#__kuang_collab_csspop .hb-css-title {
  font-size: 10px;
  letter-spacing: 0.08em;
  color: rgba(148, 163, 184, 0.85);
  margin-bottom: 6px;
}
#__kuang_collab_csspop .hb-css-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 3px;
  margin-bottom: 7px;
  max-height: 96px;
  overflow: auto;
}
#__kuang_collab_csspop .hb-css-chip {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 2px 5px;
  border-radius: 6px;
  border: 1px solid rgba(34, 211, 238, 0.3);
  background: rgba(34, 211, 238, 0.1);
  color: #67e8f9;
  font-size: 10px;
  cursor: pointer;
}
#__kuang_collab_csspop .hb-css-chip:hover {
  background: rgba(239, 68, 68, 0.16);
  border-color: rgba(239, 68, 68, 0.45);
  color: #fca5a5;
}
#__kuang_collab_csspop .hb-css-input {
  width: 100%;
  box-sizing: border-box;
  padding: 5px 7px;
  border-radius: 7px;
  border: 1px solid rgba(148, 163, 184, 0.3);
  background: rgba(148, 163, 184, 0.08);
  color: #e2e8f0;
  font-size: 11px;
  outline: none;
}
#__kuang_collab_csspop .hb-css-input:focus {
  border-color: rgba(34, 211, 238, 0.45);
}
#__kuang_collab_csspop .hb-css-addrow {
  display: flex;
  gap: 4px;
  margin-top: 6px;
}
#__kuang_collab_csspop .hb-css-add {
  padding: 5px 9px;
  border-radius: 7px;
  border: 1px solid rgba(34, 211, 238, 0.4);
  background: rgba(34, 211, 238, 0.14);
  color: #67e8f9;
  font-size: 10px;
  cursor: pointer;
  white-space: nowrap;
}
#__kuang_collab_csspop .hb-css-send {
  margin-top: 8px;
  width: 100%;
  padding: 6px 8px;
  border-radius: 8px;
  border: 1px solid rgba(245, 158, 11, 0.5);
  background: rgba(245, 158, 11, 0.16);
  color: #fbbf24;
  font-size: 11px;
  font-weight: 700;
  cursor: pointer;
}
#__kuang_collab_csspop .hb-css-send:hover {
  background: rgba(245, 158, 11, 0.26);
}
`;
