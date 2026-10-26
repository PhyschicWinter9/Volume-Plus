---
name: web-audio-engineering
description: Design, debug, test, or optimize Volume+ Web Audio API gain boost, AudioContext and MediaElementAudioSourceNode lifecycle, audio limiter, three-band equalizer, bypass, stereo routing, and DSP regression tests. Use whenever audio nodes, output volume, clipping or media element replacement are involved.
---

# Web audio and DSP — Volume+

## Read first

- `docs/AUDIO-ENGINE.md`, `docs/FEATURE-SPECS.md`, `docs/TESTING-STRATEGY.md`.
- Current `src/content.js` boost graph and lifecycle; inspect actual source before modification.
- Web Audio references from `docs/REFERENCE-INDEX.md`.

## Guardrails

- Calling `createMediaElementSource(mediaElement)` reroutes that element through its associated AudioContext. Treat the source association as persistent; never create a second source for the same element.
- Disconnecting a node does not magically return the element to normal audio routing. Preserve an audible passthrough route on bypass.
- Track **which HTMLMediaElement** and **which AudioContext** each node belongs to. A `boostActive` boolean alone is insufficient for replacement handling.
- On failed audio graph setup, do not pretend 150–300% volume was applied. Present actual state and safe fallback.
- Avoid `AudioContext` churn, orphaned graphs, duplicated paths, doubled gain and silent media.
- Distinguish input level, gain multiplier, rendered output peak, perceived loudness and OS output level.
- A `DynamicsCompressorNode` is compression, not automatically a brick-wall, true-peak limiter. No absolute clipping/hearing guarantees.

## Design sequence

1. Verify existing 0–100% native route and 101–300% boost route; define how EQ/limiter work in normal mode without changing volume unexpectedly.
2. Propose processing graph: `media source -> 3 EQ bands [optional] -> boost gain -> dynamics control [optional] -> destination` with an audible unity passthrough when bypassed.
3. Model state per element: `unbound`, `connecting`, `running`, `suspended`, `recovering`, `failed`, `retired`; document transitions and allowed operations.
4. Design replacement behavior for YouTube Shorts, navigation, ads, live streams and SPA swaps. Cross-origin audio source restrictions can cause silence: test and degrade gracefully.
5. Use `AudioParam` automation (`setTargetAtTime`, appropriate ramps) to avoid steps/clicks; verify starting state and avoid changing the target after teardown.
6. Choose sensible filter types and center/crossover frequencies; document each 3-band EQ filter's frequency, Q and gain values. Default flat response at 0 dB.
7. For limiter implementation: state target output threshold, latency budget, transient behavior, pumping risk, stereo behavior and testable measurable peak criteria. If strict peak ceiling cannot be achieved, label the option *dynamic range protection*, not peak-safe limiting.
8. Keep max boost 300%; consider volume jump mitigation, optional limiter on boost, and warning copy.

## DSP test protocol

Test with deterministic synthesized audio (sine 100/1000/10000 Hz, swept tone, full-scale transients, stereo anti-phase/reference signals, silence), preferably `OfflineAudioContext`.

- Assert gain and EQ response at representative frequencies with justified dB tolerances.
- Assert no NaN/Infinity, unexpected channel collapse, audible discontinuity or doubled signal path.
- Assert limiter behavior from rendered buffers; do not test by checking that a node merely exists.
- Test full combinations of boost × EQ × dynamics, including rapid enable/disable and media element change (latter in real browser).
- Measure approximate CPU and latency on representative devices; do not invent results.

## Delivery

Provide graph diagrams, measured versus targeted behavior, test signals/tolerances/results, known audio limitations, and a release listening checklist.
