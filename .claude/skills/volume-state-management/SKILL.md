---
name: volume-state-management
description: Implement or debug Volume+ independent per-tab volume state, reliable synchronization among popup/content/MAIN-world audio/UI, revision ordering, persistence, migration from rl_volume, reload handling, and multi-window lifecycle. Use for any volume, mute, tab, storage or event protocol change.
---

# Per-tab state and reliable synchronization — Volume+

## Required reading

Read `docs/STATE-AND-MIGRATION.md` and `docs/ARCHITECTURE.md`, then inspect `CLAUDE.md`, `src/injected.js`, `src/content.js`, `src/popup.js`.

## Existing high-risk behavior to preserve/migrate

The current `MAIN`-world `injected.js` reads YouTube-origin `localStorage['rl_volume']` synchronously at `document_start`. YouTube localStorage is shared by tabs of the same origin; this conflicts with truly independent per-tab volume. The current `chrome.storage.local['rl_volume']` is also a shared preference. Never simply rename this key without specifying how early initialization, existing users and tab isolation work.

## Proposed state model (must validate against implementation)

`TabVolumeState = { tabId [trusted extension context], desiredPct 0..300, appliedPct 0..300 | null, muted:boolean, lastNonZeroPct, boostEnabled:boolean, eqEnabled:boolean, eqPresetId?, limiterEnabled:boolean, revision:integer, documentEpoch:string, status:'pending'|'applied'|'failed' }`.

Global preferences: volume defaults for **new** tabs, preset definitions/order, keyboard step, optional default EQ settings and limiter policy. A global preference is NOT the live volume of every existing tab.

State authority should survive popup closure. Tab-scoped storage can use `chrome.storage.session` in the trusted extension context **if service worker ownership is justified**. Its state is cleared on extension reload/update/browser restart. Decide explicitly what is persisted and how to restore it. Do not assume `chrome.storage.session` is readable by `MAIN` world at `document_start`.

## Message contract

Messages must carry validated `type`, `documentEpoch`, `revision`, `desiredPct` and optional `requestId`. Use sender-provided `tab.id` from the extension runtime; reject a page-supplied `tabId` as authority.

Suggested actions: `GET_TAB_STATE`, `SET_TAB_VOLUME`, `SET_TAB_MUTE`, `SET_EQ`, `SET_LIMITER`, `APPLIED`, `FAILED`, `TAB_DOCUMENT_READY`. Names are illustrative, not an existing API.

- Validate finite integer/number range and canonicalize values once.
- Only the most recent accepted revision per tab/document may update the rendered state.
- Distinguish desired state from audio applied state; failure must not be acknowledged as success.
- Incoming late acknowledgements from a previous document epoch must be ignored.
- Popup reopening reads authoritative tab state and subscribes/refreshes responsibly, not duplicate-blind broadcasting.

## Cold-start decision (design before coding)

Investigate origin `sessionStorage` for synchronous tab-document bootstrap (its semantics differ across reload, newly opened/duplicated tabs and cloned browsing contexts), a safe early default followed by async reconciliation, or another verified mechanism. Model undesirable loudness jumps explicitly. Never use an origin-wide localStorage live-volume key as a silent per-tab authority.

## Test table

- Two tabs 50% and 200%, then change either: no cross-tab volume changes.
- Switch active tab while popup open: never control stale target.
- Rapid 100→180→60→300 updates with out-of-order delivery: final applied 300.
- Mute 180→0→unmute: restore 180 only in same tab.
- Refresh and SPA navigation: documented persistence behavior, no audio spikes.
- Close tab and recycle its numeric ID: old state cannot leak into new tab.
- Extension reload/update and browser restart: documented fallback, safe restoration, no falsely promised persistence.
- First install and upgrade from legacy `rl_volume`: migration once, no data loss.

## Output

Document adopted storage policy and cold-start tradeoffs in `docs/STATE-AND-MIGRATION.md`; add data migration and concurrency tests before requesting release.
