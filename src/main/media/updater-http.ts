/**
 * The two HTTP calls the media updater makes: the release API and the checksum
 * file.
 *
 * Why a module: both are a UA, a timeout and an ok-check, and the updater's
 * class should only know *what* to fetch. `fetchImpl` is a parameter so the unit
 * tests can drive them without a network.
 */

const USER_AGENT = 'hypagon-gateway-media-updater';

/** When to use: the GitHub release lookup — JSON with the GitHub media type. */
export async function requestReleaseJson<T>(fetchImpl: typeof fetch, url: string, timeoutMs: number): Promise<T> {
  const response = await fetchImpl(url, {
    headers: { Accept: 'application/vnd.github+json', 'User-Agent': USER_AGENT },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) throw new Error(`GitHub API responded ${response.status}`);
  return (await response.json()) as T;
}

/** When to use: downloading the checksum list — plain text, redirects followed. */
export async function requestReleaseText(fetchImpl: typeof fetch, url: string, timeoutMs: number): Promise<string> {
  const response = await fetchImpl(url, {
    redirect: 'follow',
    headers: { 'User-Agent': USER_AGENT },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) throw new Error(`download of checksums responded ${response.status}`);
  return response.text();
}
