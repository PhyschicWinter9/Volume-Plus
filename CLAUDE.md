# Volume+ — Chrome/Edge Extension
by relaxlikes.com | YouTube custom volume control (0–300%)

## What this does
Replaces YouTube's native volume slider with a custom one. Prevents YouTube from reverting volume on refresh, SPA navigation, or clip changes. Supports >100% boost via Web Audio API GainNode.

---

## File roles

| File | World | When | Role |
|---|---|---|---|
| `injected.js` | MAIN | `document_start` | Patches prototypes, reads/writes localStorage, applies volume via player API |
| `content.js` | Isolated | `document_idle` | Injects player UI, manages GainNode boost, bridges chrome.storage ↔ injected.js |
| `popup.html/js` | Extension page | On open | User controls — uses `chrome.scripting.executeScript` to read/set volume |
| `manifest.json` | — | — | MV3, declares both content scripts, requires `scripting` + `tabs` + `storage` |

---

## Critical architecture decision

Content scripts run in an **isolated JS world** — `Object.defineProperty` and `localStorage` patches made there have zero effect on YouTube's code. Everything that needs to intercept YouTube must run in **MAIN world** via `injected.js` (`world: "MAIN"` in manifest content_scripts).

Communication between worlds: `document.dispatchEvent(new CustomEvent(...))` — both worlds share the DOM.

---

## Event protocol (content.js ↔ injected.js)

```
content  →  injected : RL_INIT_VOLUME  { volume: number }   early init from chrome.storage
content  →  injected : RL_SET_VOLUME   { volume: number }   apply new volume
injected →  content  : RL_VOLUME_APPLIED { volume: number } confirmation
injected →  content  : RL_INJECTED                          ready signal
```

---

## Volume persistence — 3 layers

YouTube saves/restores from `localStorage["yt-player-volume"]`. Three things prevent it overriding us:

1. **`HTMLMediaElement.prototype.volume` setter** — intercepts all `video.volume = x` calls in MAIN world. When `allowSet = false`, enforces `currentVolume` instead of YouTube's value.
2. **`Storage.prototype.setItem` patch** — rewrites `yt-player-volume` payload whenever YouTube writes it.
3. **`localStorage["rl_volume"]`** — our own key, read by `injected.js` synchronously at `document_start` BEFORE YouTube runs. This is what fixes the refresh/navigation revert bug. Without this, `currentVolume` starts at 100 and the prototype patch enforces 100% until content.js loads.

**Key invariant:** `rl_volume` in `localStorage` must always equal the user's last set volume. It's written in `injected.js → persistVolume()` on every volume change.

---

## Storage keys

| Key | Storage | Written by | Read by | Purpose |
|---|---|---|---|---|
| `rl_volume` | `localStorage` | injected.js `persistVolume()` | injected.js startup | Synchronous init before YouTube runs |
| `rl_volume` | `chrome.storage.local` | content.js `setVolume()` | content.js, popup.js | Persistent across browser sessions |
| `rl_boost` | `chrome.storage.local` | content.js, popup.js | content.js, popup.js | Boost mode enabled flag |
| `yt-player-volume` | `localStorage` | YouTube (intercepted) | YouTube | Intercepted and rewritten by us |

---

## Boost mode (>100%)

```
video → MediaElementSourceNode → GainNode (gain = pct/100) → AudioContext.destination
```

- Native player locked at 100% via `player.setVolume(100)` when boost active
- GainNode created once on first boost request (`connectBoost()` in content.js)
- Requires user gesture before AudioContext can be created (browser policy)
- `boostActive` flag prevents double-connection

---

## YouTube DOM selectors (may change if YouTube updates)

| Selector | Used for |
|---|---|
| `#movie_player` | Player API — `setVolume()`, `unMute()` |
| `.ytp-volume-area` | Widget injection point |
| `.ytp-volume-panel` | Hidden via CSS, `aria-valuenow` read for current volume |
| `.ytp-volume-slider-handle` | Manually updated CSS `left` position (0.77 scale factor) |
| `.html5-main-video` / `video` | Direct volume element |
| `.ytp-mute-button` | Simulated click to un-mute |

**0.77 scale factor** — YouTube's slider handle doesn't map 1:1 to percentage. `handle.style.left = volume * 0.77 + "%"` matches YouTube's native behavior.

---

## `allowSet` flag

In `injected.js`, `allowSet` gates whether `video.volume` writes are allowed through the prototype patch.

```javascript
allowSet = true;
player.setVolume(pct);        // this internally calls video.volume = x
setTimeout(() => allowSet = false, 80); // short window for async processing
```

If `allowSet` is `false` and YouTube tries `video.volume = 0.23`, the setter silently enforces `currentVolume / 100` instead.

---

## Popup reads volume from YouTube DOM, not JS cache

`readYTVolume()` in popup.js uses `chrome.scripting.executeScript` to read `aria-valuenow` from `.ytp-volume-panel`. This is the authoritative current state — not a cached JS value that could be stale after YouTube restores.

---

## Known fragile points

- YouTube API changes — if `#movie_player`, `.ytp-volume-panel`, or `yt-player-volume` localStorage key are renamed, things break
- AudioContext requires user gesture — boost may fail on fresh tab with no interaction
- `allowSet` 80ms window — if YouTube's restore happens after 80ms, the prototype patch still blocks it (that's fine), but our `player.setVolume` call within the window should complete synchronously
- SPA navigation — `MutationObserver` in content.js handles re-injection of the player widget; `yt-navigate-finish` / `onStateChange` events trigger `reApply()`

---

## Debug logs

Active in current build. All `[RL injected]` logs appear in YouTube's DevTools console.

Key things to verify when debugging:
- `rl_volume in localStorage: "25"` → value was persisted
- `currentVolume initialized to: 25` → injected.js started correctly
- `volume set BLOCKED → YouTube wanted 1 | enforcing 0.25` → prototype patch working
- `localStorage yt-player-volume intercepted` → storage patch working
- `RL_INIT_VOLUME received: 25` → content.js → injected.js bridge working

To remove debug logs for production: delete `const LOG = ...` and all `LOG(...)` calls in `injected.js`, and `console.error/log` calls in `content.js`.

---

## Load / reload workflow

```bash
# Chrome
chrome://extensions/ → Developer mode → Load unpacked → select folder
# After file changes: click ↻ on extension card → Ctrl+Shift+R on YouTube

# Edge  
edge://extensions/ → Developer mode → Load unpacked → select folder
```

Minimum browser: Chrome/Edge 111+ (March 2023) — required for `world: "MAIN"` in content_scripts.
