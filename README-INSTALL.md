# RELAXLIKES Volume+ — Claude Code Skills & Engineering Documentation

**Knowledge pack v1.1 · 2026-10-26**  
Based on the public `main` branch of https://github.com/PhyschicWinter9/Volume-Plus reviewed on 2026-10-26 (manifest version 2.2.1).

## What this contains (and does NOT contain)

This is an **additive knowledge pack**, not a patched extension or a claim that new features have already been implemented. It includes seven project-scoped Claude Code skills (six engineering skills plus a Ponytail companion), architecture/feature/testing/security reference documents, a Claude Code implementation prompt, and a documentation validation script.

It does **not** contain copyrighted copies of external documentation, preinstalled Anthropic/Microsoft skills, actual implementation of the six features, passing test results, or a release-ready extension.

## Install into an EXISTING clone

1. Back up the working tree and commit or stash your existing work.
2. Open the root of your `Volume-Plus` clone (the folder containing `manifest.json` and `CLAUDE.md`).
3. Extract the ZIP **into that root**, preserving hidden folders. The ZIP intentionally does **not** replace `CLAUDE.md`, `manifest.json`, `src/`, or `README.md`.
4. Read `docs/CLAUDE-ADDENDUM.md`, then **merge** the relevant instructions into your existing `CLAUDE.md` after checking they still match the source. Do not overwrite the original architecture notes.
5. Review `docs/REFERENCE-INDEX.md` and any decisions marked **PROPOSED**, not accepted.
6. **Optional but recommended:** install the official Ponytail plugin in Claude Code using the two commands in `docs/PONYTAIL-INTEGRATION.md`, start a fresh session and use `/ponytail full`. Installing the plugin requires your action. The pack includes a project-specific fallback/companion, **not** the upstream Ponytail plugin.
7. Open Claude Code from the project root; restart the session if skills are not detected. The project skills live in `.claude/skills/<skill-name>/SKILL.md`.
8. Give Claude the text of `prompts/CLAUDE-MASTER-PROMPT.md` (or use the prompt supplied with the download).
9. Run `python scripts/validate_knowledge_pack.py` to check local Markdown/skills structure. This validator does not test the extension.

## Safest extraction

On Windows PowerShell (run in your repository root):

```powershell
Expand-Archive -Path "C:\path\to\Volume-Plus-Claude-Skills-Docs.zip" -DestinationPath "." -Force
python scripts/validate_knowledge_pack.py
```

On macOS/Linux (run in your repository root):

```sh
unzip Volume-Plus-Claude-Skills-Docs.zip -d .
python3 scripts/validate_knowledge_pack.py
```

**Caution:** `-Force` can replace files in the pack's `.claude/skills` and `docs` paths if you already created files with the same names. Compare changes first in that case (`git status`, `git diff`). No existing root source files are supplied by the ZIP.

## Content overview

- `.claude/skills/browser-extension-engineering/` — MV3 architecture and lifecycle
- `.claude/skills/web-audio-engineering/` — graph, EQ, limiter, audio safety
- `.claude/skills/volume-state-management/` — per-tab state, sync, migration
- `.claude/skills/extension-quality-assurance/` — Vitest, Playwright, DSP tests
- `.claude/skills/extension-security/` — least privilege, bridges, CSP
- `.claude/skills/volume-ui-accessibility/` — compact popup, keyboard UX, WCAG
- `.claude/skills/volume-ponytail-workflow/` — companion for the upstream Ponytail plugin; correctness-first token-aware workflow
- `docs/PONYTAIL-INTEGRATION.md` — official install steps, modes, audit/review workflow and limitations
- `docs/` — engineering reference, acceptance criteria, verification checklists
- `prompts/` — full implementation prompt
- `scripts/` — static pack structure validator

## Compatibility and source-of-truth rules

- Official API documentation is authoritative for APIs; live source is authoritative for the project's present behavior.
- Chrome and Edge compatibility must be tested; Playwright's extension guidance uses bundled Chromium, not a substitute for manual release validation in both installed browsers.
- `chrome.storage.session` is cleared on extension reload/update and browser restart; it does not by itself solve synchronous early initialization at `document_start`.
- Limiting peaks is not a guarantee against hearing injury, clipping, distorted masters, or unknown downstream amplification.
- Any `CLAUDE.md` references in the docs should be read together with the project's original file and updated only after verification.

## Verify scope

Generated content is reference material and a task plan. No extension test or build has been run by this pack creation. An agent should establish a baseline before implementation and report actual results, not assumptions.

## About Ponytail

For Claude Code, **official plugin installation is separate from ZIP extraction**. Use two `/plugin` commands in `docs/PONYTAIL-INTEGRATION.md`, then `/ponytail full`. The built-in companion is only a fallback and project-specific integration. Do not infer that Ponytail is already active because this ZIP was unpacked.
