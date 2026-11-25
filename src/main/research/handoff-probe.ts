/**
 * The page probe that decides whether a human can actually do anything: a CAPTCHA
 * widget, a credential/OTP field, a form, or an explicit verify/continue control —
 * as opposed to a bare 403 with no controls.
 *
 * Why a module: it is one page-side program, kept next to the hand-off so the
 * selector lists can be read (and changed) without the orchestration around them.
 */

/** When to use: `HumanHandoff.probeActionable` — the actionable-page probe. */
export const ACTIONABLE_PROBE = `(() => {
      const visible = (el) => {
        try {
          const r = el.getBoundingClientRect();
          if (r.width < 4 || r.height < 4) return false;
          const s = getComputedStyle(el);
          return s.visibility !== 'hidden' && s.display !== 'none' && Number(s.opacity) > 0.05;
        } catch (e) { return false; }
      };
      const anyVisible = (sel) => {
        try {
          for (const el of document.querySelectorAll(sel)) if (visible(el)) return true;
        } catch (e) {}
        return false;
      };

      const captcha = [
        'iframe[src*="challenges.cloudflare.com"]',
        'iframe[src*="hcaptcha.com"]',
        'iframe[src*="recaptcha"]',
        'iframe[src*="captcha"]',
        '.cf-turnstile', '.h-captcha', '.g-recaptcha', '[data-sitekey]',
      ].find(anyVisible);

      const credential = [
        'input[type="password"]',
        'input[autocomplete="one-time-code"]',
        'input[name*="otp" i]',
        'input[name*="code" i]',
        'input[type="email"]',
      ].find(anyVisible);

      const form = anyVisible('form') && anyVisible('form button, form input[type="submit"]');
      const control = anyVisible('button, [role="button"], input[type="submit"], input[type="checkbox"], input[type="radio"]');
      const text = (document.body ? document.body.innerText : '').toLowerCase();
      const verify = /verify|human|robot|check|continue|login|sign in|unusual traffic|challenge/.test(text);
      const hardBlock =
        /access denied|request blocked|you have been blocked|forbidden|banned|not allowed|ip has been/.test(text) &&
        !captcha && !credential && !form;

      if (captcha) return { actionable: true, why: 'captcha widget' };
      if (credential) return { actionable: true, why: 'credential/OTP field' };
      if (form) return { actionable: true, why: 'form' };
      if (hardBlock) return { actionable: false, why: 'hard block with no controls' };
      if (control && verify) return { actionable: true, why: 'interactive control' };
      return { actionable: false, why: 'no interactive element' };
    })()`;
