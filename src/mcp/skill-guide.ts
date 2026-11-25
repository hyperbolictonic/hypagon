/**
 * The OKF skill guide every agent reads at `mark-eleven://skills/guide`.
 *
 * Why a module: it is ~100 lines of prose that changes for reasons no code does.
 * The text is one template with four slots; the two JEV flags only choose what goes
 * into those slots, so the prose and the policy stay apart.
 */

/** When to use: building the server — which reading path the guide should teach. */
export interface SkillGuideFlags {
  jevActive: boolean;
  jevEnforced: boolean;
}

/** The Tier-1 sentence while JEV is the reading path. */
const TIER1_JEV = 'JEV IS ACTIVE — for page CONTENT call jev_index, then read_section(section_id) for only the sections the job needs (search_page to locate text). Use observe(as:"markdown") when you must act on inline [#ID] marks or the page is small.';

/** The Tier-1 sentence while the page is read directly. */
const TIER1_PLAIN = 'observe(as:"markdown") -> clean text with inline [#ID] marks.';

/** What JEV enforces when it is on and enforcing. */
const JEV_ENFORCED = 'unscoped observe(as:"markdown"|"text") is REFUSED with code JEV_REQUIRED — call jev_index, then read_section(section_id). Scoped reads (region) and bounded reads (budget > 0, cursor) still work; full:true is the logged bypass. The depth store is per-page and in-memory, so re-run jev_index after navigation.';

/** What JEV does when it is on but not enforcing. */
const JEV_ACTIVE = 'the active page is read as an index first (jev_index), then per section (read_section). Whole-page observe(as:"markdown") is the exception for acting on marks or short pages; do not use it as the default read. The depth store is per-page and in-memory, so re-run jev_index after navigation.';

/** What to expect when JEV is off. */
const JEV_INACTIVE = 'not available. It appears (and becomes the preferred read path) once Settings → Decision Model has a configured model AND the JEV toggle is on. ENFORCE additionally refuses unscoped page dumps.';

const GUIDE_TEMPLATE = `# 🧭 MARK ELEVEN: OPERATIONAL KNOWLEDGE FORMAT (OKF)

1. [CORE ARCHITECTURE & OPERATIONAL SEQUENCE]
  - Visual Browser: Active visible Chromium window ('headless: false') with Bézier ghost-cursor telemetry.
  - Zero Context Bleed: Tools return compact 1-line markdown or distilled structures instead of raw JSON.
  - PREFERENTIAL SEQUENCE (Tokens & Anti-Shadowban):
    * TIER 1 (First Choice): {{TIER1}} Actuate via act(mark_id, action) (or act(selector) / act(x, y) when you have no badge). Zero vision tokens burned!
    * TIER 2 (Fallback): take_screenshot(marks:true, detail:"economy") -> downscaled 640px JPEG Set-of-Marks. Use ONLY when visual layout/CAPTCHA requires vision.
    * TIER 3 (Use deliberately): evaluate_javascript() -> arbitrary page JS that can read AND mutate. A powerful tool for what the primitives cannot express — prefer observe/extract for reads and act for clicks/typing, since heavy injected JS is a bot-detection signal (untrusted events).
  - Start non-trivial sessions with bridge_health() to read capabilities[], revision and input.transport.
  - QUICK DECISION ORDER (5 common jobs): read a page -> {{QUICK_ORDER}}; find an element -> find(); act -> act(mark_id | selector | x,y, action); wait -> wait_for(conditions[]); harvest a lazy list -> collect_all(). Full detail: mark-eleven://tools/recommended.
  - JEV-FIRST READING{{JEV_STATE}}: {{JEV_STATUS}}
  - DECISION-FIRST NAVIGATION (when a decision model is configured — see tools/list for decide/drive):
    * USE IT WHEN THE CHOICE IS GENUINELY AMBIGUOUS: two or more visible controls could plausibly be the right one (sort tabs, filter chips, date cells, result rows), the page is unfamiliar, or you need a judgement ("is this goal already met?"). Then: observe(as:"components") -> decide(...) -> act(mark_id) -> verify.
    * DO NOT USE IT WHEN THE ANSWER IS DETERMINISTIC: a known URL, a known form field, a stable selector, a control find(role,name) already identifies, or a step you are about to repeat mechanically. decide costs ~0.5s and a paid model call and is not reproducible; find/act/navigate are faster and exact. Rule of thumb: if exactly one control matches, do not ask.
    * One decide call answers several questions at once (operation, target, done?). ASK ALL THE HEADS TOGETHER and use only the one that matches the chosen operation: {operation: choice, click_target: choice over clickable components, type_text_target: choice over typed components, done: noul}. That is one round trip per step instead of operation-then-target, and the unused heads are discarded. Only ask for heads the page actually offers (a page with no text fields needs no type_text_target).
    * Pass guard:{components, threshold} so an answer naming a missing id or a control that cannot accept the operation is rejected instead of executed.
    * drive(goal, values?, max_steps?) is for a short, well-scoped goal with genuine ambiguity per step. It is not a retry engine: a guard rejection means fall back to observe(markdown) + find.
    * decide CHOOSES, it does not act or verify. Every decision is followed by act + expect/diff/page_state. Never treat "done" as proof — check the page.
    * HUMAN_DECISION_REQUIRED means the guarded choice did not clear its threshold. The gateway has already raised the HIL banner and will not act. Do NOT guess, do NOT retry with a lower threshold: wait for the human, then re-observe and continue (or ask them in chat if they are present).

2. [ORTHOGONAL PRIMITIVES — PREFER THESE OVER BLIND SLEEPS]
  - wait_for(conditions[], require?, timeout_ms?, poll_ms?): declarative readiness gate; returns {ok, waitedMs, attempts, results[]}. Replaces every sleep.
  - act(mark_id? | selector? | x?+y?, action, text?, secret?, clear_first?, await_conditions?, timeout_ms?, dry_run?): unified humanlike click/focus/hover/type/press on a mark badge, a CSS selector, or viewport coordinates + optional post-conditions + delta report. dry_run resolves without acting; secret redacts credentials; clear_first=true replaces a pre-filled value (Ctrl+A + Backspace) instead of appending.
  - TYPING DISCIPLINE: typing APPENDS by default. On any field that may already hold a value (pre-filled origins/airports, search boxes, comboboxes) pass clear_first=true. For an autocomplete, type then COMMIT by clicking the option mark — free text is often ignored by React selects. If a click appears to do nothing, do NOT simply re-click: check diff(since) and read the form/validation state, because an invalid field silently blocks submit and looks exactly like a dropped click.
  - expect(conditions[]): immediate assertion (no polling) with per-condition evidence.
  - find(role?, name?, contains?, regex?, tag?, selector?): semantic search -> mark refs (feed them to act).
  - extract(kind:"list"|"table"|"tables"|"app_data"|"schema_org", ref?, selector?, type?): structured read (repeating rows, one table, every table, embedded __NEXT_DATA__/JSON-LD, or typed schema.org items — pass type to keep just e.g. "Recipe").
  - collect_all(selector?, ref?, scroll?, max_scrolls?, max?): scroll a lazy/infinite list to the end and dedupe rows in ONE call, with scroll diagnostics.
  - observe(as:"markdown"|"text"|"ax"|"som", region?, budget?, cursor?): one observation model; page huge pages with budget + next_cursor.
  - read_url(url?, max_chars?, cursor?): read ANY URL as Markdown in ONE call — site-provided Markdown/Text when the site advertises it, else a detached render distilled to Markdown (your active tab is untouched); paged via max_chars + next_cursor (the result reports a machine-readable 'next_cursor=<offset>' fact when truncated). Prefer this to read a specific URL.
  - llm_surface(url?) / llm_fetch(url?, as?): the site's OWN Markdown/Text (llms.txt, <link rel=alternate> or a real <a href="….md"> page link, or negotiated) instead of a render — GATED on an advertised surface. 'recommended' is NULL when there is none (that is NOT a fetch target): follow 'next' (llm_fetch(as) or observe(as:"markdown")). Both report 'scope' (origin|page).
  - search_web(query, engine?, engines?, url_template?, max_results?): multi-engine search in a detached view with automatic fallback → ranked {title,url,snippet}; feed the URLs to navigate_to / collect_all.
  - deep_crawl(url, max_depth?, max_pages?, match_patterns?, same_origin?, prefer_llm?, harvest_to_cortex?): autonomous BFS crawl that distills + indexes each page into Cortex (cheap llm path first); scope with match_patterns.
  - research_topic(query, max_sources?, engine?, url_template?, excerpt_chars?, harvest_to_cortex?): autonomous search → gather top sources → distill → index into Cortex; returns cited EXTRACTIVE evidence (no prose — you synthesize).
  - page_state() / diff(since?): cheap change signature + field-by-field diff for loops (no full re-reads).
  - Condition vocabulary: selector / gone / text(regex) / url / role_name / count(min/equals/max) / network_idle / stable(target:"marks"|"height"|"text"|"nodes") / revision. WARNING: skeletons can satisfy a naive selector early — prefer stable/count for lazily-rendered lists.
  - Errors are machine-coded (HTTP 400): STALE_REF (re-scan), TIMEOUT, NO_TARGET, BAD_REQUEST, NOT_SUPPORTED, HUMAN_IN_PROGRESS (a person is using the browser — synthetic input is paused; poll /human/status, wait for them to go idle or for ~2s of quiet, then re-observe). See resource mark-eleven://okf/partitions/primitives-and-workflows for recipes R1-R6.

3. [VISUAL GROUNDING & SET-OF-MARKS (SoM)]
  - ONE tool, three detail levels (identical badge IDs): take_screenshot(marks:true, detail?):
    * detail="full" (default): Marks table + full-resolution PNG (for vision models).
    * detail="economy": Marks table + 640px JPEG (~10-20x lighter, recommended for vision).
    * detail="markdown": Marks table only, NO image (zero token waste; equal to observe(as:"som")).
    * plain viewport image (no badges): take_screenshot() -> 768px JPEG.
  - Actuation:
    * act(mark_id | selector | x,y, action): unified click/focus/hover/type/press with optional post-conditions. mark_id is preferred (re-resolved against the live DOM, tracks layout shifts); selector and x/y are escape hatches.
  - Accessibility & States:
    * Badge tags display roles and state: [role=combobox] {value="...", expanded=false, disabled, required}.
    * Custom selects / menus: Click mark to expand -> call observe(as:"som") -> click option mark -> verify.
    * Long/virtualized result lists: pass include_offscreen=true to take_screenshot(marks:true) / observe() so below-the-fold items are numbered too (act scrolls them into view before clicking).

4. [NETWORK INTERCEPTION & JSON NAVIGATOR]
  - Inspection:
    * get_network_traffic(resource_type?, url_pattern?, limit?, since?): Compact 1-line HTTP summaries with [HAS_BODY] indicator. since accepts epoch-ms, a revision, or "last_action" (only what the last mutating action fired).
    * Raw response body: query_json_data({ source:"network_payload", source_id:"<req_id>" }) (add path/view to slice it).
    * export_har(pattern?, limit?, save?): HAR 1.2 export (save=true writes data/har/har_<ts>.har).
  - Token-Efficient JSON Navigator (query_json_data):
    * Step 1 (Schema): query_json_data({ source: "network_payload", source_id: "<req_id>", view: "schema" }) -> outlines structure and array counts without raw dump.
    * Step 2 (Path Slice): query_json_data({ ..., path: "results.itineraries[0..3].price" }) -> slices arrays and projects nested properties.
    * Step 3 (Filter): Filter at object level before leaf projection:
      - Embedded path style: path: "vendors[?usesCookies = true].name" (filters objects, then projects name).
      - Parameter style: path: "vendors[0..10]", filter_predicate: "usesCookies == true" (do NOT pass leaf .name before filter_predicate).
    * Sources: "network_payload" (request_id), "stream_messages" (stream_id), "download_file" (filename), "inline_json" (jsonString).
    * Views: "value" (default), "schema", "keys", "summary".

5. [RENDERED SNAPSHOTS & SPECULATIVE PRERENDERING]
  - snapshot_rendered_page(format?, wait_until_idle_ms?, pierce_shadow_dom?, save_to_disk?):
    * Freezes post-hydration DOM in heavy SPAs (React, Next.js, Vue).
    * format: "ax_tree" (recommended: semantic hierarchy skipping div soup), "markdown" (clean computed text), "html".
    * Pierces #shadow-root and bakes live input values into attributes.
  - prerender_links(urls?, selector?, max_pages?, harvest_to_cortex?):
    * Speculative Pre-rendering: Pre-executes candidate links in background views for 0ms instantaneous navigation.
    * Automatically distills and embeds pages into LanceDB Cortex memory (recall_memory ready).

6. [MULTI-TAB & SESSION ORCHESTRATION]
  - Tabs: new_tab(url?) -> switch_tab(tab_id) -> list_tabs() (1-line markdown) -> close_tab(tab_id?).
  - Profiles (cookies & storage persist across runs): context_save(name) -> context_open(name) -> context_list() -> context_delete(name).
  - Legacy save_session / restore_session / list_sessions are deprecated aliases (still callable by name, hidden from tools/list).

7. [LANCEDB CORTEX & KNOWLEDGE RECALL]
  - recall_memory(query, limit?, domain?): Hybrid vector + BM25 search across all previously visited pages.
  - Bookmarks: add_bookmark(url, title, notes?, tags?) -> list_bookmarks(query?, tag?) -> delete_bookmark(url_or_id).
  - History: browsing_history(limit?, domain?) -> browsing_history_clear().

8. [REALTIME WEBSOCKETS & SSE]
  - list_realtime_streams(type?, active_only?): Lists active wss:// sockets and SSE streams.
  - Inspect stream frames with query_json_data({ source:"stream_messages", source_id:"<streamId>" }) (get_stream_messages is deprecated).

9. [INPUT DELIVERY & BACKGROUND RENDERING]
  - Synthetic input is dispatched over CDP (Input.dispatchMouseEvent / dispatchKeyEvent / mouseWheel) and is FOCUS-INDEPENDENT: clicks/typing land even when another app owns the OS foreground. bridge_health().input.transport reports "cdp" (good) or "native" (legacy fallback that needs the window focused).
  - Browsing tabs run with backgroundThrottling disabled + occlusion/renderer/timer backgrounding switches, so an occluded Cyberdeck still renders and fires scroll events (lazy-load harvests work while the window is behind your editor).
  - Viewport gating: real input needs a non-zero viewport. If a fresh/hidden tab reports 0x0, call set_window_visibility({visible:true}) and wait for a non-zero viewport. Making the window visible to a human (HIL) is the only other reason to call it.

10. [HUMAN-IN-THE-LOOP & SYSTEM TRAY]
  - request_human_intervention(reason, timeout_seconds?, bring_to_front?): PROACTIVELY CALL THIS whenever hitting Cloudflare challenges, CAPTCHAs, login/2FA screens, checkout payments, or critical blockers. Halts agent, triggers audible desktop alerts, unhides window, flashes taskbar, and presents HUD banner until user confirms.
  - set_window_visibility(visible?, focus?): Shows/restores the window (and focuses it by default) or hides it to the tray.
  - send_notification(title, message, urgency?): Native OS desktop notification.`;

function jevState(jevActive: boolean, jevEnforced: boolean): string {
  return jevActive ? (jevEnforced ? ' (ENFORCED)' : ' (ACTIVE)') : ' (inactive)';
}

function jevStatus(jevActive: boolean, jevEnforced: boolean): string {
  if (!jevActive) return JEV_INACTIVE;
  return jevEnforced ? JEV_ENFORCED : JEV_ACTIVE;
}

/** When to use: the `mark-eleven://skills/guide` resource and the help tool. */
export function buildSkillGuide(flags: SkillGuideFlags): string {
  const jevActive = flags.jevActive;
  const jevEnforced = flags.jevEnforced;
  return GUIDE_TEMPLATE
    .replace('{{TIER1}}', jevActive ? TIER1_JEV : TIER1_PLAIN)
    .replace('{{QUICK_ORDER}}', jevActive ? 'jev_index -> read_section(section_id)' : 'observe(as:"markdown")')
    .replace('{{JEV_STATE}}', jevState(jevActive, jevEnforced))
    .replace('{{JEV_STATUS}}', jevStatus(jevActive, jevEnforced));
}

/** When to use: `mark-eleven://tools/recommended` and help(category:"recommended"). */
export const RECOMMENDED_ORDER = `# Mark Eleven — Recommended Tool Order

Reach for these first; anything whose description starts with \`[TIER n]\` is a fallback.

| Job | Use | Fallback |
| :--- | :--- | :--- |
| Decide what to click on a busy page | \`observe(as:"components")\` → \`decide\` → \`act(mark_id)\` | \`observe(as:"markdown")\` + \`find\` |
| Run a short, well-scoped goal | \`drive(goal, values?, max_steps?)\` | the manual decide loop above |
| Read / understand a page | \`observe(as:"markdown")\` | \`take_screenshot(marks:true, detail:"economy")\` |
| Read a URL as Markdown (site-provided or rendered) | \`read_url(url)\` | \`llm_surface\` → \`llm_fetch\` → \`observe(as:"markdown")\` |
| Find an element | \`find(...)\` | \`observe(as:"som")\` and read the \`[#ID]\` |
| Act on an element | \`act(mark_id, action)\` | \`act(selector)\` / \`act(x, y)\` |
| Wait for readiness | \`wait_for(conditions[])\` | — |
| Harvest a lazy list | \`collect_all(...)\` | \`observe\` + \`scroll_page\` |

Rules of thumb:
- Never \`sleep\`; use \`wait_for\` or \`act(await_conditions=[...])\`.
- Ask \`decide\` only when the choice is ambiguous (2+ plausible controls, unfamiliar page, or a "is it done?" judgement). One matching control means \`find\` + \`act\` — that is faster, deterministic and free.
- Guard every decision with the component list so it cannot invent a target, and verify the outcome (\`expect\`, \`diff\`, or the delta \`act\` returns) — decide chooses, it does not act or prove.
- Prefer act() over \`evaluate_javascript\` (TIER 3): CDP input is the humanlike path, and heavy injected JS is a bot-detection signal — it stays available for what the primitives cannot express.
- Prefer \`observe\` over screenshots; prefer a mark id over a CSS selector.
- Use \`expect(...)\` to assert now, \`page_state()\`/\`diff(since)\` to confirm change cheaply.
`;
