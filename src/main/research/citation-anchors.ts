/**
 * The anchor store adapter.
 *
 * The portable class takes the store file; the app keeps using `<userData>/research-anchors.json`.
 */
import path from 'node:path';
import { app } from 'electron';
import {
  CitationAnchors as PortableCitationAnchors,
  type CitationHtmlFetcher,
} from '../../../packages/research/src/citation-anchors.ts';

export type { RevalidationSummary } from '../../../packages/research/src/citation-anchors.ts';

function storeFile(): string | undefined {
  try {
    return path.join(app.getPath('userData'), 'research-anchors.json');
  } catch {
    return undefined;
  }
}

/** When to use: `CitationController` — the app's durable anchor store. */
export class CitationAnchors extends PortableCitationAnchors {
  constructor(fetcher: CitationHtmlFetcher) {
    super(fetcher, { storeFile: storeFile() });
  }
}
