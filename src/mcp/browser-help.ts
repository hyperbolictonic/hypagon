/**
 * The `help` tool: the OKF guide, or one category's cheatsheet.
 *
 * Category texts are static and travel with the bundle, so `help(category)` works with the
 * bridge down.
 */
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { RECOMMENDED_ORDER } from './browser-guide.js';

/** When to use: once at boot, with the already-rendered guide text. */
export function registerHelpTool(server: McpServer, guide: string): void {
  // Built-in help tool
  server.tool(
    'help',
    'Returns a categorized guide, cheatsheet, and workflow tips for all available Hypagon Browser MCP tools (served directly in OKF).',
    {
      category: z.enum([
        'all',
        'recommended',
        'navigation',
        'interaction',
        'primitives',
        'inspection',
        'tabs',
        'memory',
        'macros',
        'network',
        'system',
        'skills'
      ]).optional().default('all').describe('Optional category to filter help'),
    },
    async ({ category }) => {
      if (category && category !== 'all') {
        const docs: Record<string, string> = {
          recommended: RECOMMENDED_ORDER,
          navigation: `### Navigation Tools\n- navigate_to(url, auto_dismiss_consent?): Navigates active browser window to URL and auto-clears cookie overlays.\n- navigate_history(direction: "back" | "forward"): Moves back or forward in history.`,
          interaction: `### Interaction & Telemetry Tools\n- act(mark_id? | selector? | x?+y?, action, text?, secret?, await_conditions?, dry_run?): unified humanlike click/focus/hover/type/press with optional post-conditions and a before/after delta (the preferred way to interact).\n- press_key(key): Dispatches single hardware keys ('Enter', 'Tab', 'Escape', 'Backspace').\n- scroll_page(direction?, amount?): Simulates organic inertial wheel scrolling.\n- fill_form(fields, submit_selector?): Populates multiple form inputs in a single turn.`,
          primitives: `### Orthogonal Primitives (prefer over blind sleeps)\n- bridge_health(): version, revision, capabilities[], window, input.transport.\n- wait_for(conditions[], require?, timeout_ms?, poll_ms?): declarative readiness gate (replaces sleeps).\n- act(mark_id? | selector? | x?+y?, action, text?, secret?, await_conditions?, timeout_ms?, dry_run?): unified click/focus/hover/type/press (mark badge, CSS selector, or coordinates) + post-conditions + delta. Selectors pierce open shadow roots and resolve a custom-element host to the control a mouse would hit. Typing is verified: a provable no-op returns ok:false with error.code TYPE_NO_EFFECT plus a typing evidence object (key counts, value lengths — never the text) and a hint that says whether input never arrived or the control refuses it (OTP → request_human_intervention).\n- expect(conditions[]): immediate assertion with per-condition evidence.\n- decide(state, questions?, model?): OPTIONAL typed decision model (absent unless a backend is configured; see Settings). One call, many questions: choice (takes criteria, option->description — NOT options), score, noul. Returns answers + confidence verbatim; never called implicitly; an answer is a component id, never a selector. Loop: observe(as:"components") -> decide -> act(mark_id) -> verify. GET /decisions lists the last 50 calls.\n- find(role?, name?, contains?, regex?, tag?, selector?): semantic search -> mark refs.\n- extract(kind:"list"|"table"|"tables"|"app_data"|"schema_org", ref?, selector?, type?): structured reads (rows, tables, every table, embedded JSON, typed JSON-LD).\n- collect_all(selector?, ref?, scroll?, max_scrolls?, max?): harvest a lazy/infinite list in one call.\n- observe(as:"markdown"|"text"|"ax"|"som", region?, budget?, cursor?): budgeted, cursor-paged observation. markdown reads the COMPOSED DOM (open shadow roots, live form values, passwords as a length only); its envelope reports reader/extracted_chars/page_chars/shadow_roots; it returns a 25,000-char default view (budget:0 = the whole construct) and a partly-visible or text-free page says so.
- read_url(url?, max_chars?, cursor?): read ANY URL as Markdown in one call (site-provided Markdown/Text when advertised, else a detached render); always returns text, paged via max_chars + next_cursor.\n- llm_surface(url?): checks whether a site publishes an LLM-friendly Markdown/Text surface (/llms.txt, /sitemap.xml, <link rel=alternate> or a real <a href="….md"> page link, or content negotiation) and returns recommended ("llms_txt"|"llms_full"|"markdown"|"text", or NULL when there is none), scope (origin|page) and next (the unambiguous next step).
- llm_fetch(url?, as?): fetches that advertised representation (GATED — NO_LLM_SURFACE when nothing is advertised, or when recommended is null). Reports scope + scope_mismatch. For a normal rendered page use observe(as:"markdown") or read_url.\n- page_state() / diff(since?): cheap change detection for loops.\n- export_har(pattern?, limit?, save?): HAR 1.2 export. context_save/open/list/delete(name): cookie+storage profiles.\n- Condition vocabulary: selector/gone/text/regex/url/role_name/count/network_idle/stable/revision. Errors: STALE_REF|TIMEOUT|NO_TARGET|BAD_REQUEST|NOT_SUPPORTED|NO_LLM_SURFACE|FETCH_BLOCKED.`,
          inspection: `### Visual & Content Inspection\n- observe(as:"markdown"|"text"|"ax"|"som", region?, budget?, cursor?): primary budgeted read/projection (preferred over get_page_markdown).\n- take_screenshot(marks?, detail?, include_offscreen?, max_width?, format?, quality?): plain viewport image, or Set-of-Marks when marks=true with detail "full"|"economy"|"markdown".\n- snapshot_rendered_page(format?, wait_until_idle_ms?, pierce_shadow_dom?): Freezes dynamic post-hydration JS-heavy pages (AX tree outline, rendered markdown, or HTML).\n- prerender_links(urls?, selector?, max_pages?, harvest_to_cortex?): Pre-executes and hydrates candidate links in background views for 0ms navigation and Cortex pre-harvest.\n- evaluate_javascript(script): Evaluates arbitrary JS in the active tab (can read AND mutate). Powerful — reach for it deliberately; observe/extract cover most reads and act covers clicks/typing, and injected JS is a bot-detection signal.\n- bridge_health(): version, revision, capabilities, window, input.transport (replaces get_page_info).\n- get_console_logs(limit?): Returns live browser console logs.\n- act(mark_id | selector | x,y, action): the single interaction entry point; address by Set-of-Marks badge, CSS selector, or viewport coordinates.
- read_url(url?, max_chars?, cursor?) / llm_surface(url?) / llm_fetch(url?, as?): read a URL as Markdown — site's OWN Markdown/Text (llms.txt, sitemap, <link rel=alternate> or a real <a href="….md"> link, or negotiated) instead of rendering the page; gated on an advertised surface (recommended null means "none — render"), else observe(as:"markdown"). read_url is the one-call composite.
- search_web(query, engine?, engines?, url_template?, max_results?): multi-engine web search (google|duckduckgo|bing|brave|startpage|custom) run in a detached view with automatic fallback; returns ranked {title,url,snippet}.
- deep_crawl(url, max_depth?, max_pages?, match_patterns?, same_origin?, prefer_llm?, harvest_to_cortex?): autonomous BFS crawl; distills each page to Markdown and indexes it into Cortex (cheap llm path first).
- research_topic(query, max_sources?, engine?, url_template?): autonomous search → gather top sources → distill → index into Cortex; returns cited EXTRACTIVE evidence (you write the answer).`,
          tabs: `### Multi-Tab Orchestration\n- new_tab(url?): Opens a new tab.\n- switch_tab(tab_id): Focuses a specific tab.\n- close_tab(tab_id?): Closes a tab.\n- list_tabs(): Returns all open tabs.`,
          memory: `### LanceDB Cortex & Bookmarks\n- recall_memory(query, limit?, domain?): Hybrid vector + BM25 search across all previously browsed pages.\n- add_bookmark(url, title, notes?, tags?): Saves a research bookmark to LanceDB.\n- list_bookmarks(query?, tag?, limit?): Filters saved bookmarks by query terms (title/notes/URL/tags) or exact tag, ranked by relevance; lists recent when query is omitted.\n- delete_bookmark(url_or_id): Removes a bookmark.\n- browsing_history(limit?, domain?): Chronological browsing history.`,
          macros: `### Script Vault & Macro Engine\n- save_script(name, description, code, parameters?): Vaults a reusable DOM script into LanceDB.\n- list_scripts(query?, tag?, limit?): Lists or searches vaulted scripts (query ranks by relevance).\n- run_script(name, args?): Executes vaulted script inside the live tab.\n- delete_script(name): Removes a vaulted script.`,
          network: `### Network & Stream Interception\n- get_network_traffic(url_pattern?, method?, resource_type?, limit?): Inspects HTTP requests/responses (returns compact 1-line markdown summaries).\n- query_json_data({ source:"network_payload", source_id }): raw JSON response body, sliced by path/view.\n- query_json_data(source, source_id?, path?, view?, filter_predicate?, max_items?, max_string_length?): Token-efficient JSON navigator. Extracts nested paths (e.g. "items[0..3].price"), distills schemas, filters arrays, and avoids context blowups. Sources: "network_payload", "stream_messages", "download_file", "inline_json".\n- list_realtime_streams(type?, active_only?): Lists active wss:// WebSockets and SSE streams.\n- Inspect stream frames via query_json_data({ source:"stream_messages", source_id:"<streamId>" }).\n- clear_capture(scope?): Clears captured HTTP traffic ("network"), WS/SSE frames ("streams"), or both ("all", default).`,
          system: `### System Tray & Human-In-The-Loop\n- set_window_visibility(visible?, focus?): Shows/restores the window (and focuses it by default) or hides it to the system tray.\n- configure_system_tray(close_to_tray?): Configures close-to-tray background mode.\n- request_human_intervention(reason, timeout_seconds?, bring_to_front?): Alerts user with desktop notification, HUD banner, and unhides window when login/CAPTCHA is needed.\n- get_human_activity(): Reports the passive human-takeover window that blocks synthetic input (distinct from HIL requests).\n- resume_agent(): Clears that passive takeover window after the human confirms they are done. It does not resolve a pending HIL request.\n- send_notification(title, message, urgency?, sound?): Sends native OS notification.`,
          skills: `### Installable Skills\n- hb-browser: https://raw.githubusercontent.com/hyperbolictonic/hypagon/main/skills/hb-browser/SKILL.md\n- hb-wrap: https://raw.githubusercontent.com/hyperbolictonic/hypagon/main/skills/hb-wrap/SKILL.md\n- Hermes: hermes skills install <raw-url>\n- Skills CLI: npx skills add hyperbolictonic/hypagon --skill hb-browser\n- Skills CLI: npx skills add hyperbolictonic/hypagon --skill hb-wrap\n- MCP resources are not auto-installed as Hermes skills; use the raw GitHub URL.`
        };
        return { content: [{ type: 'text', text: docs[category] || 'Category not found.' }] };
      }

      return {
        content: [
          {
            type: 'text',
            text: guide
          }
        ]
      };
    }
  );
}
