---
description: Launch the read-only code-reviewer subagent on the current diff (correctness, security, performance, tests, surface; de-slop checks when the change is a refactor)
---

Use the `code-reviewer` subagent to review the current changes. It is read-only
and runs in its own session, so this costs tokens — use it when
`node scripts/anti-slop/review-scope.mjs` says `[review] needed`, or when the
user asks.

Base: $ARGUMENTS. If empty, use the merge-base with origin/main, then
origin/master, then the parent commit. Review the working tree too
(`git diff <base>`), not only pushed commits.

Collect what the reviewer needs and pass it in the prompt:

1. The base ref, and `git diff --stat <base>...HEAD`.
2. One or two sentences on what the change is meant to do.
3. The gate output (`npm run gates` or the repo's equivalent).
4. For refactors: the band map and behaviour ledger verbatim. If there is none
   and the change claims a split, say so — the reviewer treats that as a finding.
5. Whether the baseline or any `// anti-slop:` exception changed in this diff.

Report the reviewer's verdict and findings to the user unchanged. Do not act on
them without approval, and do not start a second attempt on a "Reject" verdict
before the band map (or the stated blocker) is addressed.
