---
name: browser-extension-engineering
description: Design or refactor the Volume+ Chrome/Edge Manifest V3 extension, including isolated versus MAIN worlds, tabs, background scripts, runtime messaging, browser commands, YouTube SPA integration, and lifecycle. Use for extension architecture, service worker, popup, content script or manifest changes.
---

# Browser extension engineering — Volume+

## Load context (progressively)

1. Read `CLAUDE.md` and `manifest.json`; verify branch/version.
2. Read `docs/ARCHITECTURE.md` and `docs/REFERENCE-INDEX.md`.
3. Inspect affected source and callers before editing, currently `src/injected.js`, `src/content.js`, `src/popup.js`, `src/popup.html`.
4. For changes to tab state, invoke/use `volume-state-management`; for audio graphs use `web-audio-engineering`; for release behavior use `extension-quality-assurance`.

## Non-negotiable invariants

- Keep MV3; do not invent persistent background DOM access. A service worker may suspend between events.
- MAIN-world code can touch page-owned prototypes/YouTube internals but should not assume unrestricted Chrome extension APIs. Keep privileged operations in trusted extension contexts.
- DOM CustomEvents crossing page/isolated worlds are not authentication; validate payloads, never send secrets or privileged instructions via untrusted events.
- A browser tab ID must be derived from extension APIs, never from user/page-controlled payloads.
- The popup may close at any time. It must not be the authoritative state store.
- Do not assume every `youtube.com` substring implies the YouTube host; parse URLs and check host.
- No unnecessary host permissions, remote executable code, tracking, or accidental cross-tab broadcasting.

## Engineering workflow

1. Write a sequence diagram for the affected user action: popup > extension bridge > content > MAIN-world player > audio engine > acknowledgement > UI.
2. Identify browser permissions and execution contexts; verify each API is callable there.
3. Define lifecycle transitions: first install, ordinary navigation, SPA video change, tab switch/close, refresh, extension update/reload, browser restart.
4. Avoid hidden retry loops: bounded waits, event-driven readiness and diagnostics.
5. Keep state reconciliation idempotent; duplicate messages or events must not duplicate audio graph connections.
6. Add regression tests for every observed bug and document manual tests for real YouTube behavior.

## Review checklist

- Has the `MAIN` world prototype interception been evaluated for compatibility? Is it necessary and scoped?
- Does the extension degrade gracefully when YouTube player methods or DOM selectors change?
- Can tab/window lifecycle change state unexpectedly?
- Are duplicate content scripts and stale listeners safely detected?
- Are tab IDs, message senders, types and data validated?
- Does `manifest.json` contain only permissions justified by actual call sites?

## Deliverable

Return changed files, architecture consequences, permissions diff, verification commands with actual results, and remaining Edge/Chrome/manual verification. Do not claim compatibility based only on Chromium automated tests.
