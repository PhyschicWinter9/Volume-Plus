# Official API, testing and agent references

Checked against available official web sources around 2026-10-26. Link targets may move later; verify updated API docs before implementation. These are external **links and brief notes**, not copied documentation.

## Browser extensions

- [Chrome extensions — Develop](https://developer.chrome.com/docs/extensions/develop) — MV3 concepts and tutorials.
- [Chrome Tabs API](https://developer.chrome.com/docs/extensions/reference/api/tabs) — trusted tab selection, IDs, lifecycle.
- [Chrome Storage API](https://developer.chrome.com/docs/extensions/reference/api/storage) — `local`, `session`, `sync`, quotas and lifecycle.
- [Chrome Commands API](https://developer.chrome.com/docs/extensions/reference/api/commands) — manifest `commands`, conflicts and remapping.
- [Chrome Runtime messaging](https://developer.chrome.com/docs/extensions/develop/concepts/messaging) — messaging lifecycles and sender context.
- [Chrome Content scripts](https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts) — worlds and restrictions.
- [Chrome Extension service worker lifecycle](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle) — suspension, activation, durable state.
- [Microsoft Edge extensions](https://learn.microsoft.com/en-us/microsoft-edge/extensions/) — packaging, compatibility, testing, publishing.

## Web Audio and controls

- [MDN Web Audio API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API)
- [AudioContext.createMediaElementSource](https://developer.mozilla.org/en-US/docs/Web/API/AudioContext/createMediaElementSource) — media routing.
- [GainNode](https://developer.mozilla.org/en-US/docs/Web/API/GainNode) — gain multiplier.
- [BiquadFilterNode](https://developer.mozilla.org/en-US/docs/Web/API/BiquadFilterNode) — low-shelf, peaking, high-shelf filters.
- [DynamicsCompressorNode](https://developer.mozilla.org/en-US/docs/Web/API/DynamicsCompressorNode) — compression, NOT automatically a brick-wall limiter.
- [OfflineAudioContext](https://developer.mozilla.org/en-US/docs/Web/API/OfflineAudioContext) — deterministic offline DSP rendering.
- [HTMLMediaElement.volume](https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement/volume) — media playback volume semantics.

## Tests, accessibility and CI

- [Vitest Guide](https://vitest.dev/guide/) — unit/integration test runner.
- [Vitest Coverage](https://vitest.dev/guide/coverage.html) — coverage provider and thresholds.
- [Playwright Chrome extensions](https://playwright.dev/docs/chrome-extensions) — persistent Chromium contexts, unpacked extensions, service worker.
- [Playwright Testing](https://playwright.dev/docs/intro) — test runner and browser tools.
- [GitHub Actions](https://docs.github.com/en/actions) — automation workflows and permissions.
- [WAI-ARIA Authoring Practices — Slider](https://www.w3.org/WAI/ARIA/apg/patterns/slider/) — semantic slider interactions.
- [WCAG Quick Reference](https://www.w3.org/WAI/WCAG22/quickref/) — accessibility checklist.

## Claude Code skills and prompt management

- [Claude Code Skills](https://code.claude.com/docs/en/skills) — project skills in `.claude/skills/<name>/SKILL.md`.
- [Anthropic Skills / skill-creator](https://github.com/anthropics/skills/tree/main/skills/skill-creator) — optional skill evaluation/authoring; **not redistributed in this pack**.

## Token-aware Claude Code workflow

- [Ponytail — official repository](https://github.com/DietrichGebert/ponytail) — minimal-complete-change engineering principles, plugin and commands.
- [Ponytail — official installation](https://github.com/DietrichGebert/ponytail/blob/main/INSTALL.md) — separate Claude Code marketplace and plugin install commands.
- [Ponytail — official skill](https://github.com/DietrichGebert/ponytail/blob/main/skills/ponytail/SKILL.md) — upstream skill, **not redistributed** in this pack.
- [Ponytail integration (local)](PONYTAIL-INTEGRATION.md) — recommended full mode and test-preserving token discipline for Volume+.

## Repository current-source links

- [Volume+ repository](https://github.com/PhyschicWinter9/Volume-Plus)
- [Volume+ current manifest](https://github.com/PhyschicWinter9/Volume-Plus/blob/main/manifest.json)
- [Volume+ current Claude notes](https://github.com/PhyschicWinter9/Volume-Plus/blob/main/CLAUDE.md)
- [Content audio implementation](https://github.com/PhyschicWinter9/Volume-Plus/blob/main/src/content.js)
- [YouTube MAIN-world integration](https://github.com/PhyschicWinter9/Volume-Plus/blob/main/src/injected.js)
