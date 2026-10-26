# Volume+ UI/UX and accessibility spec (proposed)

## Interaction priorities

First viewport of the popup: recognizable identity, current tab indicator, one large accurate volume number, mute, precise volume slider, quick presets. Move EQ/limiter/shortcut configurations into progressive-disclosure controls rather than dashboard-style widgets.

```text
┌──────────────────────────────────┐
│ Volume+                Connected │
│ YouTube · This tab               │
│               150%               │
│ [───────●──────────────]          │
│ [25] [50] [100] [150] [200]      │
│ [Mute]               [Settings]  │
├──────────────────────────────────┤
│ Boost                  Enabled   │
│ Clipping protection    Enabled   │
│ EQ                      [Open]   │
└──────────────────────────────────┘
```

No always-on decorative animation. Target 120–200ms lightweight state transitions; slider responds immediately, audio parameters never wait for animation. Observe `prefers-reduced-motion`.

## State feedback

- `Connected`: target tab and media player ready.
- `Applying`: local desired value shown, actual applied outcome pending.
- `Applied`: confirmed latest valid revision only.
- `Unavailable`: wrong website or no player; explain resolution.
- `Error`: meaningful one-line message and retry path.

## Settings organization

- Volume: per-tab default behavior, step size.
- Presets: list with add/edit/delete/reorder/reset (validation 0–300%).
- Audio: limiter description, EQ panel with Bass/Mid/Treble in dB, reset Flat.
- Shortcuts: display browser-defined mappings and link instructions to the browser shortcut UI.

## Accessibility

Native slider inputs where practical. Label each control, visible keyboard focus, buttons not fake `div`s, effective focus order, screen-reader messages for errors, avoid per-frame ARIA announcements, high contrast on dark palette and enlarged hit targets.

## Browser/YouTube integration

In-player widget should remain discreet and not break YouTube controls on small windows, theatre mode, fullscreen or Shorts. If YouTube's layout changes, degrade to default controls rather than covering playback or causing unusable audio.
