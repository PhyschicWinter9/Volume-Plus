# Architecture — observed baseline and target boundaries

> **Status v2.3.0:** the "proposed modular ownership" below is implemented as: *tab controller + per-tab state controller* = `content.js` + `lib/state.js`; *YouTube adapter* = `injected.js`; *audio graph manager* = `lib/audio-graph.js`; *UI projections* = popup + widget; *settings storage* = `lib/settings.js`; `background.js` only routes browser shortcuts. A service-worker controller was deliberately **not** built: the document that owns the audio also owns its state, so there is no cross-context state to lose when the service worker sleeps. See `CLAUDE.md` for the authoritative description.

## Observed baseline (public main at 2026-10-26)

- `manifest.json` v2.2.1, `storage`, `tabs`, `scripting`, only `https://www.youtube.com/*` host.
- `src/injected.js`: MAIN world at `document_start`; reads `localStorage.rl_volume` synchronously; intercepts `HTMLMediaElement.prototype.volume` and `Storage.prototype.setItem` to manage YouTube restore behavior; uses DOM CustomEvents.
- `src/content.js`: isolated world at `document_idle`; manages in-player UI and Web Audio `AudioContext`, `GainNode`, `MediaElementAudioSourceNode`, plus storage.
- `src/popup.js`: popup with volume controls and `chrome.scripting.executeScript` for some player actions/readback.
- `CLAUDE.md` records `RL_INIT_VOLUME`, `RL_SET_VOLUME`, `RL_VOLUME_APPLIED`, `RL_INJECTED` event protocol.

## Current workflow (conceptual)

```text
Popup UI ---- chrome.scripting/runtime operations ----> current YouTube tab
                   |                                   |
                   v                                   v
             storage.local                        content.js (isolated)
                                                        |
                                                   CustomEvent
                                                        v
                                                injected.js (MAIN)
                                                        |
                                                    YouTube APIs

content.js ---- MediaElementSource -> GainNode -> AudioContext.destination
```

## Proposed modular ownership

- **Tab controller** (trusted extension context or documented equivalent): resolve tab identity, route commands, survive popup close.
- **Per-tab state controller**: accept intent, revision/order, apply acknowledgement, default settings, migration.
- **YouTube adapter**: MAIN-world native volume player manipulation with narrow prototype patches if unavoidable.
- **Audio graph manager**: per-media-element Web Audio source ownership, graceful graph path/bypass, limiter and EQ.
- **UI projections**: popup and in-player components render state; neither owns the authoritative live state.
- **Settings storage**: global preset definitions and defaults only; session/persistent tab state policy separately documented.

## Context boundaries and command semantics

1. Popup identifies the active tab from a verified extension API response; target tab ID cannot be page supplied.
2. Tab controller validates command and assigns monotonically ordered revision, sends to proper document.
3. Content audio manager applies graph/native player changes and returns actual outcome.
4. State controller records `applied` only with successful acknowledgement from matching revision/document epoch.
5. UI can optimistically show `pending`, then `applied` or `failed`; popup closure must not interrupt processing.

## Architectural hazards

- YouTube localStorage is origin shared, not per-tab.
- Legacy `rl_volume` early boot is synchronous, whereas browser extension storage reads are asynchronous.
- MAIN-world CustomEvents are not secure/privileged channels.
- Media element replacement requires per-element graph ownership.
- `chrome.storage.session` resets on browser restart and extension reload/update, so it cannot guarantee persisted per-tab state by itself.
- Page-wide prototype modifications affect third-party page code and may conflict with other extensions.

## Change order

1. Baseline + tests. 2. State contract and migration. 3. Audio graph lifecycle. 4. Limiter/EQ. 5. Presets/shortcuts/UI. 6. E2E/live browser release verification.
