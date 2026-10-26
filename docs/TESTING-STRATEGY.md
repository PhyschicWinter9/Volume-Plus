# Automated testing strategy — implementation blueprint

## Tool selection

Use Vitest for unit/integration tests; use Playwright `@playwright/test` + bundled Chromium with persistent context for unpacked MV3 extension tests; use `OfflineAudioContext` for actual rendered DSP assertions. Add only dependencies justified by the current repository toolchain. Keep a separate real Edge + Chrome manual validation checklist.

**Important:** Playwright's official extension guide states installed Google Chrome and Microsoft Edge no longer support the command-line sideload flags used by tests. E2E automation uses Playwright's bundled Chromium; this does not constitute testing release on installed Edge/Chrome.

## Repository targets (implement after audit)

```text
tests/
  unit/                reducers, volume math, presets, keyboard rules
  integration/         Chrome API mocks, storage, messaging, migrations
  dsp/                 rendered audio graph, EQ response, dynamics peaks
  e2e/                 extension popup, multiple tabs, local media fixture
  fixtures/            deterministic media HTML and test signal assets
```

## Initial commands (examples only, not guaranteed to exist)

```sh
npm run lint
npm run typecheck
npm run test:unit
npm run test:integration
npm run test:dsp
npm run test:e2e
npm run test:coverage
npm run build
```

Configure actual package scripts before instructing users to run them. A static JavaScript extension may not currently have an npm project.

## Testing practices

- Pure functions: fake timers and platform-mocked messaging where needed; no shared state between tests.
- Integration: test async order using deferred promises; validate wrong tab, wrong origin and wrong message types.
- DSP: assert numerical output after offline rendering. A mocked AudioNode is insufficient to certify limiter output.
- E2E: load unpacked extension under `chromium.launchPersistentContext` and use local fixture server for deterministic controlled media; external YouTube is optional smoke/manual coverage.
- Capture console errors, service worker restarts, failure screenshots/traces and manifest warnings.
- Manual: listen on Edge and Chrome, check Shorts/Live and privacy/network requests.

## Proposed coverage goals

- Overall ≥85% statements, branches, functions and lines.
- Critical state/validation/audio control units ≥90%.
- Tests must be meaningful. Document justified exclusions, do not lower quality gates just for green CI.
- Block merge on failed mandatory tests and on unresolved P0/P1 release bugs.

## CI pipeline blueprint

1. Checkout with least privileges and lockfile-based install.
2. Manifest schema/local asset validation; lint and type checking (if configured).
3. Unit, integration, DSP and coverage.
4. Playwright bundled Chromium installation and deterministic E2E (may require OS dependencies).
5. Dependency audit with triage; extension ZIP integrity checks.
6. Upload artifacts (coverage, traces, results, not secrets); release/publish as separate explicit authorized workflow.

## Test result honesty

Use `PASS`, `FAIL`, `SKIP`, `NOT RUN`, `BLOCKED`. Include exact OS/browser version, test command and environment. A test-plan file is not proof that its tests exist or pass.
