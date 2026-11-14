# 📐 Viewport — Responsive Device Emulation (`src/main/viewport/`)

Chromium device emulation for browsing tabs, kept separate from zoom, research and tab layout.

- **`controller.ts`** — owns the per-tab device spec, applies CDP `Emulation.setDeviceMetricsOverride`
  (falls back to `webContents.enableDeviceEmulation` when DevTools owns the debugger), re-applies after
  navigation, and computes the letterbox frame. Also maps input coordinates through the fit scale.
- **`profiles.ts`** — human-saved device profiles in `<userData>/device-profiles.json`, atomic writes,
  capped and validated. Built-ins live in `src/shared/viewport.ts`.
- The agent surface is deliberately tiny: one `browser_viewport` tool (`status` / `set` / `reset` /
  `rotate`). Profile management stays in the HUD's native `RESP` menu and dialog.
