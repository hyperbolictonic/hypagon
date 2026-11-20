/**
 * Phase two: follow the recipe's pagination.
 *
 * Each page is fetched under the policy, audited, and redacted before its payload is kept.
 * A rejected OAuth2 credential is re-minted once; after that the page is returned as a
 * failure and the run stops. A link page must stay on the wrapper's origin.
 */
import { parseJson, redactDeep, safeHost, secretVariants } from './render.ts';
import { fetchWithPolicy, sameOrigin } from './response.ts';
import { itemsOf, nextPageToken } from './pagination.ts';
import type { buildRequest } from './interpolate.ts';
import type { ExecuteDeps } from './execute-deps.ts';
import type { Prepared } from './execute-prepare.ts';
import type { FetchedResponse, PagePlan } from './execution-types.ts';
import type { WrapWrapper } from './types.ts';

/** When to use: the second phase's state — pages, their parsed payloads, and the paging flag. */
export interface PageRun {
  pages: FetchedResponse[];
  rawPages: unknown[];
  more: boolean;
  failed?: FetchedResponse;
  url: string;
  secretValues: string[];
}

/** When to use: offset/cursor/link paging — the URL (and offset) for the next page. */
function nextPage(plan: PagePlan, url: string, next: string | true, offset: number): { url: string; offset: number } {
  if (plan.type === 'link') return { url: String(next), offset };
  const pageUrl = new URL(url);
  let nextOffset = offset;
  if (plan.type === 'offset') {
    nextOffset = offset + plan.pageSize;
    pageUrl.searchParams.set(plan.offsetParam ?? 'offset', String(nextOffset));
    if (plan.limitParam) pageUrl.searchParams.set(plan.limitParam, String(plan.pageSize));
  } else if (plan.type === 'cursor') {
    pageUrl.searchParams.set(plan.cursorParam ?? 'cursor', String(next));
  }
  return { url: pageUrl.toString(), offset: nextOffset };
}

/** When to use: the second phase — follow pages, audit each hop, refresh a rejected credential once. */
export async function fetchPages(input: {
  deps: ExecuteDeps;
  wrapper: WrapWrapper;
  built: ReturnType<typeof buildRequest>;
  plan: PagePlan;
  maxPages: number;
  itemCap: number;
  prepared: Prepared;
  startUrl: string;
}): Promise<PageRun> {
  const { deps, wrapper, built, plan, maxPages, itemCap, prepared, startUrl } = input;
  const run: PageRun = {
    pages: [],
    rawPages: [],
    more: false,
    url: startUrl,
    secretValues: prepared.secretValues,
  };
  let offset = 0;
  let accumulated = 0;
  let authRetried = false;
  let secretHeader = prepared.secretHeader;

  for (let index = 0; index < maxPages; index++) {
    const fetched = await fetchWithPolicy(deps.policy, wrapper, { ...built, url: run.url }, secretHeader);
    const pageOk = fetched.response.ok;

    deps.audit?.append({
      wrapper: wrapper.id,
      host: safeHost(fetched.url),
      method: built.method,
      status: fetched.response.status,
      ok: pageOk,
      bytes: fetched.bytes,
      durationMs: fetched.durationMs,
      code: pageOk ? undefined : 'HTTP_ERROR',
    });

    if (!pageOk) {
      // One re-mint for an OAuth2 credential the API rejected, then give up with AUTH_REQUIRED.
      const rejected = fetched.response.status === 401 || fetched.response.status === 403;
      if (rejected && prepared.secretRefreshable && !authRetried && wrapper.request.auth && deps.secrets) {
        authRetried = true;
        const refreshed = await deps.secrets.resolve(wrapper.request.auth, safeHost(run.url), { forceRefresh: true });
        if (refreshed.ok && refreshed.header && refreshed.value !== undefined) {
          built.headers[refreshed.header] = refreshed.value;
          secretHeader = refreshed.header;
          run.secretValues = secretVariants(refreshed.value);
          index -= 1; // retry this page once
          continue;
        }
      }
      run.pages.push(fetched);
      run.failed = fetched;
      break;
    }

    run.pages.push(fetched);

    const json = parseJson(fetched.text, fetched.contentType);
    const safeJson = json === undefined ? undefined : redactDeep(json, run.secretValues);
    run.rawPages.push(safeJson);

    if (!plan.active) break;

    // Auto-paging only makes sense for a list selection.
    const items = itemsOf(wrapper.response, safeJson);
    if (!items || items.length === 0) {
      run.more = false;
      break;
    }
    accumulated += items.length;

    const next = nextPageToken(plan, safeJson, items.length);
    if (next === null) {
      run.more = false;
      break;
    }
    if (accumulated >= itemCap || index + 1 >= maxPages) {
      run.more = true;
      break;
    }

    if (plan.type === 'link') {
      const candidate = String(next);
      // A page link must stay on the origin the wrapper was written for.
      if (!sameOrigin(candidate, built.url)) {
        run.more = true;
        break;
      }
      run.url = candidate;
    } else {
      const advanced = nextPage(plan, run.url, next, offset);
      run.url = advanced.url;
      offset = advanced.offset;
    }
    run.more = true;
  }

  return run;
}
