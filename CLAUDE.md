# Volume+ — Chrome/Edge Extension
by relaxlikes.com | YouTube per-tab volume control (0–300%), limiter, 3-band EQ, presets, shortcuts

## What this does
Replaces YouTube's native volume slider with a custom one. Every YouTube **tab** has its own volume. Prevents YouTube from reverting volume on refresh, SPA navigation, or clip changes. >100% boost via Web Audio `GainNode`, with an optional peak limiter and Bass/Mid/Treble EQ in the same chain.

Version 2.3.0. Sections marked **(v2.2.1 baseline)** describe the older design and are kept for migration context.

---

## File roles

| File | World | When | Role |
|---|---|---|---|
| `src/injected.js` | MAIN | `document_start` | Patches `HTMLMediaElement.prototype.volume` + `Storage.setItem`; sets the tab's native 0–100% via the player API; validates `RL_APPLY` |
| `src/content.js` | Isolated | `document_idle` | **Per-tab state authority**; widget UI; audio graph manager wiring; popup port + message handler; native mute/key folding |
| `src/lib/state.js` | any | — | Pure: validation, `reduce()`, actions, `acceptUpdate()`, `pickTarget()`, `commandToAction()`, EQ profiles → `RL.state` |
| `src/lib/settings.js` | any | — | Pure: global settings schema v2, presets CRUD, legacy migration, tiny storage wrappers → `RL.settings` |
| `src/lib/audio-graph.js` | any | — | `createChain(ctx)` (EQ → gain → limiter) usable with `OfflineAudioContext`; `createManager()` lifecycle → `RL.audio` |
| `src/background.js` | SW | on command | Turns `chrome.commands` into `ACTION` messages for the right tab; stateless |
| `src/popup.html/js` | Extension page | on open | A view of ONE tab's state over a port; global settings editor |
| `manifest.json` | — | — | MV3; permissions **`storage` only**; host `https://www.youtube.com/*` only |

Libs are classic scripts that attach to `globalThis.RL` (content scripts cannot be ES modules); tests import them as side-effect scripts.

---

## Critical architecture decisions

1. **MAIN world** (`injected.js`) is the only place that can intercept YouTube's own `video.volume = x` and `localStorage` writes. Isolated-world patches have no effect on page code. Needs Chrome/Edge 111+.
2. **The tab's content script is the authority** for that document's state. The popup never writes volume to storage; it sends intents and renders what comes back. No service-worker state, so SW suspension is harmless.
3. **Per-tab persistence = `sessionStorage["rl_tab"]`** (per tab, per origin; survives refresh/SPA; copied to duplicated or script-opened tabs; gone when the tab closes). It is synchronous, so `injected.js` can read it at `document_start` before YouTube runs. `chrome.storage.session` was rejected: asynchronous, not readable in MAIN world, wiped on extension reload.
4. **`localStorage["rl_volume"]` is NOT a live volume any more** (it is origin-shared, i.e. leaks between tabs). It only holds the *new-tab default* mirror written by `content.js` (`min(defaultVolume,100)`) so a brand-new tab starts quietly before async settings load.
5. CustomEvents between worlds are not a security boundary — the page can fire them. `injected.js` accepts only `RL_APPLY {pct: finite 0..100, rev: int}` and the only effect is that page's own native volume.

---

## State model

Per tab (`sessionStorage["rl_tab"]`, validated field-by-field on load):
`{v, volume 0..300, muted, lastNonZero, limiter, eq:{enabled, profile, bass, mid, treble}, rev}`

- `volume` = **desired**, `effective = muted ? 0 : volume`. Mute is a flag; the volume is kept.
- `rev` increments on every accepted change. `epoch` (random per document load) is added to every message. `applied = {rev, pct, status: ok|pending|failed, reason}` reports what actually reached the player/graph. The UI claims a level only when `applied.rev === state.rev && status === 'ok'`.
- Boost >100% is allowed only while global `boost` is on; otherwise `reduce()` clamps to 100.
- A video routed into a non-running AudioContext is silent → `applied.pct = 0, status: failed, reason: needs-gesture|ctx-suspended`.

Global (`chrome.storage.local["rl_settings"]`, schema 2): `{v:2, boost, step 1..25, defaultVolume, presets[≤12 {id,name≤16,volume 0..300}]}`.

**Migration (idempotent):** if `rl_settings.v !== 2`, seed it from legacy `rl_boost` and `rl_volume` (legacy volume becomes the *new-tab default only*, capped at 100 when boost was off). Legacy keys are left untouched. Corrupt / partial `rl_settings` is repaired field by field; storage failure → in-memory defaults.

**New / duplicated tabs:** new tab → `defaultVolume`; duplicate or `window.open` without `noopener` → inherits opener's `sessionStorage` (verified in Chromium: E13); link `noopener` tab → default. Browser restart: session-restored tabs keep `sessionStorage` (browser-dependent; **manual check V13 pending**), others get the default. Extension reload/update: tab state survives but the old content script is orphaned until the tab is reloaded → popup shows "Reload the YouTube tab".

### Protocols

```
popup ──port "rl-popup"──▶ content   {type: PATCH|ACTION|GET_STATE, id, clientId, seq, patch|action,value}
content ──port──▶ popup              {type: REPLY, id, ok, error?, epoch, state, applied, boost, diag}
                                     {type: STATE, ...}   broadcast on every apply / settings change
background ──tabs.sendMessage──▶ content   {type: ACTION, action, value}
content ──CustomEvent──▶ injected    RL_APPLY {pct, rev}      injected ──▶ content  RL_APPLIED {rev, pct}, RL_INJECTED
```
- Content accepts only `sender.id === chrome.runtime.id && !sender.tab`.
- Per `clientId`, `seq <= lastSeq` is rejected (`stale-seq`). Popup applies `acceptUpdate()` (new epoch wins; higher rev wins; equal rev only if the ack moves forward).
- Rapid intents are reduced synchronously in arrival order (latest wins); `applyAudio(rev)` abandons itself if a newer rev arrived while it awaited the audio graph.

---

## Audio chain (see docs/AUDIO-ENGINE.md for measurements)

```
video → MediaElementSource (once per element) → input → bass(lowshelf 120Hz) → mid(peak 1kHz Q.9) → treble(highshelf 6kHz)
      → gain(eff>100 ? eff/100 : 1) → ┬ delay(≈8.7ms) → dry ────────────────────────┬→ out → destination
                                      └ compressor → trim(−4.33dB) → soft-clip → wet ┘   (cross-faded, never both at 1)
```
- Graph is created lazily (only when `effective>100` or EQ enabled) and is **never torn down**: `createMediaElementSource` is permanent for an element, so "bypass" = EQ bands at 0 dB / limiter dry leg — always exactly one audible route.
- Native volume carries 0–100%; at >100% native is locked at 100 and gain does the rest.
- Never routes a video into a context that is not `running`; blocked → reports `needs-gesture`, retries on the first pointer/key gesture.
- The compressor's automatic make-up gain (+4.33 dB measured in Chromium) is trimmed so the limiter is transparent below its threshold; the delay on the dry leg equals the wet leg's latency so toggling is phase-coherent. Both numbers are Chromium-measured and guarded by `tests/dsp`.
- Limiter = compressor + soft-clip, i.e. a **bounded ceiling (|sample| ≤ ~0.95) by construction**, not a true-peak/brick-wall limiter. Do not market it as one.

---

## Keyboard

- Browser-wide `commands` (manifest): Alt+Up / Alt+Down / Alt+M / Alt+0 suggested (Chrome allows at most 4 suggested), `preset-1..4` unbound. Users rebind at `chrome://extensions/shortcuts` / `edge://extensions/shortcuts`. Alt+Shift was avoided (Windows input-language switch).
- In-player: ↑/↓ = ±`step`, Shift = ±1, only after clicking inside `#movie_player`, ignored for editable targets (`isEditable`), ignored with Ctrl/Alt/Meta.
- Browser commands are intentionally not blocked while typing (they are Alt chords; the page cannot see them anyway).

---

## YouTube DOM selectors (may change if YouTube updates)

| Selector | Used for |
|---|---|
| `#movie_player` | Player API — `setVolume()`, `unMute()` |
| `.ytp-volume-area` | Widget injection point |
| `.ytp-volume-panel` | Hidden via CSS |
| `.html5-main-video` / `video` | Media element |
| `.ytp-mute-button` | Click intercepted → our mute flag |

`yt-player-volume` (localStorage) is rewritten by the `setItem` patch to the tab's native level. `allowSet` in `injected.js` gates writes: only our own `player.setVolume()` call passes; everything else is replaced by `nativePct/100`.

---

## Testing (all in `tests/`, run in CI)

| Command | What | Notes |
|---|---|---|
| `npm test` / `npm run test:coverage` | Vitest + jsdom: state, settings/migration, audio-manager lifecycle (fake AudioContext), injected.js, content.js integration, popup, background | coverage thresholds 85/85/80/85 |
| `npm run test:dsp` | Playwright Chromium `OfflineAudioContext` renders of the **real** `createChain` | flat response, band response, limiter reduction/ceiling, toggle & gain click-free, stereo, silence |
| `npm run test:e2e` | Unpacked extension in a persistent Chromium context, `youtube.com` routed to `tests/fixtures/youtube-fixture.html` | isolation, refresh, rapid intents, graph state, SPA, replaced video, keyboard, popup, a11y, duplicate tab |
| `npm run validate` | `scripts/validate-manifest.mjs` | permissions exactly `["storage"]`, files exist, no remote code/network APIs |

Fakes in unit tests prove logic only. Sound is proven by `test:dsp`; real YouTube, Edge/Chrome **stable**, multi-window and listening checks are manual (docs/RELEASE-CHECKLIST.md, docs/TEST-MATRIX.md).

---

## Known fragile points

- YouTube API/DOM changes (`#movie_player`, `.ytp-volume-area`, `yt-player-volume`).
- Autoplay policy can block the AudioContext until a user gesture (handled + reported).
- Cross-origin media without CORS would make `MediaElementSource` output silence (not detected; YouTube's own media is same-origin).
- An element already captured by an orphaned (pre-reload) content script cannot be re-captured: `source-failed` until the tab is reloaded.
- Page-wide prototype patches can conflict with other extensions touching `HTMLMediaElement.volume`.
- The compressor make-up/latency constants are Chromium-implementation measurements.
- SPA: the `MutationObserver` only runs while the widget is missing.

---

## Debugging

`injected.js` has `const LOG = () => {}` — replace with `console.log.bind(console, '[RL injected]')`. In the popup, *Sound → Audio engine* shows `diag` (status/reason, limiter reduction). From any extension page: `chrome.tabs.sendMessage(tabId, {type:'GET_STATE'})` returns `{state, applied, diag}`.

---

## Load / reload workflow

```bash
chrome://extensions/ → Developer mode → Load unpacked → select folder   (edge://extensions/ for Edge)
# After file changes: click ↻ on the extension card, then reload the YouTube tabs (content scripts are orphaned on reload)
```
Minimum browser: Chrome/Edge 111+ (`world: "MAIN"` content scripts).

---

## Volume+ engineering resources (knowledge pack)

Before implementation, consult `docs/README.md` and the project skills in `.claude/skills/` (`browser-extension-engineering`, `web-audio-engineering`, `volume-state-management`, `extension-quality-assurance`, `extension-security`, `volume-ui-accessibility`, `volume-ponytail-workflow`). The repo source is authoritative for implementation state; `docs/ARCHITECTURE.md`, `STATE-AND-MIGRATION.md`, `AUDIO-ENGINE.md`, `FEATURE-SPECS.md` were updated to describe what is implemented. If the official Ponytail plugin is installed prefer `/ponytail full`; run `/ponytail-audit` once early and `/ponytail-review` near integration. Never cut tests, validation, security or the six features for token savings. Do not claim tests passed unless executed; label unrun checks NOT RUN.

---

## (v2.2.1 baseline) Volume persistence — 3 layers, superseded

The old design: `HTMLMediaElement.prototype.volume` setter enforcement (kept), `Storage.setItem` rewrite of `yt-player-volume` (kept), and `localStorage["rl_volume"]` as the **live, origin-shared** volume read at `document_start` (**replaced** by per-tab `sessionStorage["rl_tab"]`; the key is now only the new-tab default seed). Old storage keys `rl_volume`/`rl_boost`/`rl_last_nonzero` in `chrome.storage.local` are migrated once into `rl_settings` and otherwise unused. Old protocol events `RL_INIT_VOLUME`, `RL_SET_VOLUME`, `RL_VOLUME_APPLIED` no longer exist. The popup used `chrome.scripting.executeScript` to set/read volume; that path (and the `scripting` and `tabs` permissions) was removed because the content-script port is the authoritative channel — with the cost that a tab not reloaded after an extension update can no longer be driven (the popup says so).
