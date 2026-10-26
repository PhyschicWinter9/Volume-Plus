---
name: extension-security
description: Security/privacy review for Volume+ extension permissions, MAIN-world prototype patches, untrusted DOM events, runtime message validation, tabs and scripting APIs, CSP, dependencies, storage, and safe GitHub Actions releases. Invoke before privileged API, manifest, messaging or release changes.
---

# Extension security — Volume+

Read `docs/SECURITY-AND-PRIVACY.md`, `docs/REFERENCE-INDEX.md`, actual `manifest.json` and affected code before changes.

## Security boundaries

- Treat YouTube page script data and DOM events as untrusted; an arbitrary page script can forge CustomEvents.
- Privileged extension-side operations must validate sender, host, command type, payload length, finite numeric ranges and target tab.
- MAIN world must not receive secrets or token-bearing messages.
- Page-wide patches to `Storage.prototype` or `HTMLMediaElement.prototype` can cause compatibility breakage; audit scope, error behavior and interactions with other extensions.
- No `eval`, remote executable scripts, or runtime code download; honor MV3 CSP restrictions.
- Match origins precisely, not by URL substring.
- Do not request permissions until concrete code paths need them.
- Store only settings required for operation. Explain any network requests, fonts or external assets in privacy documentation.

## Audit method

1. Inventory manifest permissions and actual call sites.
2. Draw data flows across popup, service worker, content script, MAIN world, storage, external resources.
3. Classify trust boundaries and attack scenarios.
4. Add validation tests for forged messages, malformed values, stale tab IDs and unauthorized websites.
5. Audit dependencies and workflow permissions; pin automation actions to trusted versions or SHAs per repository policy.
6. Document remaining risks without inventing a clean bill of health.

## Deliver

Findings ranked P0–P3 with evidence and reproducible cases; minimal privilege changes; positive and negative verification results; updated security documentation if permissions/data flows change.
