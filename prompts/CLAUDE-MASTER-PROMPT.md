# CLAUDE CODE MASTER PROMPT — Volume+ Six-Feature Implementation + Testing

You are the Principal Browser Extension Engineer, Web Audio/DSP Engineer, Test Architect, Security Reviewer, and Product UX Engineer responsible for upgrading this repository:
https://github.com/PhyschicWinter9/Volume-Plus

## Source of truth and setup

Work in the existing checked-out repository. First read its actual `CLAUDE.md`, `manifest.json`, and all relevant source files. A supplementary Volume+ knowledge pack was extracted into `.claude/skills/`, `docs/`, `scripts/` and `prompts/`. Validate this pack with `python scripts/validate_knowledge_pack.py` (or Python 3 equivalent). Read `README-INSTALL.md` and `docs/README.md` if present; merge appropriate text from `docs/CLAUDE-ADDENDUM.md` into the existing `CLAUDE.md` without erasing old project knowledge. Adapt if the repo has changed since the docs snapshot (v2.2.1 on 2026-10-26).

Use the project-specific skills in `.claude/skills/` when relevant:
- `browser-extension-engineering` — MV3 worlds, tabs, APIs, service worker, SPA.
- `volume-state-management` — per-tab state, sync, cold start and migration.
- `web-audio-engineering` — AudioContext, Boost, Limiter, EQ, DSP.
- `extension-quality-assurance` — all test tiers, CI, coverage and release validation.
- `extension-security` — permissions and trust boundaries.
- `volume-ui-accessibility` — popup, widget, presets, shortcuts, accessibility and motion.
- `volume-ponytail-workflow` — local Volume+-specific companion; the **official Ponytail plugin is installed separately**.

## Ponytail — mandatory workflow integration, optional external installation

The user explicitly requested the **official** Ponytail skill from `https://github.com/DietrichGebert/ponytail` to reduce token waste and unnecessary code. Read `docs/PONYTAIL-INTEGRATION.md` and the project companion `.claude/skills/volume-ponytail-workflow/SKILL.md`.

- **If the official Ponytail plugin is installed:** use its Full mode (`/ponytail full`) for implementation. Its `/ponytail-audit` and `/ponytail-review` commands may be used early and at integration respectively. Do not mistake slash commands for shell commands; if the agent cannot invoke them directly, follow their documented review principles and tell the user which commands to run.
- **If the plugin is not installed:** tell the user the two Claude Code commands (`/plugin marketplace add DietrichGebert/ponytail` followed by `/plugin install ponytail@ponytail`, **as separate messages**). Do not falsely claim the plugin is active, install external software without permission, or silently replace the real plugin with a copy. Continue development using the local companion guidance if external installation is unavailable.
- Prefer **Full** mode; `ultra` may challenge requested scope and is inappropriate as default when all six features are mandatory. `lite` can be used for tiny independent changes.
- Be economical with token/context usage: inspect the needed source, callers and existing tests; reuse project/browser APIs; read relevant documents on demand; avoid lengthy repeated status reports, unnecessary abstractions, redundant agent work, unbounded tool outputs, and unrelated refactors.
- **Do not cut** tests, validation, error handling, security, accessible UI, state migration, audio correctness, or any of the six requested features to save tokens.
- Run focused tests on each vertical slice and comprehensive checks on integration. Never claim measured token reduction without real before/after data.

Consult the verified official references in `docs/REFERENCE-INDEX.md` rather than guessing browser APIs. Check any relevant installed local skills such as Intent/Impeccable; use them if actually available, not by assumption.

## Goal: IMPLEMENT (not merely suggest) six mandatory features

1. **Independent Per-tab Volume:** live desired/applied 0–300% volume, mute, last nonzero, robust targeting and safe page reload/SPA handling. Changing tab A never alters tab B. Document state inheritance for new/duplicated tabs and restart behavior.
2. **Reliable Volume Sync:** a documented authoritative per-tab state, sender/host validation, document epoch + monotonic revision or equivalent, out-of-order update protection, latest intent wins, accurate applied acknowledgements across popup, native YouTube integration and in-player widget.
3. **Audio Limiter / Clipping Protection:** optional conservative dynamics stage, default on for boost if appropriate; measured peak reduction, no sudden jumps, no silence or double routing. Compressor is not a guaranteed brick-wall limiter; explicitly document verified behavior and limitations.
4. **Keyboard Shortcuts:** up/down with configurable step, mute, reset to 100% and optional preset shortcuts. Honor browser commands restrictions, YouTube key conflicts and editable fields; display browser shortcut configuration instructions.
5. **Editable Volume Presets:** create, rename, edit, delete, reorder, restore defaults; validate 0–300%, handle duplicates/corrupt settings, apply only to selected tab while retaining global preset definitions.
6. **Mini Equalizer:** Bass/Mid/Treble with flat reset, enable/bypass, profiles (Flat/Bass Boost/Vocal/Treble Boost/Custom), stable stereo routing, smooth parameters, measurable response and low overhead.

## Critical regression constraints

Keep working behavior for 0–100% native YouTube volume, 101–300% Web Audio boost, mute, popup, in-player controls, and SPA navigation. The baseline currently uses MAIN-world `injected.js` at `document_start`, an isolated-world `content.js`, and origin-shared `localStorage.rl_volume` for synchronous early restoration. This conflicts with per-tab state; design and test a migration and early bootstrap before changing it. Do not assume `chrome.storage.session` survives extension reload, update or browser restart, or is available synchronously in MAIN world. Do not call `createMediaElementSource()` twice on one media element; handle video replacement and potential CORS/suspended context/audio silence.

## Mandatory execution sequence

**Phase 0 — Evidence and baseline**: use a single scoped Ponytail audit if installed; inspect current architecture; identify real and potential bugs separately; run existing checks; document present behavior. Do not stop at planning.

**Phase 1 — State architecture**: decide tab state/storage schema, migration, cold-start behavior and message contracts. Write reproducible unit and integration tests for key scenarios before/with implementation.

**Phase 2 — Audio lifecycle**: create a reliable per-element graph manager with audible bypass/recovery, validate native volume behavior, no duplicate paths; add lifecycle regression tests.

**Phase 3 — DSP features**: implement dynamics and 3-band EQ with deterministic rendered OfflineAudioContext tests, documented tolerances and a real listening checklist.

**Phase 4 — Controls/UI**: implement presets, commands, compact premium popup and in-player integration. Preserve dark/lime identity; motion subtle (~120–200ms), no excessive gradients/glow. Keyboard and screen-reader accessibility; no input lag.

**Phase 5 — Security/performance**: enforce sender/host/command validation and least privilege, audit prototype patches/external font/CSP; profile CPU, memory, popup latency and storage chatter with actual measurements.

**Phase 6 — Quality gates**: configure appropriate Vitest unit/integration tests, real DSP rendering tests, Playwright E2E using bundled Chromium persistent context and deterministic media fixtures, GitHub Actions checks, test coverage reporting, manifest/package validation. Propose ≥85% all core overall coverage dimensions and ≥90% critical state/audio modules; do not inflate coverage with meaningless tests.

**Phase 7 — Review and browser release validation**: use `/ponytail-review` on the integrated diff if installed; provide and execute as much as environment allows of manual Edge stable and Chrome stable checks, YouTube ordinary/Shorts/Live/playlist, multiple tabs/windows, SPA, refresh, muted/boosted audio, EQ/dynamics, shortcuts. If you cannot run browsers, label manual checks NOT RUN; never call the release PASS without their required evidence.

## Testing requirements

Follow `docs/TEST-MATRIX.md` and expand it when bugs are discovered. Explicitly test invalid values (`NaN`, Infinity, -1, 301), rapid concurrent updates, stale acks, wrong active tab, tab close, extension reload, migration failure, AudioContext suspend/resume, replaced video elements, EQ flat response, transient peaks, audio bypass and stereo integrity. Live YouTube must not be a required external dependency of pull-request CI. Implement true assertions; mocks alone cannot verify sound.

## Engineering rules

- Keep the project lightweight; do not rewrite merely for modernization.
- No unnecessary frameworks or broad host permissions.
- Preserve existing settings via documented versioned migration.
- Optimize from measurements rather than guesses.
- Test every meaningful feature increment; do not bypass failures.
- Preserve privacy: no analytics/telemetry or third-party network services without explicit requirement.
- Use accessible native form controls when possible; give accurate pending/failure feedback.
- Do not silently publish to Chrome/Edge stores or push commits unless instructed.
- Update architecture, feature, test and changelog documentation to reflect **implemented behavior**, not this proposal.
- Continue toward all six features without pausing after a planning phase; report blockers honestly.

## Final delivery format

1. Technical audit, baseline and priority risks.
2. All six features: status, implementation files and user behavior.
3. State, boot and migration decisions with evidence.
4. Audio graph design and measured DSP results/limitations.
5. Security/privacy and performance findings.
6. Test commands, counts, PASS/FAIL/SKIP/NOT RUN and coverage numbers.
   Include Ponytail integration status (official plugin installed/active vs local companion fallback), with no unmeasured savings claims.
7. Real Edge/Chrome manual verification matrix and incomplete checks.
8. CI workflow, exact files changed and remaining P0/P1 defects.
9. Release classification: PASS / CONDITIONAL / BLOCKED, with justification.

Start reading the actual repository and supplied skills/docs, then implement the tested upgrade. Never fabricate test executions or success metrics.
