# 📑 Kuang Grade Mark Eleven — Multi-Tab Manager (`src/main/tabs/`)

This directory contains the tabbed browsing orchestration layer, designed around Electron's modern, hardware-accelerated `WebContentsView` architecture.

---

## 🏛️ Key Capabilities

1. **Native `WebContentsView` Isolation**:
   Replaces deprecated `BrowserView` with native `WebContentsView` instances attached to the `mainWindow.contentView`. Each tab retains an independent navigation stack, separate DOM tree, and isolated JavaScript execution context.
2. **Zero-Flicker Hardware Swapping**:
   Active tab transitions are performed by bringing the target view to the top of the view hierarchy, eliminating White/Dark flash artifacts common in legacy webview wrappers.
3. **Popup & `target="_blank"` Trapping**:
   Hooks into `setWindowOpenHandler` and `did-create-window` to catch ordinary external links and spawn them as managed child tabs inside the Cyberdeck tab bar instead of opening unmanaged OS windows. Sign-in popups (OAuth/SAML authorization URLs, `window.open` with window features, and form POSTs) are the exception: they open as a real child window so `window.opener` survives, the provider's `postMessage` reaches the originating tab, and `window.close()` returns focus to the browser when the flow ends.
4. **Display-Scale Page Zoom**:
   Applies the app-wide page-zoom policy on every new document and tab switch, with `Ctrl+=` / `Ctrl+-` / `Ctrl+0` handled as browser input. The fitted default keeps CSS pixels aligned with physical pixels on scaled displays; the toolbar can switch back to Windows scale.
5. **Calibrated Viewport Background**:
   Initializes views with `#f4f4f5` (soft matte zinc gray), ensuring raw unstyled HTML sites (like `motherfuckingwebsite.com`) are fully legible with sharp black text without harsh pure-white screen glare.

---

## 📄 Source Files

- **[`tab-manager.ts`](./tab-manager.ts)**:
  Defines the `TabManager` and `TabInstance` abstractions. Handles tab creation, tab switching, tab closure, geometry recalculation on window resize, and fallback navigation to `mark-eleven://manual`.
- **[`window-open-policy.ts`](./window-open-policy.ts)**:
  Pure classifier for `window.open()` / `target="_blank"` requests: decides whether a request stays a managed tab or becomes a real child window (so sign-in popups keep their opener), and parses the requested popup size.
