# Feature acceptance specifications (six mandatory additions)

Status v2.3.0 (all six implemented; verification in `docs/TEST-MATRIX.md`):
1. Per-tab volume - implemented, automated PASS (fixture). 2. Reliable sync - implemented, PASS. 3. Limiter - implemented as compressor + soft-clip ceiling, measured (`AUDIO-ENGINE.md`), not a true-peak limiter. 4. Shortcuts - implemented; real Edge/Chrome conflict check NOT RUN. 5. Presets - implemented, PASS. 6. Mini EQ - implemented, PASS in DSP; listening NOT RUN.

The bullets below remain the acceptance criteria.

## 1. Per-tab Volume Control — P0

- Tab A at 50%, Tab B at 200% concurrently; adjusting either does not change the other.
- Popup controls *currently selected tab*; reject stale tab target after a switch.
- Independent mute/last volume and explicit default-inheritance policy.
- Refresh/SPA navigation obey documented persistence; safe audio startup.
- On close, stale state is deleted; after restart/update fallback is defined and tested.

## 2. Reliable Volume Sync — P0

- Source of truth by tab/document, explicit desired vs applied state.
- User interaction through popup, in-player widget, shortcut, presets and native YouTube controls (where supported) converges consistently.
- Out-of-order async acknowledgements cannot revert latest state.
- UI shows pending/failure rather than falsely reporting audible volume.

## 3. Limiter / dynamics protection — P0

- Toggleable dynamics stage, conservative defaults under boost, no silence after bypass.
- Compare output peak with dynamics on/off under controlled signal.
- No unverified '100% distortion prevention' or 'safe for hearing' claims.
- Test EQ+boost+dynamics together and rapid toggling.

## 4. Keyboard shortcuts — P1

- Volume up/down (configurable step), mute/unmute, reset to 100%, optional preset actions.
- In-page handler must not fire inside editable fields; avoid overriding YouTube shortcuts unnecessarily.
- Browser-wide commands declared via MV3 `commands` with supported combinations. Browser shortcut customization is through `chrome://extensions/shortcuts` / Edge equivalent; app cannot arbitrarily rebind all global keys.
- Reveal and explain conflict/reserved shortcuts. Default combos must be tested.

## 5. Editable presets — P1

- Create, rename, edit, delete, reorder, activate, restore defaults.
- Suggested initial defaults: 25/50/100/150/200; retain users' migrated choices if implemented.
- Validate 0–300% finite values; duplicate names, invalid characters, missing objects, malformed stored JSON.
- Activating a preset affects target tab only; preset definitions are global settings.

## 6. Mini EQ — P1

- Bass/Mid/Treble sliders in dB with 0 dB flat baseline; toggle, reset and at least Flat/Bass Boost/Vocal/Treble Boost/Custom profiles.
- EQ active state/scope is explicit (per-tab current choice vs global profile definitions).
- Changing filters is click-free and does not add duplicate audio paths.
- CPU remains reasonable; frequency response and stereo behavior tested.

## Cross-feature acceptance

- All six features work together, including both browser UI and in-player UI.
- Existing 0–300%, YouTube SPA behavior and mute controls do not regress.
- No unexpected loudness spike, persistent silence, tab leakage or erroneous success state.
- P0/P1 issues are release blockers. Coverage and real-browser tests from `TESTING-STRATEGY.md` and `RELEASE-CHECKLIST.md` are mandatory.
