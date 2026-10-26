// @vitest-environment jsdom
// Integration: content.js + injected.js + libs in one jsdom document, with a fake chrome.* and a
// FAKE AudioContext. Verifies protocol, ordering, sender validation, applied-vs-desired state and
// UI wiring. It cannot verify sound (see tests/dsp) or real YouTube (see manual matrix).
import { describe, it, expect, beforeAll } from 'vitest';

const EXT = 'ext-id';
let storage, listeners, ports, AudioBehaviour, createdSources;

const param = (v = 0) => ({ value: v, setTargetAtTime(x) { this.value = x; } });
const node = (extra = {}) => ({ connect() {}, disconnect() {}, ...extra });
class FakeAudioContext {
  constructor() { lastCtx = this; this.state = AudioBehaviour.initial; this.currentTime = 1; this.destination = node(); }
  resume() { if (AudioBehaviour.canResume) this.state = 'running'; return Promise.resolve(); }
  close() { this.state = 'closed'; }
  createGain() { return node({ gain: param(1) }); }
  createBiquadFilter() { return node({ gain: param(), frequency: param(), Q: param() }); }
  createDynamicsCompressor() { return node({ threshold: param(), knee: param(), ratio: param(), attack: param(), release: param(), reduction: 0 }); }
  createWaveShaper() { return node(); }
  createDelay() { return node({ delayTime: param() }); }
  createMediaElementSource(el) { createdSources.push(el); return node(); }
}

let video, lastCtx;
const send = (msg, sender = { id: EXT }) => new Promise((resolve) => listeners.message(msg, sender, resolve));
const patch = (p, extra = {}) => send({ type: 'PATCH', patch: p, ...extra });
const setSettings = (s) => { // what the popup does: write rl_settings, then onChanged fires in every tab
  storage.rl_settings = { ...storage.rl_settings, ...s };
  listeners.changed({ rl_settings: { newValue: storage.rl_settings } }, 'local');
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

beforeAll(async () => {
  storage = { rl_volume: 40 }; // legacy install: should become the new-tab default
  listeners = {}; ports = []; createdSources = [];
  AudioBehaviour = { initial: 'running', canResume: true };
  globalThis.chrome = {
    runtime: { id: EXT, onMessage: { addListener: (f) => (listeners.message = f) }, onConnect: { addListener: (f) => (listeners.connect = f) } },
    storage: {
      local: {
        get: async () => ({ ...storage }),
        set: async (o) => { Object.assign(storage, o); }
      },
      onChanged: { addListener: (f) => (listeners.changed = f) }
    }
  };
  window.AudioContext = FakeAudioContext;
  document.body.innerHTML = `
    <div id="movie_player"><video class="html5-main-video"></video>
      <div class="ytp-chrome-controls"><div class="ytp-volume-area"><button class="ytp-mute-button"></button></div></div>
    </div><input id="search" />`;
  video = document.querySelector('video');
  document.getElementById('movie_player').setVolume = (v) => { video.volume = v / 100; };
  document.getElementById('movie_player').unMute = () => {};

  const L = (p) => import(p);
  await L('../../src/lib/state.js'); await L('../../src/lib/settings.js'); await L('../../src/lib/audio-graph.js');
  await L('../../src/injected.js');
  await L('../../src/content.js');
  await sleep(30); // let ready + first apply settle
});

describe('boot and new-tab default', () => {
  it('new tab starts from the migrated global default, not from any live tab', async () => {
    const r = await send({ type: 'GET_STATE' });
    expect(r.state.volume).toBe(40);
    expect(JSON.parse(sessionStorage.getItem('rl_tab')).volume).toBe(40);
    expect(localStorage.getItem('rl_volume')).toBe('40'); // seed for the next brand-new tab
    expect(video.volume).toBeCloseTo(0.4);
    expect(r.applied).toMatchObject({ rev: r.state.rev, status: 'ok' });
  });
  it('widget is injected and mirrors state', () => {
    expect(document.getElementById('rl-vol-widget')).not.toBeNull();
    expect(document.getElementById('rl-vol-input').value).toBe('40');
    const slider = document.getElementById('rl-vol-slider-wrap');
    expect(slider.getAttribute('role')).toBe('slider');
    expect(slider.getAttribute('aria-valuenow')).toBe('40');
  });
});

describe('commands: validation and trust', () => {
  it('applies a PATCH and reports an applied ack for the same rev', async () => {
    const r = await patch({ volume: 55 });
    expect(r.ok).toBe(true);
    expect(r.state.volume).toBe(55);
    expect(r.applied).toMatchObject({ rev: r.state.rev, pct: 55, status: 'ok' });
    expect(video.volume).toBeCloseTo(0.55);
  });
  it.each([[NaN], [Infinity], [-1], [301], ['50']])('rejects volume %s and changes nothing', async (v) => {
    const before = (await send({ type: 'GET_STATE' })).state;
    const r = await patch({ volume: v });
    expect(r.ok).toBe(false);
    expect(r.state).toEqual(before);
  });
  it('rejects senders that are not our extension pages (V26)', async () => {
    for (const sender of [{ id: 'evil' }, { id: EXT, tab: { id: 1 } }, null, {}]) {
      expect((await send({ type: 'PATCH', patch: { volume: 1 } }, sender)).error).toBe('untrusted');
    }
    expect((await send({ type: 'GET_STATE' })).state.volume).toBe(55);
    expect((await send({ type: 'NOPE' })).error).toBe('unknown-type');
    expect((await send({ type: 'ACTION', action: 'explode' })).error).toBe('bad-action');
    expect((await send(null)).error).toBe('untrusted');
  });
  it('drops out-of-order intents from one client (stale seq)', async () => {
    expect((await patch({ volume: 61 }, { clientId: 'c1', seq: 5 })).ok).toBe(true);
    const late = await patch({ volume: 10 }, { clientId: 'c1', seq: 3 });
    expect(late.error).toBe('stale-seq');
    expect(late.state.volume).toBe(61);
  });
  it('ignores a page-forged RL_APPLY with out-of-range values', () => {
    document.dispatchEvent(new CustomEvent('RL_APPLY', { detail: { pct: 9999, rev: 1 } }));
    document.dispatchEvent(new CustomEvent('RL_APPLY', { detail: { pct: NaN, rev: 1 } }));
    expect(video.volume).toBeCloseTo(0.61);
  });
});

describe('per-tab isolation and persistence', () => {
  it('survives a reload: a new content script would read this tab\'s sessionStorage', async () => {
    await patch({ volume: 72 });
    expect(JSON.parse(sessionStorage.getItem('rl_tab'))).toMatchObject({ volume: 72, muted: false });
  });
  it('a global-default change never touches a live tab', async () => {
    setSettings({ defaultVolume: 20 });
    expect((await send({ type: 'GET_STATE' })).state.volume).toBe(72);
    expect(localStorage.getItem('rl_volume')).toBe('20');
  });
});

describe('actions (shortcuts) honour step and boost', () => {
  it('volUp / volDown use the configured step', async () => {
    setSettings({ step: 10 });
    expect((await send({ type: 'ACTION', action: 'volUp' })).state.volume).toBe(82);
    expect((await send({ type: 'ACTION', action: 'volDown' })).state.volume).toBe(72);
    expect((await send({ type: 'ACTION', action: 'reset' })).state.volume).toBe(100);
    expect((await send({ type: 'ACTION', action: 'preset', value: 25 })).state.volume).toBe(25);
    expect((await send({ type: 'ACTION', action: 'preset', value: 'x' })).error).toBe('bad-action');
  });
  it('mute folds into one flag and restores', async () => {
    await patch({ volume: 80 });
    const m = await send({ type: 'ACTION', action: 'toggleMute' });
    expect(m.state).toMatchObject({ muted: true, volume: 80 });
    expect(video.volume).toBe(0);
    const u = await send({ type: 'ACTION', action: 'toggleMute' });
    expect(u.state.muted).toBe(false);
    expect(video.volume).toBeCloseTo(0.8);
  });
});

describe('boost (>100%) path', () => {
  it('is refused while boost mode is off', async () => {
    expect((await patch({ volume: 250 })).state.volume).toBe(100);
  });
  it('routes through the gain stage when allowed, applied pct tells the truth', async () => {
    setSettings({ boost: true });
    const r = await patch({ volume: 250 });
    expect(r.state.volume).toBe(250);
    expect(r.applied).toMatchObject({ rev: r.state.rev, pct: 250, status: 'ok' });
    expect(r.diag).toMatchObject({ status: 'running', gain: 2.5, sources: 1 });
    expect(video.volume).toBe(1); // native locked at 100
    expect(createdSources).toEqual([video]);
  });
  it('rapid 100→250→60→300 resolves to the last intent (V07)', async () => {
    const rs = await Promise.all([patch({ volume: 100 }), patch({ volume: 250 }), patch({ volume: 60 }), patch({ volume: 300 })]);
    const final = await send({ type: 'GET_STATE' });
    expect(final.state.volume).toBe(300);
    expect(final.applied).toMatchObject({ rev: final.state.rev, pct: 300, status: 'ok' });
    expect(final.diag.gain).toBe(3);
    expect(rs.every((r) => r.ok)).toBe(true);
    expect(createdSources).toHaveLength(1); // still routed once
  });
  it('EQ + limiter settings reach the graph', async () => {
    const r = await patch({ eq: { enabled: true, profile: 'bass' }, limiter: false });
    expect(r.diag).toMatchObject({ limiter: false, eq: [6, 0, 0] });
    const off = await patch({ eq: { enabled: false } });
    expect(off.diag.eq).toEqual([0, 0, 0]);
    await patch({ limiter: true });
  });
  it('a replaced <video> is routed once and the old one is released (V09)', async () => {
    const old = video;
    const next = document.createElement('video');
    next.className = 'html5-main-video';
    old.replaceWith(next); video = next;
    next.dispatchEvent(new Event('loadstart'));
    await sleep(30);
    expect(createdSources).toEqual([old, next]);
    const d = (await send({ type: 'GET_STATE' })).diag;
    expect(d.sources).toBe(1);
  });
  it('turning boost off clamps a boosted tab to 100', async () => {
    setSettings({ boost: false });
    await sleep(20);
    expect((await send({ type: 'GET_STATE' })).state.volume).toBe(100);
  });
});

describe('failure is reported, not hidden (V22)', () => {
  it('a boosted tab whose AudioContext gets suspended reports silence, then recovers on a user gesture', async () => {
    setSettings({ boost: true });
    await patch({ volume: 200 });
    const ctx = lastCtx;
    ctx.state = 'suspended'; AudioBehaviour.canResume = false;
    const r = await patch({ volume: 220 });
    expect(r.state.volume).toBe(220);                       // desired
    expect(r.applied).toMatchObject({ rev: r.state.rev, status: 'failed', reason: 'needs-gesture', pct: 0 }); // truth: routed into a dead context = silent
    expect(document.getElementById('rl-vol-input').className).toContain('failed');

    AudioBehaviour.canResume = true;
    document.dispatchEvent(new Event('pointerdown'));
    await sleep(60);
    const ok = await send({ type: 'GET_STATE' });
    expect(ok.applied).toMatchObject({ rev: ok.state.rev, status: 'ok', pct: 220 });
  });
});

describe('player integration', () => {
  it('the YouTube speaker button toggles our mute flag instead of YouTube\'s', async () => {
    await patch({ volume: 60 });
    document.querySelector('.ytp-mute-button').click();
    await sleep(20);
    expect((await send({ type: 'GET_STATE' })).state.muted).toBe(true);
    document.querySelector('.ytp-mute-button').click();
    await sleep(20);
    expect((await send({ type: 'GET_STATE' })).state.muted).toBe(false);
  });
  it('YouTube\'s own mute (e.g. the "m" key) is folded into our mute flag', async () => {
    await sleep(200); // let the apply-echo guard expire
    video.muted = true;
    video.dispatchEvent(new Event('volumechange'));
    await sleep(20);
    expect((await send({ type: 'GET_STATE' })).state.muted).toBe(true);
    expect(video.muted).toBe(false);
    await send({ type: 'ACTION', action: 'toggleMute' });
  });
  it('arrow keys change volume after clicking the player, not while typing (V23)', async () => {
    await patch({ volume: 50 });
    setSettings({ step: 5 });
    document.getElementById('movie_player').dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true, cancelable: true }));
    await sleep(20);
    expect((await send({ type: 'GET_STATE' })).state.volume).toBe(55);

    const search = document.getElementById('search');
    search.focus();
    search.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true, cancelable: true }));
    await sleep(20);
    expect((await send({ type: 'GET_STATE' })).state.volume).toBe(55);

    search.blur();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', ctrlKey: true, bubbles: true, cancelable: true }));
    await sleep(20);
    expect((await send({ type: 'GET_STATE' })).state.volume).toBe(55); // ctrl+arrow left alone
  });
  it('typing a value in the widget input commits on blur', async () => {
    const input = document.getElementById('rl-vol-input');
    input.value = '33'; input.dispatchEvent(new Event('blur'));
    await sleep(20);
    expect((await send({ type: 'GET_STATE' })).state.volume).toBe(33);
    input.value = 'abc'; input.dispatchEvent(new Event('blur'));
    await sleep(20);
    expect((await send({ type: 'GET_STATE' })).state.volume).toBe(33);
  });
  it('SPA navigation re-applies the tab volume', async () => {
    const seen = [];
    const spy = (e) => seen.push(e.detail);
    document.addEventListener('RL_APPLY', spy);
    document.dispatchEvent(new Event('yt-navigate-finish'));
    await sleep(450);
    document.removeEventListener('RL_APPLY', spy);
    expect(seen.at(-1)).toMatchObject({ pct: 33 });
  });
});

describe('popup port', () => {
  const fakePort = (name, sender) => {
    const p = { name, sender, sent: [], disconnected: false, handlers: {}, disconnect() { this.disconnected = true; },
      postMessage(m) { this.sent.push(m); },
      onMessage: { addListener: (f) => (p.handlers.message = f) },
      onDisconnect: { addListener: (f) => (p.handlers.disconnect = f) } };
    return p;
  };
  it('rejects wrong-name and untrusted ports', () => {
    const a = fakePort('other', { id: EXT }); listeners.connect(a);
    const b = fakePort('rl-popup', { id: 'evil' }); listeners.connect(b);
    const c = fakePort('rl-popup', { id: EXT, tab: { id: 1 } }); listeners.connect(c);
    expect([a, b, c].map((p) => p.disconnected)).toEqual([true, true, true]);
  });
  it('trusted popup gets state, replies with its request id, and live broadcasts', async () => {
    const p = fakePort('rl-popup', { id: EXT });
    listeners.connect(p);
    await sleep(10);
    expect(p.sent[0].type).toBe('STATE');
    await p.handlers.message({ id: 7, type: 'PATCH', patch: { volume: 44 }, clientId: 'pp', seq: 1 });
    expect(p.sent.find((m) => m.type === 'REPLY')).toMatchObject({ id: 7, ok: true, state: { volume: 44 } });
    // a change made elsewhere (widget / shortcut) is pushed to the open popup
    p.sent.length = 0;
    await send({ type: 'ACTION', action: 'volUp' });
    expect(p.sent.some((m) => m.type === 'STATE' && m.state.volume === 49)).toBe(true);
    p.handlers.disconnect();
    p.sent.length = 0;
    await patch({ volume: 10 });
    expect(p.sent).toEqual([]);
  });
});
