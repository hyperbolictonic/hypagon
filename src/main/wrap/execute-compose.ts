/**
 * Phase three: render the pages, index when asked, and shape the result.
 *
 * A failure keeps the upstream excerpt and publishes AUTH_REQUIRED (never a generic error)
 * when the credential was rejected. A success records the verification timestamp, because a
 * live run is the only signal that the wrapper still works.
 */
import { clip, redactText } from './render.ts';
import { documentsToIndex, mergePages } from './pagination.ts';
import type { ExecuteDeps } from './execute-deps.ts';
import type { PageRun } from './execute-fetch.ts';
import type { ExecuteOptions, FetchedResponse, PagePlan } from './execution-types.ts';
import type { WrapPreview, WrapRunResult, WrapWrapper } from './types.ts';

/** When to use: the third phase — render pages, index when asked, and shape the result. */
export async function compose(input: {
  deps: ExecuteDeps;
  wrapper: WrapWrapper;
  options: ExecuteOptions;
  request: WrapPreview;
  plan: PagePlan;
  maxPages: number;
  itemCap: number;
  run: PageRun;
}): Promise<WrapRunResult> {
  const { deps, wrapper, options, request, plan, maxPages, itemCap, run } = input;
  const first = run.pages[0];
  const failedPage = run.failed ?? first;
  const safeFirstText = redactText(first.text, run.secretValues);
  const firstJson = run.rawPages[0];
  const rendered =
    run.rawPages.length > 1
      ? mergePages({
          wrapper,
          rawPages: run.rawPages,
          itemCap,
          maxResultChars: deps.maxResultChars,
          render: deps.render,
        })
      : deps.render(wrapper, firstJson, safeFirstText, first.contentType);

  const ok = !run.failed && run.pages.every((page) => page.response.ok);

  // Opt-in Cortex indexing (`recipe.index === "cortex"`). Best-effort: a Cortex failure
  // never turns a successful upstream call into a failure.
  let indexed: WrapRunResult['indexed'];
  if (ok && wrapper.response?.index === 'cortex' && deps.indexDocuments) {
    const documents = documentsToIndex(wrapper, rendered);
    if (documents.length > 0) {
      try {
        const chunks = await deps.indexDocuments(documents, {
          wrapperId: wrapper.id,
          wrapperName: wrapper.name,
          url: first.url,
        });
        indexed = { documents: documents.length, chunks };
      } catch (err: any) {
        indexed = { documents: documents.length, chunks: 0, error: err?.message || String(err) };
      }
    }
  }

  const result: WrapRunResult = {
    ok,
    status: failedPage.response.status,
    durationMs: run.pages.reduce((total, page) => total + page.durationMs, 0),
    wrapper: { id: wrapper.id, name: wrapper.name },
    request,
    response: {
      contentType: first.contentType || undefined,
      bytes: run.pages.reduce((total, page) => total + page.bytes, 0),
      truncated: run.pages.some((page) => page.truncated) || undefined,
      text: ok && firstJson !== undefined ? undefined : clip(safeFirstText, 1_000),
      json: options.includeRaw ? firstJson : undefined,
    },
    markdown: rendered.markdown,
    records: rendered.records,
    documents: rendered.documents,
    meta: rendered.meta,
    paging: plan.active ? { pages: run.pages.length, cap: maxPages, more: run.more } : undefined,
    indexed,
  };

  if (!ok) {
    applyFailure(result, wrapper, failedPage, run.secretValues);
  } else {
    // A live success is the verification signal surfaced as `lastVerified`.
    try {
      deps.store.touchVerified(wrapper.id);
    } catch {
      /* verification metadata is best-effort */
    }
  }

  return result;
}

/** When to use: the failure branch — AUTH_REQUIRED vs HTTP_ERROR, with an excerpt. */
function applyFailure(result: WrapRunResult, wrapper: WrapWrapper, failedPage: FetchedResponse, secretValues: string[]): void {
  const status = failedPage.response.status;
  const message = `HTTP ${status}${failedPage.response.statusText ? ` ${failedPage.response.statusText}` : ''}`;
  const excerpt = clip(redactText(failedPage.text, secretValues), 600);
  const authRejected = status === 401 || status === 403;
  const credential = wrapper.request.auth ? ` "${wrapper.request.auth}"` : '';

  if (authRejected) {
    const hint = `Credential${credential} was rejected (HTTP ${status}). Refresh it in Settings → Wrappers, or raise request_human_intervention.`;
    result.markdown = `**AUTH_REQUIRED** — ${hint}${excerpt ? `\n\n\`\`\`\n${excerpt}\n\`\`\`` : ''}`;
  } else {
    result.markdown = excerpt
      ? `**${message}**\n\n\`\`\`\n${excerpt}\n\`\`\``
      : `**${message}**`;
  }

  result.records = [];
  result.error = {
    code: authRejected ? 'AUTH_REQUIRED' : 'HTTP_ERROR',
    message: authRejected
      ? `Credential${credential} was rejected with HTTP ${status}. Refresh it in Settings → Wrappers, or raise request_human_intervention.`
      : excerpt
        ? `${message}: ${excerpt}`
        : message,
    status,
    retryable: !authRejected && (status === 429 || status >= 500),
  };
}
