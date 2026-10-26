---
name: volume-ponytail-workflow
description: Apply a minimal-complete-change and token-conscious workflow while delivering Volume+ features and testing. Prefer the official DietrichGebert/ponytail Claude Code plugin if installed; use this project-scoped companion for specific Volume+ constraints and as a fallback when the external plugin is unavailable.
---

# Volume+ / Ponytail companion

This is a **project-specific companion, not the upstream Ponytail skill**. For full Ponytail commands, session hooks and modes, install the official plugin using `docs/PONYTAIL-INTEGRATION.md`. Do not pretend local instructions install the plugin.

## Trigger

Use for Volume+ implementation planning, debugging, refactoring, code reviews or choosing dependencies. If official Ponytail is already active, keep this short: only apply the Volume+-specific constraints below, not a second lengthy optimization prompt.

## Volume+-specific minimum-complete-change rules

- The user's six specified features **and automated tests** are mandatory. Never eliminate acceptance criteria, error validation, security checks, accessibility, or release verification to reduce tokens/LOC.
- Inspect actual ownership of audio state and audio graph before editing. Map touched callers, consumers, tests, and existing storage keys; focus subsequent reads on relevant files.
- Reuse existing extension architecture and Chrome/Edge platform APIs before introducing frameworks or libraries. Do not write wrappers just to anticipate hypothetical future sites/features.
- Keep per-tab isolation, ordered acknowledgement, safe audio fallback and migration; these are correctness constraints, not optional complexity.
- Scope changes to the smallest complete vertical slice. Preserve 0–100% native and 101–300% Web Audio behavior.
- For risky behavior changes, write a focused regression test. Run targeted tests while iterating and the entire suite at feature integration/release boundaries.
- Use `docs/REFERENCE-INDEX.md` to find official docs; read relevant sections and links on demand rather than pasting entire external docs into prompts.
- Prefer concise progress: changed files, pass/fail checks, remaining risks. Avoid dumping full files, giant test logs or re-explaining unchanged architecture.
- Run an up-front repo audit once, then focused reviews per changed subsystem; do not repeatedly re-audit everything per small change.
- Never claim a token-savings percentage from this project without before/after measurement.

## Check after a meaningful change

1. Does this complete the requested vertical slice, including affected callers and tests?
2. Could it cause cross-tab leakage, state races, audio silence/jumps, data loss, or security issues?
3. Are there unnecessary files, dependencies, layers, tool calls, or repeated explanations?
4. Which checks actually ran, and which remain NOT RUN?

References: `docs/PONYTAIL-INTEGRATION.md`, `docs/FEATURE-SPECS.md`, `docs/TEST-MATRIX.md`.
