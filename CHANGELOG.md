# Changelog — Volume+
by relaxlikes.com

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
