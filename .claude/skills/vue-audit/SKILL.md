---
name: vue-audit
description: Audit Vue 3 components for performance and code reuse, producing a ranked, evidence-backed findings report and then offering to apply fixes. Use when the user asks to analyze, audit, review or optimize Vue components or views; asks why a Vue page re-renders or loads slowly; wants to find duplicated logic, markup or CSS across .vue files that should become composables or shared components; or asks whether a large component should be split, even if they don't say "audit".
---

# Vue audit

Produce a **findings report**: a ranked list of real, verified problems in Vue 3 components, each tied to `file:line` evidence and a concrete fix. The report is the deliverable; fixes come after, only for the findings the user picks.

The value of an audit is its precision. A report with eight real findings beats one with thirty where a third are wrong, because a single false positive teaches the reader to distrust the rest. Every step below is built to keep findings real.

## 1. Scope and conventions

- **Scope**: the files or directory the user named; otherwise every `.vue` file under the client source root (usually `src/`), plus the router file and `composables/`.
- **Conventions**: read the project's `CLAUDE.md` / `AGENTS.md` and skim one or two existing composables and shared components. A suggestion that ignores how this repo already does things (its composable naming, its data-flow pattern, a rule like "all .vue edits go through agent X") is a worse suggestion. Note any existing composable or component a finding could reuse: "use the existing `useFilters`" beats "create a new composable".

Done when you know the file list, the project's stated rules, and which shared building blocks already exist.

## 2. Inventory

Run the bundled script for the mechanical signals:

```bash
python3 <skill-dir>/scripts/vue_inventory.py <src-dir>
```

It reports per-file block sizes and API counts, index-based `:key`s, `v-if` + `v-for` on one element, `deep` watchers, eagerly imported routes, and cross-file duplication (repeated function names, repeated CSS selectors, shared runs of near-identical lines). Treat its output as **leads**, never findings: regex can't tell a stable list from a reordering one, or a coincidental name clash from real duplication.

## 3. Analyze

Read [`references/checklist.md`](references/checklist.md), then work through it against the code. The checklist has four categories: reactivity and render cost, reuse, structure, and loading. Two passes:

- **Per file**: read each in-scope component (for files over ~400 lines, read the script fully and the template in sections). Apply every checklist rule.
- **Cross file**: take the duplication leads plus anything you noticed repeating while reading, and open the files side by side. Reuse findings live here, and they are the ones a per-file read misses.

## 4. Verify

For each candidate finding, re-open the cited lines and confirm the claim against the actual code before it enters the report. Check specifically:

- The line number points at the code described.
- The "problem" isn't already handled (the value is already `computed`, the route is already lazy, the list is static so index keys are harmless).
- For duplication: the copies really do the same thing, and the differences between them are listed in the fix.
- The fix works with the surrounding code and the project's conventions.

Drop or downgrade anything that fails. Done when every remaining finding has been checked against the source.

## 5. Rank and report

Rank by **impact**: how much user-visible cost (render work, bundle size, bugs) or maintenance cost (copies to keep in sync, lines in a file people must edit) the fix removes, weighed against effort. One finding per root cause: seven views repeating the same watcher is one reuse finding listing seven locations, not seven findings.

Use this template:

```markdown
# Vue audit: <scope>

<2-3 sentences: overall health, the biggest wins, files reviewed count.>

## Findings

### 1. <Imperative title, e.g. "Lazy-load route components"> — <High|Medium|Low> impact, <S|M|L> effort
**Category**: Reactivity | Reuse | Structure | Loading
**Where**: `path/File.vue:123`, `path/Other.vue:45`
**Problem**: what the code does now and why it costs something here, in concrete terms.
**Fix**: the specific change, with a short before/after snippet when it helps. Name the existing composable/component to reuse if there is one.

### 2. ...

## Checked and fine
<One line each for notable things that looked suspicious but were fine, so the reader knows they were considered.>
```

Impact levels: **High** removes measurable runtime/bundle cost or a correctness risk, or collapses many copies; **Medium** is a clear improvement in a hot or frequently edited path; **Low** is tidy-up.

## 6. Offer to apply

After the report, ask which findings to apply (by number). Then make the changes for the chosen ones, following the project's rules for who edits what: if `CLAUDE.md` routes `.vue` edits through a specific agent, delegate those edits to it with the finding text as the brief. Apply reuse refactors one at a time and confirm the app still builds (and tests pass, if the project has them) between them, since they touch several files at once.
