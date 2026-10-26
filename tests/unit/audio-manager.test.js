// Lifecycle tests for the audio graph manager using a FAKE AudioContext.
// These prove routing/lifecycle LOGIC only (one source per element, never route into a
// non-running context, recovery). Sound itself is verified by tests/dsp with real rendering.
import { describe, it, expect, beforeEach } from 'vitest';
import { RL } from './helpers.js';
const A = RL.audio, S = RL.state;

const param = (v = 0) => ({ value: v, setTargetAtTime(x) { this.value = x; } });
const node = (extra = {}) => ({ connect() {}, disconnect() {}, ...extra });

let created, sourceCalls, behaviour;
class FakeCtx {
  constructor() {
    created.push(this);
    this.state = behaviour.initial;
    this.currentTime = 1;
    this.destination = node();
    this.closed = false;
  }
  resume() { if (behaviour.canResume) this.state = 'running'; return Promise.resolve(); }
  close() { this.closed = true; this.state = 'closed'; }
  createGain() { return node({ gain: param(1) }); }
  createBiquadFilter() { return node({ gain: param(), frequency: param(), Q: param() }); }
  createDynamicsCompressor() { return node({ threshold: param(), knee: param(), ratio: param(), attack: param(), release: param(), reduction: -3 }); }
  createWaveShaper() { return node({}); }
  createDelay() { return node({ delayTime: param() }); }
  createMediaElementSource(el) {
    sourceCalls.push(el);
    if (behaviour.sourceThrows) throw new Error('InvalidStateError');
    return node();
  }
}

const video = () => ({ isConnected: true });
const mk = (opts) => A.createManager({ AudioContextCtor: FakeCtx, resumeTimeoutMs: 5, ...opts });

beforeEach(() => {
  created = []; sourceCalls = [];
  behaviour = { initial: 'running', canResume: true, sourceThrows: false };
});

describe('createManager lifecycle', () => {
  it('routes a video exactly once, however many times ensure() is called (V16)', async () => {
    const m = mk(), v = video();
    expect((await m.ensure(v)).ok).toBe(true);
    await m.ensure(v); await m.ensure(v);
    expect(sourceCalls).toHaveLength(1);
    expect(created).toHaveLength(1);
    expect(m.diag().sources).toBe(1);
    expect(m.isRouted(v)).toBe(true);
  });

  it('never routes into a suspended context that cannot resume (would silence the video)', async () => {
    behaviour = { initial: 'suspended', canResume: false };
    const m = mk(), v = video();
    const r = await m.ensure(v);
    expect(r).toEqual({ ok: false, reason: 'needs-gesture' });
    expect(sourceCalls).toHaveLength(0);
    expect(created[0].closed).toBe(true);
    expect(m.hasGraph()).toBe(false);
    expect(m.diag().status).toBe('suspended');
  });

  it('recovers once the context can resume (V22)', async () => {
    behaviour = { initial: 'suspended', canResume: false };
    const m = mk(), v = video();
    await m.ensure(v);
    behaviour.canResume = true;
    expect((await m.ensure(v)).ok).toBe(true);
    expect(sourceCalls).toHaveLength(1);
    expect(created).toHaveLength(2); // the blocked one was discarded, not leaked
  });

  it('reports suspension after routing and tries to resume', async () => {
    const m = mk(), v = video();
    await m.ensure(v);
    const ctx = created[0];
    ctx.state = 'suspended'; ctx.onstatechange();
    expect(m.diag().status).toBe('suspended');
    expect(m.diag().reason).toBe('ctx-suspended');
    await new Promise((r) => setTimeout(r, 10));
    expect(ctx.state).toBe('running'); // resume() succeeded in the fake
    ctx.onstatechange();
    expect(m.diag().status).toBe('running');
  });

  it('handles replaced video elements: old one pruned, new one routed once (V09)', async () => {
    const m = mk(), a = video(), b = video();
    await m.ensure(a);
    a.isConnected = false;
    await m.ensure(b);
    expect(sourceCalls).toEqual([a, b]);
    expect(m.diag().sources).toBe(1);
    expect(m.isRouted(b)).toBe(true);
  });

  it('source creation failure is reported, not thrown', async () => {
    behaviour.sourceThrows = true;
    const r = await mk().ensure(video());
    expect(r).toEqual({ ok: false, reason: 'source-failed' });
  });

  it('missing / throwing AudioContext', async () => {
    expect((await A.createManager({ AudioContextCtor: null }).ensure(video())).reason).toBe('no-webaudio');
    class Boom { constructor() { throw new Error('x'); } }
    expect((await A.createManager({ AudioContextCtor: Boom }).ensure(video())).reason).toBe('ctx-create');
  });

  it('apply() maps tab state onto gain / limiter / eq', async () => {
    const m = mk();
    expect(m.apply(S.defaultTabState(100), S)).toBeUndefined(); // no graph yet: harmless
    await m.ensure(video());
    const s = { ...S.defaultTabState(250), limiter: false, eq: { enabled: true, profile: 'custom', bass: 3, mid: -2, treble: 1 } };
    m.apply(s, S);
    const d = m.diag();
    expect(d.gain).toBe(2.5);
    expect(d.limiter).toBe(false);
    expect(d.eq).toEqual([3, -2, 1]);
    m.apply({ ...s, eq: { ...s.eq, enabled: false } }, S);
    expect(m.diag().eq).toEqual([0, 0, 0]); // bypass = flat, nodes stay wired
  });

  it('recover() is a no-op without a context', async () => {
    await expect(mk().recover()).resolves.toBeUndefined();
  });
});

describe('softClip / curve', () => {
  it('is identity below the knee, odd-symmetric, bounded below 1', () => {
    expect(A.softClip(0.5)).toBe(0.5);
    expect(A.softClip(-0.8)).toBe(-0.8);
    expect(A.softClip(0.9)).toBeLessThan(0.9);
    expect(A.softClip(5)).toBeLessThanOrEqual(1);
    expect(A.softClip(-0.95)).toBe(-A.softClip(0.95));
    const c = A.makeCurve(9);
    expect(c[4]).toBe(0);
    expect(Math.max(...c)).toBeLessThan(0.96); // table ends at |x|=1, so overshoot clamps below full scale
  });
});
