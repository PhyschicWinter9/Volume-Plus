# Changelog — Volume+

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
