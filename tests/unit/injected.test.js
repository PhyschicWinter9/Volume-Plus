// @vitest-environment jsdom
// MAIN-world bootstrap + prototype patch behaviour (V11, V26).
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const volDesc = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'volume');
const origSetItem = Storage.prototype.setItem;

let video, acks, added;
const realAdd = document.addEventListener.bind(document);
const onAck = (e) => acks.push(e.detail);

function restore() {
  Object.defineProperty(HTMLMediaElement.prototype, 'volume', volDesc);
  Storage.prototype.setItem = origSetItem;
}
async function boot() {
  restore(); // a second boot in one test must wrap the pristine prototype, not the first patch
  vi.resetModules();
  await import('../../src/injected.js');
}
const apply = (detail) => document.dispatchEvent(new CustomEvent('RL_APPLY', { detail }));

beforeEach(() => {
  sessionStorage.clear(); localStorage.clear();
  document.body.innerHTML = '<div id="movie_player"></div><video class="html5-main-video"></video>';
  video = document.querySelector('video');
  acks = [];
  // each boot() re-runs injected.js; drop its document listeners afterwards so they don't pile up
  added = [];
  document.addEventListener = (t, fn, o) => { added.push([t, fn, o]); realAdd(t, fn, o); };
  document.addEventListener('RL_APPLIED', onAck);
  // minimal YouTube player: setVolume goes through the (patched) element setter
  document.getElementById('movie_player').setVolume = (v) => { video.volume = v / 100; };
  document.getElementById('movie_player').unMute = () => {};
});
afterEach(() => {
  for (const [t, fn, o] of added) document.removeEventListener(t, fn, o);
  document.addEventListener = realAdd;
  restore();
});

describe('early bootstrap order', () => {
  it('uses this tab\'s sessionStorage state first', async () => {
    sessionStorage.setItem('rl_tab', JSON.stringify({ volume: 40 }));
    localStorage.setItem('rl_volume', '90');
    await boot();
    video.volume = 1; // YouTube restoring ITS value
    expect(video.volume).toBeCloseTo(0.4);
  });
  it('boosted tab starts native at 100 (gain is applied later by content.js)', async () => {
    sessionStorage.setItem('rl_tab', JSON.stringify({ volume: 250 }));
    await boot();
    video.volume = 0.2;
    expect(video.volume).toBe(1);
  });
  it('muted tab starts silent', async () => {
    sessionStorage.setItem('rl_tab', JSON.stringify({ volume: 70, muted: true }));
    await boot();
    video.volume = 1;
    expect(video.volume).toBe(0);
  });
  it('falls back to the new-tab default mirror, capped at 100', async () => {
    localStorage.setItem('rl_volume', '35');
    await boot(); video.volume = 1;
    expect(video.volume).toBeCloseTo(0.35);
    localStorage.setItem('rl_volume', '250');
    await boot(); video.volume = 0.1;
    expect(video.volume).toBe(1);
  });
  it('then YouTube\'s own saved volume (first run), then 100', async () => {
    localStorage.setItem('yt-player-volume', JSON.stringify({ data: JSON.stringify({ volume: 20, muted: false }) }));
    await boot(); video.volume = 1;
    expect(video.volume).toBeCloseTo(0.2);
    localStorage.clear();
    await boot(); video.volume = 0.5;
    expect(video.volume).toBe(1);
  });
  it('ignores corrupt storage', async () => {
    sessionStorage.setItem('rl_tab', '{not json');
    localStorage.setItem('rl_volume', 'abc');
    await boot(); video.volume = 0.5;
    expect(video.volume).toBe(1);
  });
  it('another tab\'s localStorage change cannot move this tab (per-tab isolation)', async () => {
    sessionStorage.setItem('rl_tab', JSON.stringify({ volume: 30 }));
    await boot();
    localStorage.setItem('rl_volume', '90'); // what "another tab" would have written under the old design
    video.volume = 1;
    expect(video.volume).toBeCloseTo(0.3);
  });
});

describe('RL_APPLY bridge validation (V26)', () => {
  beforeEach(async () => { await boot(); });
  it('applies a valid request and acknowledges with the read-back value', () => {
    apply({ pct: 55, rev: 3 });
    expect(video.volume).toBeCloseTo(0.55);
    expect(acks).toEqual([{ rev: 3, pct: 55 }]);
    video.volume = 1; // YouTube trying to override afterwards
    expect(video.volume).toBeCloseTo(0.55);
  });
  it.each([
    [undefined], [null], [{}], [{ pct: NaN, rev: 1 }], [{ pct: Infinity, rev: 1 }], [{ pct: -1, rev: 1 }],
    [{ pct: 101, rev: 1 }], [{ pct: '50', rev: 1 }], [{ pct: 50, rev: 1.5 }], [{ pct: 50, rev: '1' }], [{ pct: 50 }]
  ])('rejects forged payload %j', (d) => {
    video.volume = 1;
    apply(d);
    expect(acks).toEqual([]);
    expect(video.volume).toBe(1);
  });
  it('enforces on play / loadstart before content.js is ready', () => {
    apply({ pct: 25, rev: 1 });
    // simulate an element that was created at 1.0 by the page via the original setter
    volDesc.set.call(video, 1);
    video.dispatchEvent(new Event('play'));
    expect(video.volume).toBeCloseTo(0.25);
  });
});

describe('yt-player-volume rewrite', () => {
  it('rewrites YouTube\'s persisted value to this tab\'s level', async () => {
    sessionStorage.setItem('rl_tab', JSON.stringify({ volume: 30 }));
    await boot();
    localStorage.setItem('yt-player-volume', JSON.stringify({ data: JSON.stringify({ volume: 90, muted: false }) }));
    const inner = JSON.parse(JSON.parse(localStorage.getItem('yt-player-volume')).data);
    expect(inner).toMatchObject({ volume: 30, muted: false });
  });
  it('passes malformed or unrelated writes through', async () => {
    await boot();
    localStorage.setItem('yt-player-volume', 'not json');
    expect(localStorage.getItem('yt-player-volume')).toBe('not json');
    sessionStorage.setItem('other', 'x');
    expect(sessionStorage.getItem('other')).toBe('x');
  });
});
