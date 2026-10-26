# Ponytail integration — token-aware, correctness-first

**External project:** https://github.com/DietrichGebert/ponytail  
**Official upstream skill:** https://github.com/DietrichGebert/ponytail/blob/main/skills/ponytail/SKILL.md  
**Official install guide:** https://github.com/DietrichGebert/ponytail/blob/main/INSTALL.md

Ponytail is an **optional external Claude Code plugin**, not included as vendored source code or installed by this ZIP. The project also contains `.claude/skills/volume-ponytail-workflow/SKILL.md`, a lightweight Volume+-specific companion/fallback. It is **not** an official Ponytail copy.

## Install the real plugin in Claude Code (one command per message)

1. `/plugin marketplace add DietrichGebert/ponytail`
2. `/plugin install ponytail@ponytail`
3. Start a fresh Claude Code session in the Volume+ repository.
4. Select `/ponytail full` (recommended).

Run these in the Claude Code **command prompt**, not in a system shell, build script, or agent-submitted patch. External plugin installation needs the user's action/approval. The install guide notes Node.js is needed on PATH for lifecycle hooks; without it, prompt rules may work but hooks can print errors. Review plugin trust and permissions before installing.

## Which intensity?

| Mode | Usage in Volume+ |
|---|---|
| `lite` | Tiny well-scoped maintenance changes; may propose reducing requirements, but do not drop the mandatory six features. |
| `full` | **Default:** best balance for a multi-feature release with architecture/migration, DSP, security and testing. |
| `ultra` | Challenge feature scope; **not preferred** here because all six features are explicitly required. |
| `off` | Only when troubleshooting interaction/compatibility with another workflow. |

## Practical workflow

1. Make an **initial** source audit and baseline checks; `/ponytail-audit` if the official plugin is installed. Do not run a complete audit on every incremental change.
2. Before editing an area, inspect only its actual callers, state boundaries and existing tests. This is targeted discovery, **not** skipping architectural understanding.
3. Implement one coherent feature slice, run focused unit/integration/DSP tests, and keep the simplest complete design consistent with existing code.
4. Use `/ponytail-review` on the final diff (and optionally high-risk audio/state diffs) to find hidden bugs, security holes, complexity and missing tests. Treat findings as review suggestions and verify them.
5. Run the full test suite, coverage, packaging checks and manual-browser release checklist at integration/release boundaries.
6. Report only the relevant changes, actual test evidence and open risks; link to documents rather than pasting them verbatim.

## Token discipline, without weakening quality

- Read `docs/README.md`, then **only** the reference files needed for the current subsystem; consult external API docs for uncertain details.
- Avoid recursively ingesting every generated file or all external documentation at once.
- Reuse existing helpers and browser APIs. Avoid dependency installs for trivial behaviors and duplicated architecture.
- Prefer brief tool outputs (`git diff --stat`, relevant grep/ranges, test summaries) while retaining full diagnostic output when a failure needs investigation.
- Do not rerun identical passing suites for every text-only edit, but never skip required quality gates.
- Do not shrink specs/tests/prompts until requirements become ambiguous. Correctness is the non-negotiable boundary.
- Keep a short context note (current stage, decisions, changed files, next checks) if the session becomes long; verify notes against code when resuming.
- If a feature requires a complex solution for correct per-tab behavior, audio safety, security or accessibility, implement it rather than optimizing for LOC/tokens.

## Claims and limits

Upstream repository advertises token/cost reductions from its own benchmarks; these figures are **not guaranteed** for Volume+. Measure actual usage in your Claude session if available, and do not present marketing benchmarks as results for this project. Ponytail improves instruction/workflow discipline but does not automatically shorten all context, replace testing, or guarantee code quality.

Use only the official GitHub source for installation. This knowledge pack does **not** invoke installer commands, run hooks or alter your Claude installation.
