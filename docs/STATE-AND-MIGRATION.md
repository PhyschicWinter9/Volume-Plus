# Tab state, synchronization and migration — proposed design contract

## IMPLEMENTED in v2.3.0 (authoritative)

| Decision | Chosen | Evidence |
|---|---|---|
| Live per-tab authority | The tab's **content script** (`src/content.js`), state reduced by pure `RL.state.reduce()` | unit `state.test.js`, `content.test.js`; E2E E02 |
| Per-tab durable store | `sessionStorage["rl_tab"]` (tab-scoped, synchronous in MAIN world) | `injected.test.js` bootstrap order; E2E E03 (after reload the video only ever reported `0.35`, never `1.0`) |
| Rejected | `chrome.storage.session` (async, not available synchronously in MAIN world, cleared on extension reload); origin-shared `localStorage` as live value (leaks between tabs) | design |
| Global settings | `chrome.storage.local["rl_settings"]` schema 2 `{boost, step, defaultVolume, presets}` | `settings.test.js` |
| New tab | `defaultVolume` (migrated from legacy volume; settable from the popup) | E2E E03 |
| Duplicate / script-opened tab | inherits opener's `sessionStorage` (Chromium copies it); `noopener` link tab gets the default | E2E E13 (script-opened tested; the real "Duplicate tab" menu item is NOT RUN) |
| Browser restart | session-restored tabs keep `sessionStorage` (browser behaviour); otherwise default | **NOT RUN (manual V13)** |
| Extension reload/update | tab state survives; old content script is orphaned, popup shows "reload the tab" | popup disconnect path unit-tested; real reload **NOT RUN (V12)** |
| Ordering | `rev` per state change, `epoch` per document, `clientId+seq` per sender, `acceptUpdate()` in the popup, `applyAudio(rev)` abandons itself when superseded | unit + E04 |
| Early bootstrap | `injected.js`: `rl_tab` then `localStorage.rl_volume` (new-tab default seed) then YouTube's value then 100; also enforced on `loadstart`/`play` | `injected.test.js`, E03 |
| Migration | `RL.settings.migrate()` is idempotent, leaves legacy keys in place, repairs corrupt v2, falls back to defaults if storage throws | `settings.test.js` (missing, NaN, negative, huge, junk, half-written v2, storage throws) |

Write rate: a volume change writes only `sessionStorage` (synchronous, local). `chrome.storage` is written only when the user edits global settings. Measured: 0 `chrome.storage` writes during 101 consecutive volume changes (E14).

Known gap: after updating, open YouTube tabs must be reloaded once (their old content scripts are orphaned).

---

*Original design notes follow (kept for rationale; where they say "proposed", the section above states what was implemented).*


## Goals

True tab isolation, correct rapid-update ordering, no reload volume spikes, and preserved legacy settings. Current `rl_volume` stored in page `localStorage` is shared across all YouTube tabs and **must no longer be the live volume authority**.

## Proposed data model

| Field | Scope | Notes |
|---|---|---|
| `volumePct` | per tab | 0–300 finite; desired intent |
| `appliedPct` | per tab/document | nullable pending/failed state |
| `muted`, `lastNonZeroPct` | per tab | mute independent from desired volume where possible |
| `boostEnabled`, `limiterEnabled` | per tab or explicit setting-derived policy | product must choose and document |
| `eqEnabled`, `eqProfile` | per tab active choice | presets/global EQ definitions stored globally |
| `revision`, `documentEpoch`, `requestId` | per tab/document | reject stale acknowledgements |
| `volumeDefaults`, `presets`, `keyboardStep` | global | preferences for new tabs, not live existing tabs |

A tab ID is unique only in its browser lifecycle; a document epoch or tab generation guards against stale responses and recycled IDs. If implementing trusted controller in the service worker, account for worker restart and at-least-once delivery.

## Transaction lifecycle

```text
Intent(tab, value) --> normalize and reject malformed
                   --> assign revision + pending state
                   --> apply to target document/audio manager
                   --> ack {revision, documentEpoch, appliedPct}
                   --> commit only if revision is current
                   --> notify the popup and in-player UI
```

Out-of-order, duplicate and stale acknowledgements are ignored; failures maintain a visible error and do not claim the requested value is audible.

## Storage policy choices (not yet decided)

- `chrome.storage.local`: global settings/defaults and durable migration metadata; avoid writing high-frequency slider events individually.
- `chrome.storage.session`: ephemeral tab map across service worker suspension, **not** across extension reload/update or browser restart.
- `sessionStorage` in MAIN world: possible synchronous origin/document bootstrap; test reload/duplicate/opened tabs and storage inheritance. This is an option, not a universal guarantee.
- `localStorage` shared by all YouTube tabs: legacy read only or global default, **never** independent live-tab authority.

## Boot edge case

`document_start` happens before async extension storage can deliver a tab's state. Do not introduce a brief unintended loud volume. Prototype-patch timing, YouTube's own restore behavior, per-tab bootstrap token and fallback defaults must be tested together; choose a deliberate documented algorithm after experiment.

## Migration algorithm (proposed, idempotent)

1. Capture old `chrome.storage.local.rl_volume`, page `localStorage.rl_volume` and `yt-player-volume` where available; validate strictly.
2. If no new schema exists, seed **new-tab default preference** from the best valid legacy setting, using deterministic precedence documented after inspecting how old versions wrote data.
3. Do NOT assign one existing tab's legacy volume to every other tab as though it were its own personal state.
4. Write schema version and completion flag atomically where possible; tolerate interruption and repeat safely.
5. Once confirmed, stop live writes to shared page `rl_volume`; retain compatibility reading only for a defined transition period.
6. Test upgrade, rollback considerations, corrupted strings, NaN, two simultaneous tabs and storage failure.

## Mandatory product decisions

- Will tab volumes survive browser restart? If yes, do not key durable state only by ephemeral `tabId`; define recovery identity and privacy impacts.
- What happens on duplicate tab? Inherit opener tab's volume or start from default? Test browser variations.
- How does a new YouTube tab initialize before its first ack?
- Can EQ/limiter be per-tab or global? UI must make scope explicit.
- How do YouTube native shortcuts and its own volume storage interact with the new state controller?

Until decisions and browser verification are complete, do not mark this architecture as implemented.
