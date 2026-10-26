# Audio engine — gain, limiter, equalizer and lifecycle

## IMPLEMENTED in v2.3.0 - design and measured results

Graph, lifecycle and constants: see `CLAUDE.md` ("Audio chain") and `src/lib/audio-graph.js`. Measured with `npm run test:dsp` (Playwright Chromium 156 headless, `OfflineAudioContext`, 48 kHz, 1-2 channels, Windows). One platform/browser only; Edge/Chrome stable not yet measured.

| Check | Result | Tolerance |
|---|---|---|
| Flat EQ and limiter-on path at unity gain, 100 Hz / 1 kHz / 10 kHz | within 0.1 dB of input (no doubled route, no make-up gain) | 0.1 dB |
| Band plateaus +/-6 dB (bass @40 Hz, mid @1 kHz, treble @15 kHz) | within 1 dB; other probed bands within 1.5 dB | 1 / 1.5 dB |
| 300 % gain + EQ (bass +6, treble +3) on a loud programme with transients | peak 5.15 (limiter off), 0.72 (compressor only), **0.592 (compressor + ceiling)**: about 18.8 dB peak reduction | final peak <= 0.96 |
| 300 % + EQ +12 dB all bands on a 0.9 tone; full-scale square; silence | finite, peak <= 0.96; silence stays < 1e-6 | n/a |
| Stereo (L 440 Hz / R 880 Hz, EQ + limiter on) | crosstalk below -60 dB | -60 dB |
| Limiter on, off, on mid-stream at 250 Hz and 1 kHz | no sample step > 1.6x the steady-state step; RMS dip < 0.5 dB | see spec |
| Gain step 0.2 -> 3.0 with `setTargetAtTime` | max sample step <= steady-state slope of the final tone (click-free) | x1.05 |
| Cost | 10 s stereo with EQ+limiter renders about 80x faster than real time offline; live tab JS heap 3.1 -> 4.1 MB with graph | informational |

### Bugs the measurements found (fixed)
1. Chromium's compressor adds automatic make-up gain: **+4.33 dB on quiet material** with the first parameter set, so "limiter on" was louder than "off" at 100 %. Fixed with a post-compressor trim of 0.6073; guarded by the transparency test.
2. The wet leg's latency is 8.67 ms (6 ms look-ahead + 128-sample 2x-oversampled shaper), so a 6 ms dry delay caused a -5.85 dB RMS dip while toggling. The dry leg now delays by `0.006 + 128/sampleRate`.

### Limits - what this is NOT
- Not a true-peak / brick-wall limiter. The compressor reduces dynamics; the final soft-clip table bounds samples to about 0.952 (-0.43 dBFS) by construction and adds distortion on overshoots. Inter-sample peaks after the DAC are not measured.
- Cannot repair distorted sources, speaker/DAC clipping or protect hearing; the UI does not claim it can.
- The make-up and latency constants are Chromium-specific measurements.
- Audio from the real output device was **not** captured. Live checks only confirm graph state (gain, EQ, compressor reduction of -11 dB on a 0.5 tone at 300 %). A listening checklist is in `docs/RELEASE-CHECKLIST.md`.
- Not verified at 44.1 kHz, nor on a real suspended-then-resumed context (fake-context logic tests only; headless Chromium did not block autoplay in E12).

---

*Original design notes follow (kept for rationale; where they say "proposed", the section above states what was implemented).*


## Observed current behavior

At or below 100%, Volume+ controls YouTube's native media volume. Above 100%, it establishes a Web Audio gain path using `createMediaElementSource(video)` and applies `pct/100` gain. Current `content.js` tracks `audioCtx`, `gainNode`, `sourceNode` and a single `boostActive` flag; a video element replacement needs stronger graph ownership.

## Proposed graph

```text
HTMLMediaElement -> MediaElementAudioSourceNode
        -> [Bass shelf] -> [Mid peaking] -> [Treble shelf]
        -> GainNode (boost/unity)
        -> [Optional dynamics stage]
        -> destination
```

When EQ/dynamics are enabled below 100%, native volume and graph gain must be calibrated so **100% means no unrequested loudness increase**. Every bypass must remain connected to exactly one audible destination route. Confirm actual browser semantics after graph creation before assuming the native path returns on disconnect.

## Lifecycle

Track one source association per actual media element. Prefer a dedicated audio graph controller with a WeakMap for lookup, plus explicit managed live references for cleanup; do not assume garbage collection of `AudioContext` or source nodes while connected.

States: `unbound -> initializing -> running/suspended -> recovering/failed -> retired`. Distinguish source creation failure, context suspension, media replacement and CORS-tainted audio. On error: restore safe state where technically possible, report failure, never show 300% applied if no audio is audible.

## EQ

- Bass: low shelf, Mid: peaking, Treble: high shelf; proposed ±12 dB per band, defaults 0 dB.
- Select specific filter frequencies/Q only after listening and measured response; include reset to Flat.
- EQ gains can increase peaks even when user selects volume ≤100%, so dynamics design applies to EQ too.
- Parameter automation avoids clicks. Do not create a new AudioContext on every slider change.

## Dynamics / clipping protection

`DynamicsCompressorNode` reduces dynamic range; it is not automatically a guaranteed brick-wall/true-peak limiter. Test threshold/ratio/attack/release and listen for pumping. If a hard output ceiling is a product promise, evaluate a real peak limiter implementation, latency budget and overshoot at sample and inter-sample peaks; name the UI control accurately.

Warn users that software dynamics cannot prevent already-distorted source material, all downstream gain, hearing damage or hardware clipping. Use conservative default gain transitions.

## Measuring output with OfflineAudioContext

For pure DSP units (not live YouTube media elements), render repeatable test signals into OfflineAudioContext and calculate peak absolute sample, RMS and frequency-band gain. Test 100 Hz, 1 kHz, 10 kHz, swept tones, a transient train, silence and two-channel signals. Record expected values/tolerances next to the test; report browser platform, render sample rate and channel count.

## Risk scenarios

- Media element replacement mid boost; Shorts/ads/live video.
- Multi-tab simultaneous audio and contexts.
- Browser autoplay policy, suspended/resumed contexts.
- Source element already associated with another context.
- Audible silence after failure or routing disconnect.
- EQ boost + volume boost overload; limiter toggle burst.
- Different browser audio implementations.
