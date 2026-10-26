# Volume+ engineering handbook

Pack snapshot: 2026-10-26. Repo read: public `main`, Manifest V3, version 2.2.1. This handbook is a **design/testing blueprint**, not evidence the proposed features are implemented.

## Reading order

1. [Architecture](ARCHITECTURE.md) — current worlds, lifecycle, high-risk boundaries.
2. [Feature specs](FEATURE-SPECS.md) — acceptance contracts for all six features.
3. [State and migration](STATE-AND-MIGRATION.md) — tab isolation, early boot and `rl_volume` migration.
4. [Audio engine](AUDIO-ENGINE.md) — gain, EQ, limiter graphs and safety.
5. [Testing strategy](TESTING-STRATEGY.md) and [test matrix](TEST-MATRIX.md).
6. [UI/UX spec](UI-UX-SPEC.md), [security/privacy](SECURITY-AND-PRIVACY.md).
7. [Release checklist](RELEASE-CHECKLIST.md) and [references](REFERENCE-INDEX.md).

## Status legend

- **OBSERVED**: confirmed in inspected public source; re-check on new commits.
- **PROPOSED**: design direction; not implemented by this pack.
- **REQUIRED TO TEST**: release condition; not already passed.

## Scope

The 6 requested additions: per-tab volume, reliable sync, dynamics protection, editable presets, keyboard shortcuts and 3-band EQ. User-facing UI is secondary to correctness of volume, tab targeting and audio routing.
