/**
 * The WEB STATE tab: breadcrumbs, cookies and the two storages for the active page.
 *
 * Why a module: it is one read-then-render pass over `getWebState`, and the LOGS tab asks it to
 * refresh when a human opens that tab.
 */

/** When to use: the WEB STATE refresh button and the LOGS tab. */
export async function refreshWebState(): Promise<void> {
  const target = document.getElementById('webstate-view');
  if (!target) return;
  const result = await window.electronAPI?.getWebState();
  if (!result?.ok || !result.state) {
    target.textContent = result?.error || 'Web state unavailable — the deck needs an active page.';
    return;
  }
  const s = result.state;
  target.replaceChildren();

  const section = (heading: string): HTMLElement => {
    const head = document.createElement('div');
    head.className = 'text-[10px] uppercase tracking-wider text-base-content/45 mt-1';
    head.textContent = heading;
    target.append(head);
    return head;
  };
  const row = (value: string, klass = 'text-base-content/80 break-all'): void => {
    const el = document.createElement('div');
    el.className = klass;
    el.textContent = value;
    target.append(el);
  };

  section('URL');
  row(s.url, 'text-accent break-all');
  if (s.title) row('“' + s.title + '”', 'text-base-content/60');
  if (s.crumbs.length) {
    section('Crumbs');
    row(s.crumbs.join('  ›  '), 'text-base-content/70');
  }
  section('Cookies (' + s.cookies.length + ')');
  if (s.cookies.length) {
    const wrap = document.createElement('div');
    wrap.className = 'flex flex-wrap gap-1';
    for (const cookie of s.cookies) {
      const chip = document.createElement('span');
      chip.className = 'px-1.5 py-0.5 rounded border border-base-300 bg-base-200/50';
      chip.textContent = cookie.name + (cookie.httpOnly ? ' ⚿' : '');
      chip.title = cookie.domain + (cookie.httpOnly ? ' · httpOnly' : '');
      wrap.append(chip);
    }
    target.append(wrap);
  } else {
    row('none visible', 'text-base-content/40');
  }
  section('Local storage (' + Object.keys(s.local).length + ')');
  const localKeys = Object.keys(s.local);
  if (localKeys.length) {
    for (const key of localKeys.slice(0, 12)) {
      row(key + ' = ' + (s.local[key] || '""'), 'text-base-content/70 break-all');
    }
    if (localKeys.length > 12) row('… ' + (localKeys.length - 12) + ' more', 'text-base-content/35');
  } else {
    row('empty', 'text-base-content/40');
  }
  section('Session storage (' + Object.keys(s.session).length + ')');
  const sessionKeys = Object.keys(s.session);
  if (sessionKeys.length) {
    for (const key of sessionKeys.slice(0, 12)) {
      row(key + ' = ' + (s.session[key] || '""'), 'text-base-content/70 break-all');
    }
    if (sessionKeys.length > 12) row('… ' + (sessionKeys.length - 12) + ' more', 'text-base-content/35');
  } else {
    row('empty', 'text-base-content/40');
  }
}

/** When to use: the HUD boot — wire the refresh button and the events disclosure. */
export function initWebState(): void {
  document.getElementById('webstate-refresh-btn')?.addEventListener('click', () => void refreshWebState());
  document.getElementById('webstate-events-toggle')?.addEventListener('click', (event) => {
    const button = event.currentTarget as HTMLButtonElement;
    const events = document.getElementById('webstate-events');
    const open = Boolean(events?.classList.contains('hidden'));
    events?.classList.toggle('hidden', !open);
    button.setAttribute('aria-expanded', String(open));
  });
}
