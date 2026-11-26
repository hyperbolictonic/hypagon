---
description: De-slop review of the current diff — launches the read-only code-reviewer with a refactor focus (banding, ledger, moved debt)
---

Use the `code-reviewer` subagent to review the current changes **as a
refactor**. It is read-only and runs in its own session, so this costs tokens.

Base: $ARGUMENTS. If empty, use the merge-base with origin/main, then
origin/master, then the parent commit. Review the working tree too
(`git diff <base>`), not only pushed commits.

Pass in the prompt, and say explicitly that the change is a de-slop/split:

1. The base ref and `git diff --stat <base>...HEAD`.
2. The band map and behaviour ledger, verbatim. If there is none and the change
   claims a split, say so — that is a finding.
3. Gate output, and whether the baseline or an `// anti-slop:` exception changed.
4. Any claim the implementing agent made about "no behaviour change".

Ask the reviewer to weigh the de-slop checks first (banding vs line order, fake
seams, moved debt, weakened tests, dual implementation) and the general
correctness/security checks second. Report its verdict unchanged.
