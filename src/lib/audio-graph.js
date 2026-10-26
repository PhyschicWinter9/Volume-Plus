// RELAXLIKES Volume+ — lib/audio-graph.js
// Web Audio signal chain + per-document graph lifecycle manager. -> globalThis.RL.audio
//
//   source(s) -> input -> bass(lowshelf) -> mid(peaking) -> treble(highshelf) -> gain
//        gain -> dry ----------------------------------------------\
//        gain -> compressor -> soft-clip ceiling -> wet -----------+-> out -> destination
//
// dry/wet are cross-faded (never both at 1), so exactly one audible route is active at steady state.
// EQ "bypass" = all three bands at 0 dB (the nodes stay wired; no re-routing, no clicks).
// createChain() only needs a BaseAudioContext, so the same code is rendered offline in the DSP tests.

(function (g) {
  'use strict';

  const EQ_FREQ = { bass: 120, mid: 1000, treble: 6000 }; // Hz
  const MID_Q   = 0.9;
  const SMOOTH  = 0.02;   // setTargetAtTime time constant, seconds
  // Chromium's DynamicsCompressorNode applies automatic make-up gain. At the settings below the DSP
  // test measured +4.33 dB on quiet material, which would make "limiter on" louder than "off".
  // Trimmed right after the compressor so below-threshold audio is unity. tests/dsp guards this.
  const COMP_MAKEUP_TRIM = 0.6073;
  const COMP_LOOKAHEAD = 0.006; // s, DynamicsCompressorNode pre-delay in Chromium
  const SHAPER_LATENCY = 128;   // samples, 2x-oversampled WaveShaper (measured with an impulse, tests/dsp)
  const CEILING_KNEE = 0.8; // soft-clip is identity below this sample level

  // Identity below the knee, tanh-rounded above it. The WaveShaper table only spans |x| <= 1, so
  // anything beyond full scale clamps to softClip(1) ~= 0.952 (about -0.43 dBFS).
  function softClip(x) {
    const a = Math.abs(x);
    if (a <= CEILING_KNEE) return x;
    const y = CEILING_KNEE + (1 - CEILING_KNEE) * Math.tanh((a - CEILING_KNEE) / (1 - CEILING_KNEE));
    return x < 0 ? -y : y;
  }
  function makeCurve(n = 4097) {
    const c = new Float32Array(n);
    for (let i = 0; i < n; i++) c[i] = softClip((i / (n - 1)) * 2 - 1);
    return c;
  }

  function ramp(param, value, ctx) {
    // Smooth when live; plain set before the first render (offline tests / initial build).
    if (ctx.currentTime > 0) param.setTargetAtTime(value, ctx.currentTime, SMOOTH);
    else param.value = value;
  }

  function createChain(ctx, destination) {
    const mk = (type, freq, q) => {
      const f = ctx.createBiquadFilter();
      f.type = type; f.frequency.value = freq; f.gain.value = 0;
      if (q) f.Q.value = q;
      return f;
    };
    const input  = ctx.createGain();
    const bass   = mk('lowshelf',  EQ_FREQ.bass);
    const mid    = mk('peaking',   EQ_FREQ.mid, MID_Q);
    const treble = mk('highshelf', EQ_FREQ.treble);
    const gain   = ctx.createGain();
    const dry    = ctx.createGain();
    const align  = ctx.createDelay(0.05);
    const comp   = ctx.createDynamicsCompressor();
    const trim   = ctx.createGain();
    const clip   = ctx.createWaveShaper();
    const wet    = ctx.createGain();
    const out    = ctx.createGain();

    comp.threshold.value = -10; comp.knee.value = 6; comp.ratio.value = 12;
    comp.attack.value = 0.003;  comp.release.value = 0.15;
    trim.gain.value = COMP_MAKEUP_TRIM;
    clip.curve = makeCurve(); clip.oversample = '2x';

    align.delayTime.value = COMP_LOOKAHEAD + SHAPER_LATENCY / ctx.sampleRate;
    input.connect(bass); bass.connect(mid); mid.connect(treble); treble.connect(gain);
    gain.connect(align); align.connect(dry); dry.connect(out);
    gain.connect(comp);  comp.connect(trim); trim.connect(clip); clip.connect(wet); wet.connect(out);
    out.connect(destination || ctx.destination);

    const bands = { bass, mid, treble };
    let limiterOn = true;
    dry.gain.value = 0; wet.gain.value = 1;

    return {
      input, output: out, compressor: comp, nodes: { bass, mid, treble, gain, dry, wet, comp, trim, clip },
      setGain(v)    { ramp(gain.gain, v, ctx); },
      setLimiter(on) {
        limiterOn = !!on;
        ramp(dry.gain, limiterOn ? 0 : 1, ctx);
        ramp(wet.gain, limiterOn ? 1 : 0, ctx);
      },
      isLimiterOn() { return limiterOn; },
      setEq(eq) {
        for (const b of ['bass', 'mid', 'treble']) ramp(bands[b].gain, eq && eq.enabled ? eq[b] : 0, ctx);
      },
      dispose() { try { out.disconnect(); input.disconnect(); } catch (_) {} }
    };
  }

  // ---- lifecycle manager (live pages only) ----
  function createManager({ AudioContextCtor, resumeTimeoutMs = 400 } = {}) {
    const Ctor = AudioContextCtor || g.AudioContext || g.webkitAudioContext;
    let ctx = null, chain = null;
    const sources = new WeakMap();
    const live = new Set(); // strong refs so we can disconnect on teardown
    let status = 'none', reason = null;

    function prune() {
      for (const e of [...live]) {
        if (!e.video.isConnected) {
          try { e.src.disconnect(); } catch (_) {}
          live.delete(e);
        }
      }
    }

    async function tryResume() {
      if (!ctx || ctx.state === 'running') return;
      try {
        await Promise.race([ctx.resume(), new Promise((r) => setTimeout(r, resumeTimeoutMs))]);
      } catch (_) {}
    }

    // Ensure the graph exists and `video` is routed through it exactly once.
    // Never routes a media element into a context that is not running (that would silence it).
    async function ensure(video) {
      if (!Ctor) { status = 'failed'; reason = 'no-webaudio'; return { ok: false, reason }; }
      if (!ctx) {
        try { ctx = new Ctor({ latencyHint: 'playback' }); }
        catch (_) { status = 'failed'; reason = 'ctx-create'; return { ok: false, reason }; }
        ctx.onstatechange = () => {
          if (ctx && ctx.state !== 'running' && live.size) { status = 'suspended'; reason = 'ctx-' + ctx.state; tryResume(); }
          else if (ctx && ctx.state === 'running' && live.size) { status = 'running'; reason = null; }
        };
      }
      await tryResume();
      if (ctx.state !== 'running') {
        if (!live.size) { try { ctx.close(); } catch (_) {} ctx = null; chain = null; }
        status = 'suspended'; reason = 'needs-gesture';
        return { ok: false, reason };
      }
      if (!chain) chain = createChain(ctx, ctx.destination);
      if (video && !sources.has(video)) {
        let src;
        try { src = ctx.createMediaElementSource(video); }
        catch (_) { status = 'failed'; reason = 'source-failed'; return { ok: false, reason }; }
        src.connect(chain.input);
        sources.set(video, src);
        live.add({ video, src });
      }
      prune();
      status = 'running'; reason = null;
      return { ok: true };
    }

    function apply(s, V) {
      if (!chain) return;
      chain.setGain(V.gainFor(s));
      chain.setEq(s.eq);
      chain.setLimiter(s.limiter);
    }

    return {
      ensure, apply, prune, recover: tryResume,
      hasGraph: () => !!chain,
      isRouted: (video) => sources.has(video),
      diag() {
        return {
          status, reason,
          ctxState: ctx ? ctx.state : null,
          sources: live.size,
          gain: chain ? chain.nodes.gain.gain.value : null,
          limiter: chain ? chain.isLimiterOn() : null,
          reductionDb: chain ? chain.compressor.reduction : null,
          eq: chain ? ['bass', 'mid', 'treble'].map((b) => chain.nodes[b].gain.value) : null
        };
      }
    };
  }

  g.RL = g.RL || {};
  g.RL.audio = { EQ_FREQ, MID_Q, CEILING_KNEE, softClip, makeCurve, createChain, createManager };
})(globalThis);
