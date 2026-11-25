---
description: Launch the read-only deslop-reviewer subagent on the current diff (banding, fake seams, moved debt, weakened tests)
---

Use the `deslop-reviewer` subagent to review the current changes. It is
read-only and runs in its own session, so this costs tokens — use it after a
de-slop, a split, or a substantial refactor, not for every commit.

Base: $ARGUMENTS. If empty, use the merge-base with origin/main, then
origin/master, then HEAD~1.

Before launching, collect what the reviewer needs and pass it in the prompt:

1. The base ref and `git diff --stat <base>...HEAD`.
2. The task's band map, verbatim, if one was produced. If there is none and the
   change claims a split, say that explicitly — the reviewer treats it as a
   finding.
3. The current gate output (`npm run gates` or the repo's equivalent).
4. Whether the baseline or any `// anti-slop:` exception changed in this diff.

Then report the reviewer's verdict and findings to the user unchanged. Do not
act on the findings without approval — and if the verdict is "Reject", do not
start a second attempt before the band map is corrected.
