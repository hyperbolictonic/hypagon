/**
 * Argument normalisation shared by the tool catalog.
 *
 * Agents reach for whatever synonym the prompt used (`url`, `destination`,
 * `target`, `link`, `href`, `address`) and often omit the scheme. Both rules
 * were pasted into every navigation payload, so a fix to one — a new alias, a
 * new allowed scheme — would have missed the others.
 */

/**
 * When to use: a navigation tool payload — normalise the URL aliases and add a
 * scheme when one is missing. Returns '' when the agent supplied no URL.
 */
export function normaliseUrl(args: any): string {
  let url = args?.url || args?.destination || args?.target || args?.link || args?.href || args?.address || '';
  if (typeof url === 'string' && url) {
    if (!/^https?:\/\//i.test(url) && !/^about:/i.test(url) && !/^mark-eleven:/i.test(url)) {
      url = 'https://' + url;
    }
  }
  return url;
}

/**
 * When to use: a navigation tool that cannot work without a URL — normalise the
 * aliases, then reject an empty result with the message agents already retry on.
 */
export function requireUrl(args: any): string {
  const url = normaliseUrl(args);
  if (!url) {
    throw new Error('Missing destination URL. Please provide { "url": "https://..." }');
  }
  return url;
}
