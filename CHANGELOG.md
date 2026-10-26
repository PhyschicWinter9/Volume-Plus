# Changelog — Volume+

---

## [2.3.0] — 2026-10-26

### Added
- **Independent per-tab volume** — each YouTube tab owns its volume, mute, last-nonzero level, limiter and EQ settings (kept in the tab's `sessionStorage`, which survives refresh and SPA navigation). Changing tab A never changes tab B. A brand-new tab starts at the global *new-tab default* (migrated from your old volume; change it with "Use current volume for new tabs"); a duplicated / script-opened tab inherits its opener's state; a link-opened (`noopener`) tab starts at the default.
- **Reliable volume sync** — one authoritative state per document with a monotonic `rev`, a per-load `epoch`, per-client sequence numbers and acknowledgements that only report what actually reached the player/audio graph. Popup, in-player widget, keyboard, YouTube's speaker button / `m` key and browser shortcuts all converge. Pending, applied and failed states are shown instead of assuming success.
- **Peak limiter** — dynamics compressor plus a soft-clip ceiling after it, cross-faded in/out without clicks. On by default. Measured, not a promise of zero clipping (see docs/AUDIO-ENGINE.md).
- **Keyboard shortcuts** — browser-wide commands (default Alt+↑ / Alt+↓ / Alt+M / Alt+0, plus four unbound preset slots), configurable key step (1–25 %), in-player ↑/↓ (Shift = 1 %), ignored while typing. The popup lists the live bindings and links to the browser's shortcut page.
- **Editable presets** — add, rename, edit, delete, reorder, restore defaults; validated 0–300 %, ≤12 presets, unique names; stored globally, applied to the selected tab only.
- **Mini equalizer** — Bass / Mid / Treble (±12 dB), Flat / Bass Boost / Vocal / Treble Boost / Custom profiles, enable/bypass, flat reset; smoothed parameters.
- Mute is now a separate flag: the volume you muted at is kept and restored.
- Popup: native-control layout with labelled controls, `aria-live` status, keyboard-reachable `<details>` sections, reduced-motion support, ≥4.5:1 text contrast.
- Tooling: Vitest unit/integration tests, Playwright DSP-rendering and extension E2E tests, coverage thresholds, manifest validator, GitHub Actions CI.

### Changed
- **Popup and in-player widget redesigned** (same dark + lime identity): volume is a large left-aligned value with one status line that says whether it is really applied; the slider draws the 100 % line and tints the boost zone amber; Boost mode moved onto the first screen; Sound, Presets and Settings are collapsed rows whose closed summary shows the current state ("Limiter on · EQ Flat"); emoji and text glyphs replaced by drawn icons; muted state is no longer shown in red (red now means failure only); system font stack with tabular numerals; body text >= 12 px; selection, scrollbar and focus rings themed.
- **Permissions reduced to `storage` only** (removed `tabs` and `scripting`); host access is still only `https://www.youtube.com/*`. The popup no longer injects scripts; it talks to the tab's content script over a port.
- **No third-party network requests** — the popup no longer loads Google Fonts (system font stack; DM Mono/Syne dropped).
- `localStorage["rl_volume"]` is no longer a live, origin-shared volume. It is only the synchronous *new-tab default* seed for `injected.js`; a tab's own state is read from its `sessionStorage`.
- Protocol between `content.js` and `injected.js` is now `RL_APPLY {pct 0–100, rev}` / `RL_APPLIED {rev, pct}` with strict validation (page-forged events can only set that page's own native volume).
- `injected.js` also enforces the tab's level on `loadstart`/`play`, so audio no longer starts at 100 % before the extension finishes loading.

### Fixed
- `injected.js` used to persist every change to the origin-shared `localStorage.rl_volume`, so the most recently touched tab's volume leaked into every refreshed tab.
- Volume above 100 % is no longer reported as applied when the Web Audio graph is unavailable or suspended.
- A media element is never routed into an AudioContext that is not running (that would silence it).

### Upgrade notes
- After updating, **reload open YouTube tabs** (old content scripts are orphaned by the extension update).
- Legacy keys (`rl_volume`, `rl_boost`, `rl_last_nonzero`) are read once into `rl_settings` (schema 2) and left in place so a downgrade keeps working.

---

## [2.2.1] — 2026-09-03

### Fixed
- **Popup not reflecting a volume change made on the player** — the popup only trusted `chrome.storage.local` and a message relay to `content.js`, which could go stale for player-driven changes (dragging the in-page widget) even though popup-driven changes always worked (that path writes directly). Restored `readYTVolume()` — documented in CLAUDE.md but missing from the actual code — which reads the live volume straight from the YouTube player API instead of relying on relayed state.

## [2.2.0] — 2026-09-03

### Added
- **Mute / unmute button** on the popup's volume display — remembers your last non-zero volume and restores it on unmute
- **Background-tab control** — the popup now controls YouTube even when it isn't the focused tab (prefers whichever YouTube tab is actually playing audio), instead of only working when YouTube is the active tab
- **Keyboard shortcuts in the popup** — ↑/↓ adjusts volume ±5%, Shift+↑/↓ fine-tunes ±1%, from anywhere in the popup that isn't a text field
- **Scroll wheel** on the popup's volume display, matching the in-page widget's existing wheel support

### Performance
- Dragging the volume slider (popup and in-page widget) no longer fires a native-volume apply / `chrome.storage` write per pixel of movement — both are now rAF-gated to at most once per animation frame, with an immediate flush on drag release
- The in-page `MutationObserver` used to watch the entire YouTube page for the extension's whole lifetime; it now disconnects the moment the volume widget is injected and only re-arms around SPA navigation, cutting a large source of ongoing overhead on a DOM as mutation-heavy as YouTube's

### Fixed
- Closed a persistence gap in the popup's direct volume-apply path: it now also mirrors the value to `localStorage['rl_volume']` so it survives a page refresh even if the message relay to `content.js` fails

## [2.1.1] — 2026-09-03

### Fixed
- **Popup taking 2-3 seconds to open** — the Google Fonts stylesheet was render-blocking; it now loads asynchronously (injected from `popup.js` after initial paint) so the popup opens instantly with a fallback font and swaps in the custom font once it arrives
- Removed the `onload=""` inline event handler used for the font-swap trick — extension pages enforce a strict default CSP (`script-src 'self'`) that blocks inline event handlers outright; the font is now loaded entirely from the external `popup.js` file instead
- **Popup forgetting the last-set volume** — volume set from the popup is now persisted to `chrome.storage.local` directly from the popup itself, instead of relying solely on a message relay to `content.js` that could silently fail (e.g. right after an extension reload, before the YouTube tab is refreshed), causing the popup to always fall back to the 100% default
- Popup no longer waits indefinitely on an unresponsive content script when reading the current volume on open (300ms timeout with fallback to stored value)

---

## [2.1.0] — 2026-06-08

### Added
- **Arrow key volume control** — press ↑ to increase and ↓ to decrease volume by 5% while the video player is active, matching YouTube's native keyboard behavior
- Arrow keys only intercept volume when the player has been clicked; clicking outside restores normal page scrolling
- YouTube's volume overlay now appears correctly when using arrow keys
- Volume slider is now keyboard-accessible via Tab key (arrow keys also work when slider is focused)

---

## [2.0.0]

### Added
- Custom volume slider injected directly into the YouTube player controls (replaces native slider)
- Volume boost up to **300%** via Web Audio API GainNode
- Volume persists across page refresh, SPA navigation, and clip changes
- Three-layer persistence: `localStorage` patch, `yt-player-volume` intercept, and `chrome.storage.local`
- Numeric input field — type any value and press Enter
- Scroll wheel support on the volume slider (±5% per tick)
- Boost mode toggle synced between player widget and popup
- Popup with preset buttons and boost toggle
- Prototype patch on `HTMLMediaElement.volume` prevents YouTube from overriding volume on restore
- `Storage.prototype.setItem` patch rewrites `yt-player-volume` so YouTube's own restore loads our value
- Supports Chrome and Edge (Manifest V3)

---
