/**
 * The stats strip: sources / indexed / data / tier mix / humans / anchors.
 *
 * Why a module: the counters are accumulated by the source events and finally replaced by
 * the run summary, then painted into six spans. Keeping the numbers and the paint together
 * is what stops a new stat from being added to one and not the other.
 */
import type { ResearchEvent, ResearchTier } from '../../shared/research-events.js';
import type { ResearchElements } from './elements.js';

type RunDone = Extract<ResearchEvent, { type: 'run-done' }>;
type SourceDone = Extract<ResearchEvent, { type: 'source-done' }>;

/** When to use: `initResearchPanel` — one strip per panel. */
export class ResearchStats {
  private readonly elements: ResearchElements;
  private sources = 0;
  private indexed = 0;
  private bytes = 0;
  private humans = 0;
  private anchors = 0;
  private tiers: Record<ResearchTier, number> = { llm: 0, static: 0, render: 0 };

  constructor(elements: ResearchElements) {
    this.elements = elements;
  }

  /** Zero every counter (a new run). */
  reset(): void {
    this.sources = 0;
    this.indexed = 0;
    this.bytes = 0;
    this.humans = 0;
    this.anchors = 0;
    this.tiers = { llm: 0, static: 0, render: 0 };
    this.render();
  }

  /** The distinct source rows seen so far (the launcher badge reads this). */
  get sourceCount(): number {
    return this.sources;
  }

  /** Accumulate one finished source; `sourceCount` is the distinct source rows seen. */
  addSource(event: SourceDone, sourceCount: number): void {
    this.sources = Math.max(this.sources, sourceCount);
    this.bytes += event.bytes;
    this.tiers[event.via] += 1;
    if (event.humanAssisted) this.humans += 1;
    if (event.anchors) this.anchors += event.anchors;
    if (event.indexed) this.indexed += 1;
    this.render();
  }

  /** The authoritative totals from the run summary. */
  setFinal(event: RunDone): void {
    this.sources = event.sources;
    this.indexed = event.indexed;
    this.bytes = event.bytes;
    this.humans = event.humans;
    this.anchors = event.anchors;
    this.tiers = { ...event.tiers };
    this.render();
  }

  /** Paint the strip. */
  render(): void {
    const e = this.elements;
    if (e.statSources) e.statSources.textContent = String(this.sources);
    if (e.statIndexed) e.statIndexed.textContent = String(this.indexed);
    if (e.statBytes) e.statBytes.textContent = `${(this.bytes / 1024).toFixed(1)} KB`;
    if (e.tierLlm) e.tierLlm.textContent = String(this.tiers.llm);
    if (e.tierStatic) e.tierStatic.textContent = String(this.tiers.static);
    if (e.tierRender) e.tierRender.textContent = String(this.tiers.render);
    if (e.statHumans) e.statHumans.textContent = String(this.humans);
    if (e.statAnchors) e.statAnchors.textContent = String(this.anchors);
  }
}
