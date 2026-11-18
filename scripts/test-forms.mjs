#!/usr/bin/env node
/**
 * fill_form regression test (deterministic, offline fixture).
 *
 * Exercises BrowserChassis.fillForm end-to-end through the bridge `POST /form/fill`:
 *   text input · password · textarea · select-by-value · checkbox (on and off) · radio
 *   submitSelector · missing-selector skip accounting.
 *
 * Guards against the class of bug where TypeScript syntax leaks into the injected
 * browser script (e.g. `(el as any).value` is a SyntaxError in the page and every
 * field fails): the values are read back from the live DOM, not from the tool's
 * own success flag.
 *
 * Requires the Cyberdeck Electron app running (bridge on 127.0.0.1:4111, or
 * KUANG_BRIDGE_URL). Prints SKIP and exits 0 when the bridge is down.
 *
 * Usage: node scripts/test-forms.mjs
 */
import http from 'node:http';

const BRIDGE = process.env.KUANG_BRIDGE_URL || 'http://127.0.0.1:4111';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const FIXTURE = `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>Form Fixture</title></head>
<body>
  <main>
    <h1>Form fixture</h1>
    <form id="f">
      <label>Name <input id="name" name="name" type="text"></label>
      <label>Secret <input id="secret" name="secret" type="password"></label>
      <label>Notes <textarea id="notes" name="notes"></textarea></label>
      <label>Plan
        <select id="plan" name="plan">
          <option value="">Choose…</option>
          <option value="basic">Basic</option>
          <option value="pro">Pro</option>
        </select>
      </label>
      <label><input id="tos" name="tos" type="checkbox"> Accept terms</label>
      <label><input id="optin" name="optin" type="checkbox" checked> Newsletter</label>
      <label><input id="size-s" name="size" type="radio" value="s"> S</label>
      <label><input id="size-m" name="size" type="radio" value="m"> M</label>
      <button id="submit" type="submit">Submit</button>
      <pre id="result"></pre>
    </form>
  </main>
  <script>
    document.getElementById('f').addEventListener('submit', function (e) {
      e.preventDefault();
      var f = e.target;
      document.getElementById('result').textContent = JSON.stringify({
        name: f.elements.name.value,
        secret: f.elements.secret.value,
        notes: f.elements.notes.value,
        plan: f.elements.plan.value,
        tos: f.elements.tos.checked,
        optin: f.elements.optin.checked,
        size: (f.querySelector('input[name=size]:checked') || {}).value || null,
      });
    });
  </script>
</body>
</html>`;

async function bridge(path, method = 'GET', body = null) {
  const res = await fetch(`${BRIDGE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.success === false) {
    const err = new Error(`${method} ${path} -> HTTP ${res.status}: ${json.error || json.message || 'unknown error'}`);
    err.status = res.status;
    err.body = json;
    throw err;
  }
  return json;
}

async function evaluate(script) {
  const res = await bridge('/evaluate', 'POST', { script });
  return res.result;
}

async function waitForActiveUrl(fragment, timeoutMs = 15000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const health = await bridge('/health');
      if ((health?.info?.url || '').includes(fragment)) return health.info.url;
    } catch {}
    await sleep(250);
  }
  throw new Error(`Timed out waiting for active URL to include "${fragment}"`);
}

async function main() {
  try {
    await bridge('/health');
  } catch (err) {
    console.log(`SKIP: Cyberdeck bridge not reachable at ${BRIDGE} (${err.message}). Start the app and re-run.`);
    process.exit(0);
  }

  // Typing goes through the input simulator: the window must be visible.
  await bridge('/window/visibility', 'POST', { visible: true });
  await sleep(500);

  const server = http.createServer((_req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(FIXTURE);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const url = `http://127.0.0.1:${port}/form-fixture.html`;
  const fragment = `127.0.0.1:${port}`;

  const results = [];
  const check = (name, ok, detail) => {
    results.push({ name, ok });
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  };

  let tabId = null;
  try {
    const created = await bridge('/tabs/new', 'POST', { url });
    tabId = created?.tab?.id || created?.tab?.tabId || null;
    await waitForActiveUrl(fragment);
    await sleep(500);

    // --- the happy path: every control kind in one call ---------------------
    const fill = await bridge('/form/fill', 'POST', {
      fields: {
        '#name': 'Ada Lovelace',
        '#secret': 'correct horse',
        '#notes': 'first line and second line',
        '#plan': 'pro',
        '#tos': true,
        '#optin': false, // starts checked: boolean false must untoggle it
        '#size-m': true,
        '#does-not-exist': 'skipped',
      },
    });
    // Read the live DOM, not the tool's own success flag: this is the regression
    // for injected-script failures, which report success and change nothing.
    const values = JSON.parse(
      await evaluate(`JSON.stringify({
        name: document.getElementById('name').value,
        secret: document.getElementById('secret').value,
        notes: document.getElementById('notes').value,
        plan: document.getElementById('plan').value,
        tos: document.getElementById('tos').checked,
        optin: document.getElementById('optin').checked,
        size: (document.querySelector('input[name=size]:checked') || {}).value || null,
      })`),
    );

    check(
      'fill_form fills every found field',
      fill.result?.fieldsFilled === 7 && fill.result?.details?.some((d) => /not found/.test(d)),
      `fieldsFilled=${fill.result?.fieldsFilled} of 8 selectors, details=${JSON.stringify(fill.result?.details).slice(0, 200)}`,
    );
    check(
      'typed text lands in text input and textarea',
      values.name === 'Ada Lovelace' && values.notes === 'first line and second line',
      `name="${values.name}" notes="${values.notes}"`,
    );
    check(
      'typed password lands in password input',
      values.secret === 'correct horse',
      `chars=${(values.secret || '').length}`,
    );
    check(
      'select is set by option value',
      values.plan === 'pro',
      `plan="${values.plan}"`,
    );
    check(
      'checkbox booleans toggle both ways',
      values.tos === true && values.optin === false,
      `tos=${values.tos} optin=${values.optin}`,
    );
    check(
      'radio is checked',
      values.size === 'm',
      `size=${values.size}`,
    );

    // --- submitSelector clicks submit ---------------------------------------
    const submitted = await bridge('/form/fill', 'POST', { fields: {}, submitSelector: '#submit' });
    await sleep(600);
    const after = JSON.parse(await evaluate(`document.getElementById('result').textContent || '{}'`));
    check(
      'fill_form submitSelector clicks the button',
      submitted.result?.submitted === true && after.name === 'Ada Lovelace' && after.plan === 'pro' && after.tos === true && after.optin === false && after.size === 'm',
      `submitted=${submitted.result?.submitted} page echo=${JSON.stringify(after)}`,
    );

    // --- no fields at all is still a valid call ------------------------------
    const empty = await bridge('/form/fill', 'POST', { fields: {} });
    check('fill_form with no fields succeeds without filling', empty.result?.fieldsFilled === 0 && empty.result?.submitted === false, `fieldsFilled=${empty.result?.fieldsFilled}`);
  } catch (err) {
    check('forms run', false, err.message);
  } finally {
    try { if (tabId) await bridge('/tabs/close', 'POST', { tabId }); } catch {}
    await new Promise((resolve) => server.close(resolve));
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${failed.length === 0 ? 'ALL CHECKS PASSED' : `${failed.length} CHECK(S) FAILED`} (${results.length} total)`);
  process.exit(failed.length === 0 ? 0 : 1);
}

main();
