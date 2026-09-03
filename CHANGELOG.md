# Changelog — Volume+
by relaxlikes.com

---

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
