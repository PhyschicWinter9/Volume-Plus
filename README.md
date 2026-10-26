# RELAXLIKES Volume+

A Chrome / Edge (Chromium 111+) extension that gives each YouTube tab its own volume, up to 300 %, with a peak limiter, a mini equalizer, editable presets and keyboard shortcuts.

## How it works

- **0–100 %**: YouTube's native video volume.
- **101–300 %** (needs *Boost mode*): native volume locked at 100 %, a Web Audio `GainNode` amplifies the signal; an optional limiter and 3-band EQ sit in the same chain.
- **Per tab**: every YouTube tab keeps its own volume / mute / EQ / limiter. Presets, key step, Boost mode and the new-tab default are global settings.

## Install (unpacked)

1. `chrome://extensions/` (or `edge://extensions/`) → enable **Developer mode**
2. **Load unpacked** → select this folder (the one containing `manifest.json`)
3. Reload any open YouTube tabs

## Usage

- Popup: slider, custom value, presets, mute, *Sound* (limiter + EQ), *Edit presets*, *Settings & shortcuts*.
- In the player: drag the small slider, type a value, scroll over it, or click the player and use ↑/↓ (Shift = 1 %).
- Browser shortcuts (default **Alt+↑ / Alt+↓ / Alt+M / Alt+0**, presets 1–4 unbound) — change them at `chrome://extensions/shortcuts` (`edge://extensions/shortcuts`); the popup shows the live bindings.

## Notes

- Volumes above 150 % can be very loud. The limiter reduces peaks but cannot repair distorted sources or guarantee hearing safety.
- Boosting needs the browser to allow audio; if it is blocked the popup says so and recovers after you click the page.
- If the popup says *reload the YouTube tab*, the tab was open before the extension was installed/updated.

## Development

```bash
npm ci
npm test                 # unit + integration (Vitest)
npm run test:coverage    # with coverage thresholds
npm run test:dsp         # real OfflineAudioContext rendering (Playwright Chromium)
npm run test:e2e         # unpacked extension + local YouTube-like fixture (no network)
npm run validate         # manifest / permission / packaging checks
```

See `CLAUDE.md` and `docs/` for architecture, state model, audio engine, security and the test matrix.

---

RELAXLIKES Playground
