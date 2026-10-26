# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Plain HTML/CSS/JS, Manifest V3 extension for Chrome and Edge 111+. No framework and no runtime dependencies; extension pages may not load remote code or fonts.

## Users

People who listen to YouTube for long stretches, often in a background tab, and on mixed sources: quiet lectures, loud music, uneven uploads. They open the popup for a few seconds, want one level fixed for this tab, and leave. Some use several YouTube tabs at once and expect each to keep its own level. Some boost above 100% and need to know the sound is loud and whether it actually applied.

## Product Purpose

Per-tab YouTube volume from 0 to 300%, with a peak limiter, a three-band equalizer, editable presets and keyboard shortcuts. Success is a level that stays where the user put it across refresh and navigation, and an interface that never claims a level that is not audible.

## Positioning

Per-tab levels, with honest applied-versus-requested feedback, and a limiter and equalizer that live in the same control rather than a separate audio tool.

## Constraints

- Popup is a fixed-width surface of at most 600px height; it opens, is used for seconds, and closes.
- Permissions are `storage` only; no network requests, no external fonts or scripts.
- Boost above 100% is a deliberate, global opt-in; the interface must make the boost zone unmistakable.

## Accessibility

Keyboard and screen-reader operable, WCAG AA contrast, reduced-motion respected, no information carried by colour alone.

## Brand commitments

Dark ground with a lime accent (`#e8ff47`) is the established identity and is kept. Motion is subtle (about 120–200 ms); no heavy gradients or glow.
