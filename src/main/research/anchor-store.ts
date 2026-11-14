/**
 * Durable citation anchors.
 *
 * Anchors travel in the research result, but a citation is only useful if the app can find it
 * again later. This store keeps them in `<userData>/research-anchors.json`, keyed by URL + text,
 * and records the last revalidation outcome.
 */
import fs from 'node:fs';
import path from 'node:path';
import type { Fingerprint } from 'hypagon-scrap';

import type { CitationAnchor, CitationRelocation } from './anchors.js';

export interface StoredAnchor {
  url: string;
  text: string;
  path: string;
  fingerprint: Fingerprint;
  capturedAt: number;
  lastCheckedAt?: number;
  lastFound?: boolean;
  lastScore?: number | null;
}

const MAX_RECORDS = 2000;

export class AnchorStore {
  readonly file: string;
  #records: StoredAnchor[];

  constructor(file: string) {
    this.file = file;
    this.#records = this.#load();
  }

  #load(): StoredAnchor[] {
    try {
      const parsed = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      if (Array.isArray(parsed)) {
        return parsed.filter(
          (record: any) =>
            record && typeof record.url === 'string' && record.fingerprint && typeof record.text === 'string',
        );
      }
    } catch {
      /* no store yet */
    }
    return [];
  }

  #persist(): void {
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      const temp = `${this.file}.${process.pid}.tmp`;
      fs.writeFileSync(temp, `${JSON.stringify(this.#records, null, 2)}\n`, 'utf8');
      fs.renameSync(temp, this.file);
    } catch {
      /* best effort: a failed write must not break research */
    }
  }

  #key(record: { url: string; text: string }): string {
    return `${record.url}\u0000${record.text.slice(0, 80)}`;
  }

  upsert(url: string, anchors: CitationAnchor[]): void {
    const now = Date.now();
    for (const anchor of anchors) {
      const key = this.#key({ url, text: anchor.text });
      const existing = this.#records.find((record) => this.#key(record) === key);
      if (existing) {
        existing.text = anchor.text;
        existing.path = anchor.path;
        existing.fingerprint = anchor.fingerprint;
        existing.capturedAt = now;
        // The fingerprint changed; an older check no longer describes it.
        delete existing.lastCheckedAt;
        delete existing.lastFound;
        delete existing.lastScore;
      } else {
        this.#records.push({
          url,
          text: anchor.text,
          path: anchor.path,
          fingerprint: anchor.fingerprint,
          capturedAt: now,
        });
      }
    }

    if (this.#records.length > MAX_RECORDS) {
      this.#records.sort((a, b) => a.capturedAt - b.capturedAt);
      this.#records = this.#records.slice(-MAX_RECORDS);
    }
    this.#persist();
  }

  list(url?: string): StoredAnchor[] {
    return url ? this.#records.filter((record) => record.url === url) : [...this.#records];
  }

  urls(): string[] {
    return [...new Set(this.#records.map((record) => record.url))];
  }

  applyChecks(url: string, results: CitationRelocation[]): void {
    const records = this.list(url);
    const now = Date.now();
    for (let i = 0; i < results.length && i < records.length; i++) {
      records[i].lastCheckedAt = now;
      records[i].lastFound = results[i].found;
      records[i].lastScore = results[i].score;
    }
    this.#persist();
  }

  stats(): { anchors: number; urls: number; checked: number; found: number } {
    const checked = this.#records.filter((record) => record.lastCheckedAt !== undefined).length;
    const found = this.#records.filter((record) => record.lastFound === true).length;
    return { anchors: this.#records.length, urls: this.urls().length, checked, found };
  }
}
