# RELAXLIKES Volume+

A Chrome extension to set YouTube volume beyond 100% (up to 300%).

## How it works

- **0–100%**: Uses YouTube's native video volume.
- **101–300%**: Locks native volume at 100% and applies a **Web Audio API GainNode** to amplify the signal beyond the browser default.

## Install (unpacked)

1. Open Chrome → `chrome://extensions/`
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked** → select this `relaxlikes-volume/` folder
4. Open YouTube — the extension icon appears in the toolbar

> **Note:** Add icons named `icon16.png`, `icon48.png`, `icon128.png` in the folder (16×16, 48×48, 128×128 px). You can use any image for now — Chrome will use a default if missing.

## Usage

- Drag the **slider** or click a **preset** (25 / 50 / 100 / 150 / 200)
- Type any value (0–300) in the **Custom** field and hit **Apply** or Enter
- Volume persists across page navigations via `chrome.storage.local`

## Notes

- ⚠️ Volumes above 150% can be very loud — use carefully.
- If the extension shows "Reload the YouTube page", do a hard refresh (`Ctrl+Shift+R`) on YouTube.
- Works with YouTube's SPA navigation (video changes without full page reload).

---

RELAXLIKES Playground · POC Project
"# Volume-" 
