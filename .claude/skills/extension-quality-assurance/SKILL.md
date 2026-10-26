---
name: extension-quality-assurance
description: Design, implement, troubleshoot, and gate Volume+ unit, integration, Chromium extension E2E, Web Audio DSP tests, GitHub Actions, coverage, regression verification, and real Edge/Chrome release checks. Use when modifying features, fixing regressions, testing or preparing releases.
---

# QA and test automation — Volume+

## Read

`docs/TESTING-STRATEGY.md`, `docs/TEST-MATRIX.md`, `docs/RELEASE-CHECKLIST.md`, `docs/REFERENCE-INDEX.md`.

## Baseline before refactor

- Inspect package/tooling; do not presume a `package.json` exists.
- Record starting behavior of the existing 0–300% volume, mute, preset, YouTube SPA and popup workflows.
- Record baseline test availability and outcomes (including "not configured").
- For each discovered bug: write a reproducible failing test where technically feasible; fix it; re-run tests.

## Test pyramid

1. **Vitest unit:** pure clamp, reducers, preset CRUD, validation, serializer/migrator, EQ math, ordering/deduplication.
2. **Vitest integration:** stub Chrome APIs and messaging; test tab isolation, async order, storage error, popup lifecycle, MAIN-world bridge, service worker restart logic.
3. **DSP:** deterministic `OfflineAudioContext` with synthesized reference signals, rendered buffers and numeric assertions. Supplement with real audio listening.
4. **Playwright E2E:** use Playwright's bundled Chromium persistent context and unpacked extension. Prefer deterministic local media fixture; live YouTube belongs in separate manual/optional smoke tests.
5. **Real browsers:** installed stable Microsoft Edge and Google Chrome must be manually validated for release; Chromium E2E is not a substitute.

## CI quality policy (proposed targets)

- Unit + integration + DSP + relevant E2E are required to pass.
- Aim for at least 85% overall statements/lines/functions/branches and at least 90% for critical state/validation/audio control units. Refine thresholds after baseline; no artificial exclusions.
- Treat P0/P1 unresolved defects as release-blocking.
- Lint, type-check where configured, manifest validation, test, coverage, package integrity, dependency audit.
- Do not require external YouTube connectivity as a mandatory PR gate.
- Any skipped test must have written reason and follow-up action.

## Common traps

- A mocked GainNode verifies control flow, not real sound quality.
- A passing node-count test is not a peak-level assertion.
- Browser audio autoplay policies affect test fixtures: use a genuine play gesture where necessary.
- Extensions require persistent Chromium contexts; sideloading flags have changed in installed Chrome/Edge.
- Coverage is not a substitute for bad-path assertions, multi-tab smoke and live browser validation.

## Reporting format

For each test tier report command, environment, tests executed, pass/fail/skip totals, coverage where applicable, artifacts/logs, and exact blockers. Never claim an unexecuted test passed.
