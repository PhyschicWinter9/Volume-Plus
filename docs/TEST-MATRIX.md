# Volume+ regression and release test matrix

The ID/scenario/expected columns are the plan. **Results for v2.3.0 are in the table at the bottom**; anything not listed there as PASS has not been verified. Environment for automated rows: Windows 10, Node 24, Playwright bundled Chromium 156 (not Chrome/Edge stable).

| ID | Scenario | Tier | Expected |
|---|---|---|---|
| V01 | `0`, `1`, `99`, `100`, `101`, `150`, `200`, `300` | Unit/Integration | Valid, normalized per policy |
| V02 | `NaN`, Infinity, -1, 301, strings/objects/null | Unit/Security | Reject or safely normalize with explicit policy |
| V03 | Toggle mute at boosted 180% | Integration/E2E | Correct per-tab lastNonZero restore |
| V04 | Two tabs with 50% and 200% | E2E/Manual | Independent audible and displayed volume |
| V05 | Switch tabs while popup remains open | E2E | No stale tab command |
| V06 | Two windows, several YouTube tabs | E2E | No cross-window leakage |
| V07 | 100→250→60→300 asynchronous out-of-order ack | Integration | Last intent wins, applied state accurate |
| V08 | Popup closes during gain change | Integration | Command continues safely |
| V09 | Video element replaced mid boost | E2E/Manual | New element audible, correct gain, no double source |
| V10 | Repeated SPA navigation/player UI replacement | E2E/Manual | Stable state, no duplicated widget/listeners |
| V11 | Refresh during playback | E2E/Manual | Documented early restore, no spike |
| V12 | Extension reload/update | E2E/Manual | Safe fallback, documented session reset |
| V13 | Browser restart | Manual | Persistence/default rules upheld |
| V14 | Legacy `rl_volume` valid, malformed, missing | Unit/Integration | One-time idempotent migration |
| V15 | Close tab then reuse tab identity | Integration | No stale state |
| V16 | Gain graph route connected exactly once | DSP/Browser | No doubled output/silence |
| V17 | EQ flat at 0 dB | DSP | Approximately unity response |
| V18 | Bass/Mid/Treble frequency response | DSP | Expected dB bands within tolerance |
| V19 | Limiter on/off with high transient | DSP/Manual | Measured improvement, clear limits |
| V20 | Stereo channels/silence/full-scale signals | DSP | Channels intact, finite output |
| V21 | EQ + 300% boost + limiter | DSP/Manual | Stable audio, no accidental jump |
| V22 | Suspend/resume AudioContext | Browser/Manual | Playback recovers or reports failure |
| V23 | Shortcut while typing in search/comment field | E2E | No interception |
| V24 | Browser command conflict/unbound shortcut | Manual | Clear behavior and settings guidance |
| V25 | Preset CRUD/reorder/restore | Unit/E2E | Persist and apply only to selected tab |
| V26 | Invalid/stale/forged page bridge payload | Security/Integration | Rejected, cannot trigger privilege escalation |
| V27 | Popup keyboard, focus, reduced-motion | E2E/Manual | Accessible controls without motion requirement |
| V28 | YouTube Shorts, Live, Playlist, Ads | Manual | Existing player controls and audio stable |
| V29 | Chrome stable and Edge stable | Manual | Both verified separately for release |
| V30 | CPU/memory with EQ+limiter across tabs | Manual/Profile | Document measured baseline and acceptable budget |

## Release evidence table template

| Test ID | Browser/OS | Run date | Result | Evidence link | Notes |
|---|---|---|---|---|---|
| V01 | — | — | NOT RUN | — | Implement first |


## Results - v2.3.0 (executed 2026-10-26)

Automated totals: Vitest **168 passed / 0 failed** (7 files); Playwright DSP **10 passed**; Playwright E2E **14 passed**; manifest validation OK. Coverage (v8, unit/integration only): statements 98.03 %, branches 90.51 %, functions 96.22 %, lines 98.03 %. Coverage does not include the DSP/E2E suites, and `audio-graph.js` is exercised in Vitest only through a fake AudioContext (its sound is verified by the DSP suite, which is not in the coverage figure).

| ID | Result | Evidence / notes |
|---|---|---|
| V01 | PASS | `state.test.js` |
| V02 | PASS | `state.test.js`, `content.test.js` (NaN, Infinity, -1, 301, strings, objects, null) |
| V03 | PASS | `state.test.js` mute at 180 % keeps and restores volume; `content.test.js` |
| V04 | PASS (fixture) | E2E E02: 50 % vs 200 % boosted; graph only in tab B |
| V05 | PARTIAL | `pickTarget`, popup and background unit tests; E2E popup background-tab path. "Switch tabs while popup stays open" not exercised in a real browser |
| V06 | PARTIAL | E2E E02/E03/E13 in one window. Multiple windows NOT RUN |
| V07 | PASS | `acceptUpdate` shuffled acks; `content.test.js` rapid patches; E2E E04 (incl. stale seq) |
| V08 | PASS (unit) | popup port disconnect then patch still applies (`content.test.js`) |
| V09 | PASS (fixture) / NOT RUN (real YouTube) | E2E E06 (3 swaps, one source); unit lifecycle |
| V10 | PASS (fixture) / NOT RUN (real YouTube) | E2E E06 (3 SPA cycles, one widget) |
| V11 | PASS (fixture) | E2E E03: fixture "restores 100 %" twice, video reported only 0.35 |
| V12 | NOT RUN | real extension reload/update. E11 only proves an unreachable tab rejects |
| V13 | NOT RUN | browser restart |
| V14 | PASS | `settings.test.js` valid / malformed / missing / idempotent |
| V15 | PASS | tab-scoped `sessionStorage`; E2E E03 fresh tab at default |
| V16 | PASS | DSP unity test (no +6 dB), E2E `sources === 1` through toggles |
| V17 | PASS | DSP flat within 0.1 dB |
| V18 | PASS | DSP band response within 1 dB |
| V19 | PASS | DSP peak 5.15 to 0.592; E2E live compressor reduction -11 dB. Listening NOT RUN |
| V20 | PASS | DSP stereo < -60 dB crosstalk, silence, full scale |
| V21 | PASS (DSP) | EQ +12 dB x3 bands + 300 % + limiter bounded; listening NOT RUN |
| V22 | PARTIAL | fake-context logic (never routes into a non-running context; recovery on gesture) PASS; headless Chromium did not block autoplay in E12, so the real blocked path is NOT RUN |
| V23 | PASS | unit + jsdom + E2E E07 (typing in `#search` ignored) |
| V24 | PARTIAL | E01: Chromium registered Alt+Up/Down/M/0 without conflict. Edge/Chrome stable conflicts NOT RUN |
| V25 | PASS | unit CRUD/corruption, popup editor, E2E E08 persistence across popup reopen |
| V26 | PASS | forged `RL_APPLY`, untrusted senders/ports, unknown types/keys |
| V27 | PARTIAL | E09: labels, reduced motion, no external assets. Screen reader and contrast measurement NOT RUN |
| V28 | NOT RUN | Shorts / Live / playlist / ads on real YouTube |
| V29 | NOT RUN | Chrome stable and Edge stable |
| V30 | PARTIAL | E14: popup ready 136-228 ms, 2 ms per command round trip, 0 storage writes per 101 changes, tab JS heap +1 MB with graph; DSP 80x real time. CPU % of a live multi-tab session NOT measured |
