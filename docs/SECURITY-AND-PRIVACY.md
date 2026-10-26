# Security and privacy threat model

## Findings and status for v2.3.0

| # | Finding | Severity | Status |
|---|---|---|---|
| S1 | v2.2.1 requested `tabs` + `scripting` (script injection into YouTube from the popup) | P2 least privilege | **Fixed**: permissions are exactly `["storage"]`; enforced by `scripts/validate-manifest.mjs`; E2E E01 shows the popup still lists tab titles and queries by URL through the host permission alone |
| S2 | Popup loaded Google Fonts (third-party request on every open) | P2 privacy | **Fixed**: system font stack; the validator rejects external script/stylesheet/font URLs and any fetch/XHR/WebSocket/beacon |
| S3 | MAIN-world `RL_*` CustomEvents are forgeable by the page | P3 accepted | **Mitigated**: only `RL_APPLY {pct: finite 0-100, rev: int}` is accepted (11 malformed payloads tested); worst case a page changes its own native volume |
| S4 | Runtime messages could come from any extension context | P2 | **Fixed**: content script accepts only `sender.id === runtime.id && !sender.tab`; ports must be named `rl-popup` and pass the same check; commands use a closed vocabulary; unknown patch keys are rejected (tested) |
| S5 | Prototype patches (`HTMLMediaElement.volume`, `Storage.setItem`) affect other page code | P3 inherent | **Narrowed**: the `setItem` rewrite applies only to `localStorage["yt-player-volume"]`; conflicts with other extensions **NOT tested** |
| S6 | Shared `localStorage` leaked one tab's volume to others | P2 correctness | **Fixed** (per-tab `sessionStorage`) |
| S7 | Extension CSP | n/a | default kept; validator forbids `content_security_policy`, `web_accessible_resources`, `externally_connectable` |
| S8 | `npm audit` reports 4 findings (2 critical, 2 moderate) in the Vitest 3 toolchain (`tinypool`, `@vitest/mocker`) | P3 | **Triaged**: dev-only; `npm audit --omit=dev` finds 0; the package contains only `manifest.json`, `src/`, `icons/`. Upgrading to Vitest 4 is a breaking change left for a follow-up |
| S9 | CI | n/a | `permissions: contents: read`; no publish step |

Privacy: no analytics, telemetry or network calls. Stored data: `sessionStorage["rl_tab"]` (this tab's volume/EQ), `localStorage["rl_volume"]` (one number), `chrome.storage.local["rl_settings"]` (presets, step, boost flag, default volume) and the three legacy keys until the user clears the extension's data. Nothing leaves the device.

---

*Original design notes follow (kept for rationale; where they say "proposed", the section above states what was implemented).*


## Inventory from observed v2.2.1 manifest

Permissions: `storage`, `tabs`, `scripting`. Host scope: `https://www.youtube.com/*`. `src/popup.js` loads a Google Fonts stylesheet. Audit whether remote font requests are appropriate for extension store requirements and privacy; prefer bundled licensed assets if needed.

## Trust boundaries

| Boundary | Threat | Mitigation |
|---|---|---|
| MAIN world ↔ DOM CustomEvent ↔ content script | Page script forges/observes events | Strict schema, limited intents, no secrets/privileged page-supplied target tabs |
| Popup ↔ tab target | Wrong tab, stale tab or misleading URL | Browser API tab ID, canonical parsed hostname, validate current document/epoch |
| Browser message API | Spoofed/cross-origin sender | Validate sender ID, tab and origin based on context; reject unexpected messages |
| Web Audio processing | High output, silence on failure | Safe defaults, limiter with measured claims, accurate status, cleanup and recovery |
| Storage | Malformed or shared data | Schema validation, versioned migration, per-tab isolation, bounded writes |
| Supply chain / CI | Compromised dependency/action | Lockfiles, dependency review, minimal token permissions and controlled publish |

## Data minimization

Only collect/store settings necessary for operating the extension. Do not introduce browsing history, telemetry, analytics or network services by default. If external font/CDN requests remain, document them accurately. Never imply the extension can guarantee hearing safety.

## Audit procedure

1. Read live manifest and all API usage; map calls to declared permissions.
2. Examine message parsing and host URL checks (`new URL`, exact allowed hostnames).
3. Fuzz value inputs (`NaN`, Infinity, enormous strings, `null`, prototypes/arrays).
4. Exercise code while multiple other extensions are loaded to detect MAIN-world patch conflict when feasible.
5. Inspect browser DevTools Network panel for unrequested external connections.
6. Check CSP, release ZIP contents, code injection restrictions and store policy.
7. Rank findings P0–P3 with evidence; distinguish static-review risks from confirmed exploits.

## Privacy notice checklist

Explain that the extension modifies media volume on supported sites, where settings are stored, retention/removal, required permissions, remote font/network resources (if any), whether data is transmitted or sold (only factual claims verified), and contact/support route.
