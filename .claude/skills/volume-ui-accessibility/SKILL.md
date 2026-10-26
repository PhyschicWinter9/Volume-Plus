---
name: volume-ui-accessibility
description: Improve Volume+ compact Chrome/Edge popup and in-player widget design, keyboard/pointer accessibility, WCAG semantics, motion, settings layout, feedback, presets, EQ controls and per-tab context. Invoke for popup, HTML, CSS, widgets, interaction or accessibility changes.
---

# UI and accessibility — Volume+

Read `docs/UI-UX-SPEC.md`, current `src/popup.html`, `src/popup.js` and in-player widget CSS/JS.

## Product principles

- Fast primary task: the first screen centers current tab, applied/desired volume, mute and a precise slider.
- Preserve dark + restrained lime branding; avoid decorative dashboards, neon glow and gratuitous motion.
- Present Boost, Limiter and EQ as secondary controls with clear states; never silently change audio processing.
- Clearly distinguish `Connected`, `Applying`, `Unavailable` and `Failed` states; avoid showing stale numbers as success.
- Keep per-tab context visible and obvious. If active tab changes, do not accidentally apply to old tab.
- Preset editing should be compact, reversible and validated (0–300%).

## Accessibility requirements

- Prefer native `input[type=range]` for sliders with visible labels and accessible names; if custom, supply full slider semantics and keyboard actions.
- Keyboard-operable presets, toggles, edit dialog and settings link; visible focus rings.
- Contrast and touch/pointer targets appropriate for cramped browser popups.
- Screen reader announcements for failed actions, not high-frequency slider spam.
- Respect `prefers-reduced-motion`; default transitions 120–200ms, but never delay audio application for animation.
- Provide immediate numeric feedback even if storage acknowledgement arrives later; differentiate optimistic and confirmed state.

## Definition of done

User can set exact volume, mute/unmute, choose/create presets, enable dynamics, tune Bass/Mid/Treble and access shortcut settings using pointer and keyboard without losing context; run keyboard and screen-reader manual checks.
