/**
 * Action Ledger — a local, append-only record of *executed* actions and their outcomes.
 *
 * Why: Kuang already computes everything a decision layer needs — the page-state signature before and
 * after, the resolved target, the before/after delta, the post-condition result, the rule-based hints and
 * the typed error code — but it only ever logged tool *dispatches*. That left a runner-side decision model
 * (a Jev-style "System One" head, or any learned policy) with nothing to learn from or evaluate against.
 *
 * Every record is one JSON line in `data/transitions.jsonl` (`data/` is gitignored — this never leaves the
 * machine). Deliberately **no plaintext**: typed text is recorded as a character *count* (plus the `secret`
 * flag), never the string itself.
 *
 * Writing is non-blocking and swallows every error: a ledger failure must never break an action.
 */
import fs from 'node:fs';
import path from 'node:path';
import { dataPath } from '../data-paths.js';
import type {
  AddressMode,
  FieldFacts,
  TransitionRecord,
  TransitionTarget,
  TypingChannel,
  TypingOutcome,
} from '../../../packages/browser/src/primitives/contracts.ts';

export type {
  AddressMode,
  FieldFacts,
  TransitionRecord,
  TransitionTarget,
  TypingChannel,
  TypingOutcome,
};

/** When to use: constructing the ledger — its directory, rotation size and log sink. */
export interface ActionLedgerOptions {
  /** Directory to write into (default: `<cwd>/data`). */
  dir?: string;
  /** Rotate to `<name>.1.jsonl` past this size (default 5 MB). */
  maxBytes?: number;
  log?: (level: 'info' | 'warn' | 'action', message: string) => void;
}

/** When to use: the primitives layer recording each action, and `/ledger` reading it back. */
export class ActionLedger {
  private readonly file: string;
  private queue: Promise<void> = Promise.resolve();
  private readonly maxBytes: number;

  constructor(private opts: ActionLedgerOptions = {}) {
    this.file = path.join(opts.dir || dataPath(), 'transitions.jsonl');
    this.maxBytes = opts.maxBytes ?? 5 * 1024 * 1024;
  }

  /** Queue one record. Non-blocking; never throws. */
  public record(record: TransitionRecord): void {
    const line = `${JSON.stringify(record)}\n`;
    this.queue = this.queue
      .then(() => this.append(line))
      .catch(() => {
        /* a ledger failure must never break an action */
      });
  }

  /** Wait for pending writes (tests / shutdown). */
  public flush(): Promise<void> {
    return this.queue;
  }

  public get path(): string {
    return this.file;
  }

  private async append(line: string): Promise<void> {
    await fs.promises.mkdir(path.dirname(this.file), { recursive: true });
    await fs.promises.appendFile(this.file, line, 'utf8');
    await this.rotateIfLarge();
  }

  private async rotateIfLarge(): Promise<void> {
    try {
      const stat = await fs.promises.stat(this.file);
      if (stat.size <= this.maxBytes) return;
      const rotated = this.file.replace(/\.jsonl$/, '.1.jsonl');
      await fs.promises.rm(rotated, { force: true }); // Windows rename() refuses an existing target
      await fs.promises.rename(this.file, rotated);
      this.opts.log?.('info', `Action ledger rotated at ${(this.maxBytes / 1048576).toFixed(1)} MB → ${path.basename(rotated)}`);
    } catch {
      /* rotation is best-effort */
    }
  }
}
