## 2026-10-26 · Popup and widget evolve the existing dark + lime identity instead of replacing it
- Decided by: the designer (chose "Evolve it")
- Why: the identity is established and the brief asks for subtle motion and no heavy glow; the weaknesses were hierarchy, glyph icons and state clarity, not the palette
- Rejected: new visual world (no gain for a seconds-long utility popup); light/dark adaptive (not requested)
- Rests on: PRODUCT.md, docs/UI-UX-SPEC.md

## 2026-10-26 · Colour roles: lime = applied/active, amber = boost zone, red = failure only
- Decided by: default, pending designer review
- Why: red marked both mute and levels above 100%, so a deliberate state looked like an error; amber separates "louder than YouTube allows" from "something failed"
- Rejected: keeping red for boost (it hid real failures)
- Rests on: popup.test.js, rendered screenshots reviewed 2026-10-26

## 2026-10-26 · Boost mode moved onto the popup's first screen
- Decided by: default, pending designer review
- Why: it caps the slider and is the one setting with a hearing-safety consequence, so it should not sit in a collapsed section
- Rejected: leaving it under Settings
- Rests on: PRODUCT.md (boost is a deliberate, global opt-in)

## 2026-10-26 · Collapsed sections show their current state in the closed row
- Decided by: default, pending designer review
- Why: the designer chose "advanced collapsed"; without a summary the user has to open a section to learn whether the limiter or EQ is on
- Rejected: tabs (Volume / Sound / Settings), which hide the level while editing sound
- Rests on: designer answer, 2026-10-26
