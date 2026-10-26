# Instructions to MERGE into existing CLAUDE.md

**Do not replace the repository's current `CLAUDE.md`.** It documents the original MAIN/isolated-world behavior that will be needed during migration. Review and reconcile the following section with current code before adding it.

```markdown
## Volume+ engineering resources (knowledge pack)

Before implementation, consult `docs/README.md` and the relevant project skills in `.claude/skills/`:
- `browser-extension-engineering` for MV3, permissions, popup/content/MAIN worlds and YouTube SPA.
- `web-audio-engineering` for AudioContext, GainNode, dynamics/limiter, EQ and audio regressions.
- `volume-state-management` for per-tab isolation, storage migration and Reliable Volume Sync.
- `extension-quality-assurance` for unit/integration/DSP/E2E, CI and release gates.
- `extension-security` for privileged APIs, message boundaries, CSP and privacy.
- `volume-ui-accessibility` for popup/player UX, keyboard, accessible controls and motion.
- `volume-ponytail-workflow` for a minimal-complete-change workflow and token-conscious context usage.

If the official [Ponytail plugin](https://github.com/DietrichGebert/ponytail) is installed by the user, prefer `/ponytail full` and consult `docs/PONYTAIL-INTEGRATION.md`; avoid duplicating its extensive guidance. Use `/ponytail-audit` once early and `/ponytail-review` near integration, not indiscriminately on every small change. If unavailable, the project-specific companion serves as a fallback: reusing existing code, selective source/docs reading and concise status reporting. Do not cut required features, tests, error handling or security for token savings.

These skills describe engineering processes; the current repo source is authoritative for implementation state. Read `docs/ARCHITECTURE.md`, `docs/STATE-AND-MIGRATION.md`, `docs/AUDIO-ENGINE.md`, `docs/FEATURE-SPECS.md` before changing audio state architecture.

Before changing behavior: establish baseline and tests. Preserve existing 0–300% operation; changes must not introduce silence, gain jumps, cross-tab leakage or regressions. Tests are required for new features and bug fixes; manual Edge/Chrome checks are required before declaring production release ready.

Coverage targets (proposed): >=85% overall and >=90% on critical state/audio validation modules. Do not claim tests passed unless actually executed. Label design alternatives PROPOSED until implemented and verified.
```
