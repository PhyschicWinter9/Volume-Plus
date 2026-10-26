// Real DSP verification: renders the production signal chain (src/lib/audio-graph.js createChain)
// in Chromium's OfflineAudioContext and measures the output samples. No mocks.
//
// Tolerances (documented, see docs/AUDIO-ENGINE.md):
//   flat response / no double routing .. within ±0.1 dB
//   shelf/peak gain at the plateau ..... within ±1.0 dB of the requested dB (biquad, not brick-wall)
//   limiter ceiling .................... |sample| <= 0.96 (soft-clip table ends at 0.952)
//   click-free ramps ................... max sample-to-sample step <= 1.6x the steady-state tone step
import { test, expect, chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SR = 48000;
let browser, page;

test.beforeAll(async () => {
  browser = await chromium.launch();
  page = await browser.newPage();
  await page.goto('about:blank');
  for (const f of ['src/lib/state.js', 'src/lib/audio-graph.js']) {
    await page.addScriptTag({ content: readFileSync(resolve(process.cwd(), f), 'utf8') });
  }
  await page.evaluate(() => {
    const SR = 48000;
    // ---- helpers live in the page ----
    window.tone = (f, a, n, ph = 0) => Float32Array.from({ length: n }, (_, i) => a * Math.sin(2 * Math.PI * f * i / SR + ph));
    window.amp = (x, f, from = 0) => { // single-frequency amplitude via Goertzel-style projection
      let re = 0, im = 0, n = 0;
      for (let i = from; i < x.length; i++, n++) { re += x[i] * Math.cos(2 * Math.PI * f * i / SR); im += x[i] * Math.sin(2 * Math.PI * f * i / SR); }
      return 2 * Math.hypot(re, im) / n;
    };
    window.peak = (x, from = 0) => { let p = 0; for (let i = from; i < x.length; i++) p = Math.max(p, Math.abs(x[i])); return p; };
    window.db = (r) => 20 * Math.log10(r);
    /**
     * Render `inputs` (array of Float32Array, one per channel) through createChain.
     * cfg: {gain, limiter, eq:{enabled,bass,mid,treble}, noClip, seconds, events:[{at, fn(chain)}]}
     */
    window.render = async (inputs, cfg = {}) => {
      const n = inputs[0].length;
      const ctx = new OfflineAudioContext(inputs.length, n, SR);
      const buf = ctx.createBuffer(inputs.length, n, SR);
      inputs.forEach((d, c) => buf.copyToChannel(d, c));
      const src = ctx.createBufferSource(); src.buffer = buf;
      const chain = RL.audio.createChain(ctx, ctx.destination);
      chain.setGain(cfg.gain ?? 1);
      chain.setLimiter(cfg.limiter ?? true);
      chain.setEq(cfg.eq ?? { enabled: false, bass: 0, mid: 0, treble: 0 });
      if (cfg.noClip) chain.nodes.clip.curve = null;
      src.connect(chain.input); src.start();
      for (const ev of cfg.events || []) ctx.suspend(ev.at).then(() => { ev.fn(chain); ctx.resume(); });
      const t0 = performance.now();
      const out = await ctx.startRendering();
      const ms = performance.now() - t0;
      return { ch: Array.from({ length: out.numberOfChannels }, (_, c) => out.getChannelData(c)), ms, rate: out.sampleRate };
    };
  });
});
test.afterAll(async () => { await browser.close(); });

const N = SR * 1; // 1 s renders

test('environment record', async () => {
  const info = await page.evaluate(() => ({ ua: navigator.userAgent, rate: new OfflineAudioContext(2, 128, 48000).sampleRate }));
  console.log('DSP env:', info.ua, '| render rate', info.rate, 'Hz | channels 1-2');
  expect(info.rate).toBe(SR);
});

test('V17/V16 flat EQ + limiter + unity gain is transparent (±0.1 dB) - no doubled route', async () => {
  for (const f of [100, 1000, 10000]) {
    const r = await page.evaluate(async ({ f, N }) => {
      const x = tone(f, 0.2, N);
      const flat = await render([x], { gain: 1, limiter: true });
      const dry = await render([x], { gain: 1, limiter: false, eq: { enabled: true, bass: 0, mid: 0, treble: 0 } });
      const from = 24000;
      return { inA: amp(x, f, from), limA: amp(flat.ch[0], f, from), dryA: amp(dry.ch[0], f, from) };
    }, { f, N });
    expect(Math.abs(20 * Math.log10(r.limA / r.inA)), `limiter-path @${f}`).toBeLessThan(0.1);
    expect(Math.abs(20 * Math.log10(r.dryA / r.inA)), `dry-path @${f}`).toBeLessThan(0.1);
  }
});

test('V18 band response: ±6 dB at plateau within ±1 dB, other bands near flat', async () => {
  const cases = [
    { band: 'bass',   probe: 40,    others: [1000, 12000] },
    { band: 'mid',    probe: 1000,  others: [60, 15000] },
    { band: 'treble', probe: 15000, others: [60, 1000] }
  ];
  for (const sign of [6, -6]) {
    for (const c of cases) {
      const r = await page.evaluate(async ({ c, sign, N }) => {
        const eq = { enabled: true, bass: 0, mid: 0, treble: 0, [c.band]: sign };
        const gainAt = async (f) => {
          const x = tone(f, 0.1, N);
          const o = await render([x], { gain: 1, limiter: false, eq });
          return db(amp(o.ch[0], f, 24000) / amp(x, f, 24000));
        };
        return { main: await gainAt(c.probe), others: await Promise.all(c.others.map(gainAt)) };
      }, { c, sign, N });
      expect(Math.abs(r.main - sign), `${c.band} ${sign} dB @ ${c.probe}Hz measured ${r.main.toFixed(2)}`).toBeLessThan(1.0);
      for (const o of r.others) expect(Math.abs(o), `${c.band} leak ${o.toFixed(2)} dB`).toBeLessThan(1.5);
    }
  }
});

test('EQ extremes ±12 dB stay finite and bounded by the limiter', async () => {
  const r = await page.evaluate(async (N) => {
    const x = tone(80, 0.9, N);
    const o = await render([x], { gain: 3, limiter: true, eq: { enabled: true, bass: 12, mid: 12, treble: 12 } });
    return { peak: peak(o.ch[0]), finite: o.ch[0].every(Number.isFinite) };
  }, N);
  expect(r.finite).toBe(true);
  expect(r.peak).toBeLessThanOrEqual(0.96);
});

test('V19/V21 limiter: measured peak reduction at 300% + EQ, hard-bounded by the ceiling stage', async () => {
  const r = await page.evaluate(async (N) => {
    // loud programme-like signal + a transient train
    const x = new Float32Array(N);
    const a = tone(110, 0.45, N), b = tone(1700, 0.3, N), c = tone(5200, 0.15, N);
    for (let i = 0; i < N; i++) x[i] = a[i] + b[i] + c[i];
    for (let i = 0; i < N; i += 6000) for (let k = 0; k < 40; k++) x[i + k] = 0.95 * (k % 2 ? 1 : -1);
    const eq = { enabled: true, bass: 6, mid: 0, treble: 3 };
    const off = await render([x], { gain: 3, limiter: false, eq });
    const on = await render([x], { gain: 3, limiter: true, eq });
    const compOnly = await render([x], { gain: 3, limiter: true, eq, noClip: true });
    return { offPeak: peak(off.ch[0]), onPeak: peak(on.ch[0]), compOnlyPeak: peak(compOnly.ch[0]), finite: on.ch[0].every(Number.isFinite) };
  }, N);
  console.log(`limiter @300%+EQ: off ${r.offPeak.toFixed(2)} | compressor only ${r.compOnlyPeak.toFixed(2)} | compressor+ceiling ${r.onPeak.toFixed(3)}`);
  expect(r.finite).toBe(true);
  expect(r.offPeak).toBeGreaterThan(2);               // without it the digital peak is way over full scale
  expect(r.compOnlyPeak).toBeLessThan(r.offPeak / 3); // the compressor does most of the work on this programme
  expect(r.onPeak).toBeLessThanOrEqual(0.96);         // with it, hard-bounded
  expect(20 * Math.log10(r.offPeak / r.onPeak)).toBeGreaterThan(6); // measured reduction (dB)
});

test('limiter leaves quiet material untouched (identity below the knee)', async () => {
  const r = await page.evaluate(async (N) => {
    const x = tone(440, 0.3, N);
    const o = await render([x], { gain: 1, limiter: true });
    return db(amp(o.ch[0], 440, 24000) / amp(x, 440, 24000));
  }, N);
  expect(Math.abs(r)).toBeLessThan(0.1);
});

test('limiter toggle mid-stream is click-free (coherent cross-fade)', async () => {
  for (const f of [250, 1000]) {
    const r = await page.evaluate(async ({ f, N }) => {
      const x = tone(f, 0.1, N); // below the compressor knee, so on/off differ only by the cross-fade itself
      const o = await render([x], { gain: 1, limiter: true, events: [
        { at: 0.4, fn: (c) => c.setLimiter(false) }, { at: 0.7, fn: (c) => c.setLimiter(true) }] });
      const y = o.ch[0];
      let maxStep = 0, base = 0;
      for (let i = 1; i < y.length; i++) maxStep = Math.max(maxStep, Math.abs(y[i] - y[i - 1]));
      for (let i = 1; i < 4000; i++) base = Math.max(base, Math.abs(y[i + 40000] - y[i + 39999]));
      // windowed RMS dip around the toggles
      let minRms = 1, maxRms = 0;
      for (let s = 12000; s < N - 4800; s += 480) {
        let e = 0; for (let i = 0; i < 480; i++) e += y[s + i] ** 2;
        const rms = Math.sqrt(e / 480); minRms = Math.min(minRms, rms); maxRms = Math.max(maxRms, rms);
      }
      console.log(`toggle @${f}: step ${maxStep.toFixed(4)} vs steady ${base.toFixed(4)}, rms dip ${db(minRms / maxRms).toFixed(2)} dB`);
      return { maxStep, base, dipDb: db(minRms / maxRms) };
    }, { f, N });
    expect(r.maxStep, `step @${f}`).toBeLessThanOrEqual(r.base * 1.6);
    expect(r.dipDb, `rms dip @${f}`).toBeGreaterThan(-0.5);
  }
});

test('gain changes are smoothed (no click on a 0.2 -> 3.0 step)', async () => {
  const r = await page.evaluate(async (N) => {
    const x = tone(1000, 0.2, N);
    const o = await render([x], { gain: 1, limiter: false, events: [{ at: 0.3, fn: (c) => c.setGain(3) }] });
    const y = o.ch[0];
    let maxStep = 0; for (let i = 1; i < y.length; i++) maxStep = Math.max(maxStep, Math.abs(y[i] - y[i - 1]));
    return { maxStep, expectedMax: 2 * Math.PI * 1000 / 48000 * 0.2 * 3, finalAmp: amp(y, 1000, 40000), };
  }, N);
  expect(r.maxStep).toBeLessThanOrEqual(r.expectedMax * 1.05); // never exceeds the steady-state slope of the final tone
  expect(r.finalAmp).toBeGreaterThan(0.55);                    // reaches 0.2 * 3
});

test('V20 stereo integrity, silence and full-scale input', async () => {
  const r = await page.evaluate(async (N) => {
    const L = tone(440, 0.3, N), R = tone(880, 0.3, N);
    const st = await render([L, R], { gain: 1.5, limiter: true, eq: { enabled: true, bass: 3, mid: 0, treble: 3 } });
    const sil = await render([new Float32Array(N), new Float32Array(N)], { gain: 3, limiter: true, eq: { enabled: true, bass: 12, mid: 12, treble: 12 } });
    const full = Float32Array.from({ length: N }, (_, i) => (Math.floor(i / 50) % 2 ? 1 : -1));
    const fs = await render([full], { gain: 3, limiter: true });
    return {
      l440: amp(st.ch[0], 440, 24000), l880: amp(st.ch[0], 880, 24000),
      r440: amp(st.ch[1], 440, 24000), r880: amp(st.ch[1], 880, 24000),
      silenceMax: Math.max(peak(sil.ch[0]), peak(sil.ch[1])), silenceFinite: sil.ch.every((c) => c.every(Number.isFinite)),
      fullPeak: peak(fs.ch[0]), fullFinite: fs.ch[0].every(Number.isFinite)
    };
  }, N);
  expect(r.l880 / r.l440).toBeLessThan(0.001);   // < -60 dB crosstalk
  expect(r.r440 / r.r880).toBeLessThan(0.001);
  expect(r.l440).toBeGreaterThan(0.3); // 0.45 in, mildly compressed (threshold -10 dBFS)
  expect(r.silenceMax).toBeLessThan(1e-6);
  expect(r.silenceFinite && r.fullFinite).toBe(true);
  expect(r.fullPeak).toBeLessThanOrEqual(0.96);
});

test('V30 cost: full chain renders far faster than real time (informational budget)', async () => {
  const r = await page.evaluate(async () => {
    const n = 48000 * 10;
    const x = tone(440, 0.5, n);
    const o = await render([x, x], { gain: 2, limiter: true, eq: { enabled: true, bass: 6, mid: 2, treble: 3 } });
    return { ms: o.ms, audioMs: 10000 };
  });
  console.log(`DSP cost: 10 s stereo rendered in ${r.ms.toFixed(0)} ms (${(r.audioMs / r.ms).toFixed(0)}x real time, offline, single thread)`);
  expect(r.audioMs / r.ms).toBeGreaterThan(10);
});
