# @hyperbolictonic/hypagon-research

Portable research for the Hypagon browser SDK: a multi-engine search hub, a
bounded crawler, the researcher that escalates between tiers, and citation
anchors.

The package is host-agnostic. It never opens a window and never imports Electron;
the host supplies the ports:

- `SearchHubDeps.load(url, script, opts)` — render a search page and run the
  extractor (a detached view, a headless browser, or `fetch`).
- `CrawlerDeps` — `renderPage`, `fetchStatic`, `tryLlm`, `indexPage`, `beforePage`,
  plus the log.
- The anchors use `hypagon-scrap` for the fingerprint comparison.

## Search

```ts
import { SearchHub } from '@hyperbolictonic/hypagon-research';

const hub = new SearchHub({ load: (url, script) => renderer.load(url, script) });
const outcome = await hub.search('who won the 2024 election', {
  engines: ['duckduckgo', 'brave', 'google'],
});
```

Each attempt is reported, so a bot-check falls through to the next engine instead
of failing the turn. The `custom` engine takes a `{query}` URL template (for a
self-hosted SearXNG), which also makes the hub testable offline.

## Crawl

`Crawler` walks same-host links breadth-first with depth/page caps, static-first
rendering and optional LLM/static fallbacks. `linksFromMarkdown`, `normalizeUrl`
and `matchesAnyPattern` are exported for callers that build their own queue.

## Researcher

`Researcher` runs a query, crawls the chosen result, and escalates tiers (search →
crawl → hand-off) while emitting `ResearchEvent`s. The host decides how each tier
is performed.

## Citations

`AnchorStore` persists citation fingerprints (the host passes the file), and
`CitationAnchors` revalidates them against a narrow `fetch(url)` port while tracking
warm origins. `relocateCitation` / `anchorHighlights` do the matching through
`hypagon-scrap`.

## Status

`0.1.0`, private. Extracted from the Hypagon Gateway app; the app keeps its
Electron surfaces, settings, detached view, hand-off and citation controllers and
imports these modules through re-export shims.

## Scripts

```sh
npm run typecheck:research
npm run test:sdk
```
