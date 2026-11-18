/**
 * Consent-manager fingerprints: selectors, text patterns and the marker attribute.
 *
 * These are data, not behaviour — the breaker asks "does this banner look like
 * OneTrust?", and the injected scan script ships the same tables into the page. Kept
 * apart from the breaker so the rules can be reviewed and extended without touching
 * the dismissal flow.
 *
 * When to use: adding support for a CMP, or checking what a banner must look like to
 * be recognised. Do not inline new selectors in the breaker.
 */

/**
 * When to use: resolving a known CMP banner to its reject/accept buttons.
 *
 * Vendor rules with both intents where the CMP exposes one. A real banner offers
 * "Reject all" or "Only necessary" far more often than the generic heuristics assume —
 * clicking the human's least invasive option is both more polite and more likely to
 * actually stick (an "Accept all" that the CMP re-renders is the classic on/off flicker).
 */
export const VENDOR_RULES: Array<{ framework: string; reject?: string; accept: string }> = [
  {
    framework: 'OneTrust',
    reject: '#onetrust-reject-all-handler, button#onetrust-reject-all-handler',
    accept: '#onetrust-accept-btn-handler, button#onetrust-accept-btn-handler',
  },
  {
    framework: 'Cookiebot',
    reject: '#CybotCookiebotDialogBodyButtonDecline, #CybotCookiebotDialogBodyLevelButtonLevelOptinDeclineAll',
    accept: '#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll, #CybotCookiebotDialogBodyButtonAccept',
  },
  {
    framework: 'Google',
    reject: '#W0wltc, button[aria-label*="Reject all" i]',
    accept: '#L2AGLb, button[id*="L2AGLb"], form[action*="consent"] button',
  },
  { framework: 'TrustArc', reject: '.trustarc-decline-btn', accept: '.trustarc-agree-btn, #truste-consent-button' },
  { framework: 'Civic', reject: '#ccc-reject-settings', accept: '#ccc-notify-accept, #ccc-recommended-settings' },
  { framework: 'Didomi', reject: '#didomi-notice-disagree-button', accept: '#didomi-notice-agree-button' },
  {
    framework: 'Quantcast',
    reject: '.qc-cmp2-summary-buttons button[mode="secondary"]',
    accept: '.qc-cmp2-summary-buttons button[mode="primary"]',
  },
  {
    framework: 'Generic',
    reject:
      'button[id*="reject-all" i], button[class*="reject-all" i], button[id*="decline" i], [aria-label*="reject all" i], [aria-label*="decline" i]',
    accept:
      'button[id*="cookie-accept" i], button[class*="cookie-accept" i], button[id*="accept-all" i], button[class*="accept-all" i], [aria-label*="accept all" i], [aria-label*="accept cookies" i]',
  },
];

/** When to use: recognising a "reject/decline/essential only" control on a CMP with no stable ids. */
export const REJECT_PATTERNS = [
  /^\s*(reject all|reject cookies|decline all|decline|refuse|deny|only necessary|only essential|essential only|necessary only|continue without accepting|continue without consent|disagree)\s*$/i,
  /(reject all|decline all|only necessary|essential only|continue without accepting)/i,
];

/** When to use: recognising an "accept/agree/got it" control when no reject option exists. */
export const ACCEPT_PATTERNS = [
  /^\s*(accept all|i accept|accept cookies|allow all|allow all cookies|agree and continue|agree & continue|i agree|agree|accept|got it|ok)\s*$/i,
  /(accept all|allow all|accept cookies|agree & continue|agree and continue)/i,
];

/** When to use: marking the chosen control so the in-frame fallback can find it again. */
export const MARK_ATTR = 'data-kuang-consent';
