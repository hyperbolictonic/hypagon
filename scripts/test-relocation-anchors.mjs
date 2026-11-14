// Spike: anchor research citations to DOM fingerprints and relocate them after a redesign.
//
// Run: node scripts/spike-relocation-anchors.mjs
//
// The question: can a highlight extracted from a page be tied to the block that produced it,
// stored as plain JSON, and found again after the markup changes?
import { Page, similarityScore } from 'hypagon-scrap';

const ORIGINAL = `<html><body>
<article class="post">
  <h1>Frostblink Elementalist</h1>
  <p class="intro">This build uses Frostblink of Wintry Blast with Spell Echo and Added Cold Damage to clear maps quickly.</p>
  <p class="gear">Budget gear requires Heatshiver and Berek's Respite to reach four million ignite DPS on a modest budget.</p>
  <p class="notes">Level with rolling magma and switch to the final setup once the required uniques are affordable.</p>
</article>
</body></html>`;

// Markup drift: new wrapper, renamed classes, an inserted sibling, and the target's class changed.
const MUTATED = `<html><body>
<div class="layout">
  <article class="post redesigned">
    <h1>Frostblink Elementalist</h1>
    <div class="content">
      <p class="intro">This build uses Frostblink of Wintry Blast with Spell Echo and Added Cold Damage to clear maps quickly.</p>
    </div>
    <p class="new">Patch 3.26 changed nothing important for this setup.</p>
    <p class="equipment">Budget gear requires Heatshiver and Berek's Respite to reach four million ignite DPS on a modest budget.</p>
    <p class="notes">Level with rolling magma and switch to the final setup once the required uniques are affordable.</p>
  </article>
</div>
</body></html>`;

const QUERY = 'heatshiver berek ignite dps budget';
const terms = QUERY.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length > 2);

let failures = 0;
const check = (name, ok, detail) => {
  if (ok) console.log(`PASS  ${name}`);
  else {
    failures++;
    console.log(`FAIL  ${name}${detail === undefined ? '' : ` — ${JSON.stringify(detail)}`}`);
  }
};

const original = await Page.load(ORIGINAL);
const mutated = await Page.load(MUTATED);

try {
  // 1. Candidate blocks, scored by query-term overlap (mirrors extractHighlights).
  const blocks = original.xpath('//p');
  const anchors = blocks
    .map((node) => {
      const text = node.getAllText({ separator: ' ' }).trim();
      const low = text.toLowerCase();
      const score = terms.reduce((sum, term) => sum + (low.includes(term) ? 1 : 0), 0);
      return { text, score, fingerprint: node.fingerprint(), path: node.path };
    })
    .filter((anchor) => anchor.text.length > 60)
    .sort((a, b) => b.score - a.score);

  check('anchored at least one block', anchors.length >= 3, anchors.length);

  const target = anchors[0];
  check('target is the gear paragraph', /Heatshiver/.test(target.text), target.text.slice(0, 60));

  // 2. The anchor is plain data: persist and reload it before relocating.
  const persisted = JSON.parse(JSON.stringify(target.fingerprint));

  // 3. Relocate in the drifted document.
  const index = mutated.index;
  const candidates = [];
  for (let i = 1; i < index.size; i++) {
    candidates.push({ i, score: similarityScore(index, persisted, i), path: index.node(i).path });
  }
  candidates.sort((a, b) => b.score - a.score);

  const best = candidates[0];
  const bestText = mutated.index.node(best.i).text.trim();
  console.log(
    `      best: ${best.score}%  ${best.path}  "${bestText.slice(0, 70)}..."`,
  );

  check('best candidate is the relocated gear block', /Heatshiver/.test(bestText), bestText.slice(0, 60));
  check('best score clears the default threshold', best.score >= 40, best.score);

  const [relocated] = mutated.relocate(persisted);
  check('relocate() returns the block', Boolean(relocated) && /Heatshiver/.test(relocated.getAllText()), relocated?.path);

  // 4. Every anchor should still resolve to its own text after the drift.
  let resolved = 0;
  for (const anchor of anchors) {
    const [node] = mutated.relocate(JSON.parse(JSON.stringify(anchor.fingerprint)));
    if (node && node.getAllText({ separator: ' ' }).trim() === anchor.text) resolved++;
  }
  check(`all ${anchors.length} anchors resolve to their own text`, resolved === anchors.length, { resolved, total: anchors.length });

  // 5. A deleted block must not silently match a different paragraph at a high threshold.
  const deleted = await Page.load(MUTATED.replace(/<p class="equipment">[\s\S]*?<\/p>/, ''));
  try {
    const hits = deleted.relocate(persisted, 80);
    check('deleted block is not resurrected at 80%', hits.length === 0, hits.map((n) => n.path));
  } finally {
    deleted.dispose();
  }
} finally {
  mutated.dispose();
  original.dispose();
}

console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
