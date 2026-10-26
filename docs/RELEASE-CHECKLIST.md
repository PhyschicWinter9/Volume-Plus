# Release quality gate — Volume+

Mark every item with evidence. **No checkboxes have been completed by this pack.**

## Functionality

- [ ] Six requested features are implemented and documented.
- [ ] Native 0–100% and boost 101–300% regression pass.
- [ ] Two or more tabs at independent volumes verified audibly.
- [ ] Popup switch, mute/unmute, presets and shortcuts consistent.
- [ ] Media element replacement, YouTube SPA and refresh verified without silence/spikes.
- [ ] Limiter claims match measured test signals; EQ flat is neutral.
- [ ] Legacy `rl_volume` migration works on fresh, upgrade and corrupt data.

## Automation

- [ ] Unit, integration, DSP, deterministic Chromium E2E present and pass.
- [ ] Coverage measured; intended thresholds meet or have documented blocking exceptions.
- [ ] CI validates package and manifest, dependencies, tests and packaged assets.
- [ ] Regression matrix has actual evidence; failures/skip reasons triaged.

## Browser/manual

- [ ] Microsoft Edge stable test results, exact version noted.
- [ ] Google Chrome stable test results, exact version noted.
- [ ] YouTube regular, Shorts, Live, playlist and ad behavior checked.
- [ ] Keyboard, screen readers, contrast and reduced motion verified.
- [ ] No high impact CPU/memory regression from multi-tab EQ/limiter.

## Security/release

- [ ] Manifest permissions least-privilege review completed.
- [ ] All messaging payloads/senders validated and tests run.
- [ ] No remote code/unsafe CSP; external fonts/privacy evaluated.
- [ ] Dependency audit triaged, release artifacts inspected.
- [ ] README, CLAUDE.md, architecture, changelog, privacy policy updated.
- [ ] User-facing 300% hearing-risk warning is accurate; no impossible safety guarantee.
- [ ] Explicit release approval before store publication.

## Decision

`PASS` = all critical checks executed and passed; `CONDITIONAL` = automation passed, noncritical manual verification outstanding (do not label production ready); `BLOCKED` = P0/P1 failure or critical browser/audio check missing.


## Evidence for v2.3.0 (2026-10-26)

| Item | State |
|---|---|
| Six features implemented and documented | done (see CHANGELOG, CLAUDE.md) |
| Unit / integration / DSP / E2E present and passing | Vitest 168, DSP 10, E2E 14 - all passed locally on Chromium 156 |
| Coverage thresholds | 85 / 85 / 80 / 85 enforced; measured 98.0 / 98.0 / 90.5 / 96.2 |
| CI | `.github/workflows/ci.yml` written; **not yet run on GitHub** |
| Manifest least privilege | `storage` only, one host; validator passes |
| Dependency audit | production: 0; dev toolchain: 4 triaged (S8) |
| Edge stable / Chrome stable | **NOT RUN** (record exact versions here when done) |
| YouTube regular / Shorts / Live / playlist / ads | **NOT RUN** |
| Real extension reload, browser restart, duplicate-tab menu, two windows | **NOT RUN** |
| Real audio listening + hearing-risk wording review | **NOT RUN** |
| Screen reader pass | **NOT RUN** |

### Manual checks to run before release (record browser version, OS, date, result)
1. Load unpacked in Edge stable, then Chrome stable. Open two YouTube watch tabs in one window and two in another; set 30 / 100 / 200 / 300 % and confirm by ear that each tab keeps its own level; switch tabs and confirm nothing jumps.
2. Refresh each tab during playback: no loud burst before the set level; repeat after 5 SPA navigations (click a related video) and with playlist autoplay.
3. Shorts, a live stream, and a video with ads (ad start/end replaces the media element): level stays, no silence.
4. Boost on: play bass-heavy loud music at 300 % with limiter off then on; listen for pumping or distortion; with EQ Bass Boost + limiter on, confirm the EQ-on/off toggle is click-free.
5. Press each default shortcut (Alt+Up / Alt+Down / Alt+M / Alt+0), including with the search box focused; check for conflicts at `edge://extensions/shortcuts`; bind a preset.
6. Reload the extension from the extensions page without reloading a YouTube tab: popup must say to reload the tab; after reload everything works.
7. Close and reopen the browser with "continue where you left off": record whether tab volumes were restored.
8. Keyboard-only and screen-reader pass through the popup; 200 % zoom; Windows high contrast.
