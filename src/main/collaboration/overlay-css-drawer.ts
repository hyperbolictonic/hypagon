/** When to use: the note drawer's styles (mounted under its own namespaced root). */
export const DRAWER_CSS = `#__kuang_collab_drawer {
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
`;
