/** When to use: the selection outline and element bar styles. */
export const SELECTION_CSS = `#__kuang_collab_selection {
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
`;
