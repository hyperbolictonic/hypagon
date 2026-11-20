/** When to use: the CSS editor popover styles. */
export const CSS_POP_CSS = `#__kuang_collab_csspop {
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
