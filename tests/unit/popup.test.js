// @vitest-environment jsdom
// Popup view logic against the real popup.html markup with a fake chrome.* and a fake tab port.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const EXT = 'ext-id';
const html = readFileSync(resolve(process.cwd(), 'src/popup.html'), 'utf8');
const bodyHtml = html.slice(html.indexOf('<body>') + 6, html.indexOf('</body>')).replace(/<script[^>]*><\/script>/g, '');

let storage, port, tabsCreated, ytTabs, activeTab;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const $ = (id) => document.getElementById(id);
const raf = () => sleep(30);

const mkState = (over = {}) => ({
  v: 1, volume: 100, muted: false, lastNonZero: 100, limiter: true,
  eq: { enabled: false, profile: 'flat', bass: 0, mid: 0, treble: 0 }, rev: 1, ...over
});
const push = (over = {}, applied, extra = {}) => {
  const state = mkState(over);
  port.emit({ type: 'STATE', epoch: 'e1', state, boost: false,
    applied: applied || { rev: state.rev, pct: state.volume, status: 'ok', reason: null }, diag: { status: 'none' }, ...extra });
  return state;
};
const lastSent = () => port.sent.at(-1);
const reply = (cmd, extra = {}) => port.emit({ type: 'REPLY', id: cmd.id, ok: true, ...extra });

async function load({ active, yt } = {}) {
  storage = {}; tabsCreated = []; port = null;
  activeTab = active === undefined ? { id: 5, url: 'https://www.youtube.com/watch?v=a', title: 'My video', audible: true } : active;
  ytTabs = yt || (activeTab ? [activeTab] : []);
  document.body.innerHTML = bodyHtml;
  globalThis.chrome = {
    storage: {
      local: { get: async () => ({ ...storage }), set: async (o) => { Object.assign(storage, o); } },
      onChanged: { addListener: () => {} }
    },
    tabs: {
      query: async (q) => (q.active ? (activeTab ? [activeTab] : []) : ytTabs),
      create: async (o) => tabsCreated.push(o),
      connect: (id, info) => {
        const h = {};
        port = { id, info, sent: [], handlers: h,
          postMessage(m) { this.sent.push(m); },
          onMessage: { addListener: (f) => (h.message = f) },
          onDisconnect: { addListener: (f) => (h.disconnect = f) },
          emit: (m) => h.message(m) };
        return port;
      }
    },
    commands: { getAll: async () => [
      { name: 'volume-up', description: 'Volume up', shortcut: 'Alt+Up' },
      { name: 'preset-1', description: 'Apply preset 1', shortcut: '' },
      { name: '_execute_action', description: '', shortcut: '' }] },
    runtime: { lastError: undefined }
  };
  vi.resetModules();
  await import('../../src/lib/state.js'); await import('../../src/lib/settings.js');
  await import('../../src/popup.js');
  await sleep(30);
}

describe('without a YouTube tab', () => {
  it('disables tab controls but keeps settings usable', async () => {
    await load({ active: { id: 1, url: 'https://example.com/' }, yt: [] });
    expect(port).toBeNull();
    expect($('tabControls').disabled).toBe(true);
    expect($('status').textContent).toMatch(/Open YouTube/);
    expect($('presetEditor').children.length).toBe(5); // presets editable without a tab
  });
});

describe('with a YouTube tab', () => {
  beforeEach(load);

  it('connects to the active tab only and shows its title', () => {
    expect(port.id).toBe(5);
    expect(port.info.name).toBe('rl-popup');
    expect($('tabControls').disabled).toBe(false);
    expect($('target').textContent).toBe('My video');
    expect(port.sent[0]).toMatchObject({ type: 'GET_STATE' });
  });

  it('background YouTube tab is labelled and targeted (V05)', async () => {
    await load({ active: { id: 1, url: 'https://example.com/' }, yt: [{ id: 8, url: 'https://www.youtube.com/x', title: 'BG', audible: true }] });
    expect(port.id).toBe(8);
    expect($('target').textContent).toContain('BG');
  });

  it('renders volume, mute and preset state from the tab', () => {
    push({ volume: 150, rev: 2 });
    expect($('volNum').textContent).toBe('150');
    expect($('volNum').className).toContain('boost');
    expect($('soundState').textContent).toBe('Limiter on · EQ off');
    expect($('sliderBox').style.getPropertyValue('--fill')).toBe('100%');
    push({ volume: 100, muted: true, rev: 3 });
    expect($('volNum').textContent).toBe('0');
    expect($('muteBtn').getAttribute('aria-pressed')).toBe('true');
    expect($('muteBtn').getAttribute('aria-label')).toBe('Unmute');
    push({ volume: 100, rev: 4 });
    const pressed = [...document.querySelectorAll('.preset')].filter((b) => b.getAttribute('aria-pressed') === 'true');
    expect(pressed).toHaveLength(1);
    expect(pressed[0].textContent).toContain('Normal');
  });

  it('ignores stale (older rev) updates but takes newer ones (V07)', () => {
    push({ volume: 60, rev: 5 });
    push({ volume: 99, rev: 3 });
    expect($('volNum').textContent).toBe('60');
    push({ volume: 70, rev: 6 });
    expect($('volNum').textContent).toBe('70');
    port.emit({ type: 'STATE', epoch: 'e2', state: mkState({ volume: 30, rev: 0 }), applied: { rev: 0, pct: 30, status: 'ok' } }); // reloaded page
    expect($('volNum').textContent).toBe('30');
  });

  it('status tells the truth: applying, applied, boosted, failed', () => {
    const s = push({ volume: 50, rev: 2 }, { rev: 1, pct: 100, status: 'ok' });
    expect($('status').textContent).toBe('Applying…');
    push({ volume: 50, rev: 2 });
    expect($('status').textContent).toMatch(/50%/);
    expect($('status').className).toContain('ok');
    push({ volume: 250, rev: 3 });
    expect($('status').textContent).toMatch(/Boosted to 250%/);
    push({ volume: 250, rev: 4 }, { rev: 4, pct: 100, status: 'failed', reason: 'needs-gesture' });
    expect($('status').textContent).toMatch(/Playing at 100%.*click the YouTube page/);
    expect($('status').className).toContain('err');
    void s;
  });

  it('slider drags are coalesced per frame and flushed on release with increasing seq', async () => {
    push({ volume: 100, rev: 1 });
    const sl = $('volSlider');
    for (const v of [90, 80, 70]) { sl.value = v; sl.dispatchEvent(new Event('input')); }
    await raf();
    const patches = port.sent.filter((m) => m.type === 'PATCH');
    expect(patches).toHaveLength(1);
    expect(patches[0].patch).toEqual({ volume: 70 });
    sl.dispatchEvent(new Event('change'));
    const all = port.sent.filter((m) => m.type === 'PATCH');
    expect(all).toHaveLength(2);
    expect(all[1].seq).toBeGreaterThan(all[0].seq);
    expect(new Set(all.map((m) => m.clientId)).size).toBe(1);
  });

  it('mute, wheel, keyboard and custom input send validated intents', async () => {
    push({ volume: 100, rev: 1 });
    $('muteBtn').click();
    expect(lastSent()).toMatchObject({ type: 'ACTION', action: 'toggleMute' });
    $('volDisplay').dispatchEvent(new WheelEvent('wheel', { deltaY: -1, cancelable: true }));
    expect(lastSent()).toMatchObject({ action: 'volUp' });
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', shiftKey: true, cancelable: true }));
    expect(lastSent()).toMatchObject({ action: 'fineDown' });
    $('customInput').focus();
    const n = port.sent.length;
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', cancelable: true }));
    expect(port.sent.length).toBe(n); // typing: arrows ignored
    $('customInput').value = '42';
    $('customInput').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    expect(lastSent()).toMatchObject({ type: 'PATCH', patch: { volume: 42 } });
    $('customInput').value = 'abc';
    const m = port.sent.length;
    $('customInput').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    expect(port.sent.length).toBe(m);
  });

  it('rejection and timeouts surface as errors', async () => {
    push({ volume: 100, rev: 1 });
    $('muteBtn').click();
    reply(lastSent(), { ok: false, error: 'bad-action' });
    await sleep(5);
    expect($('status').textContent).toMatch(/Rejected: bad-action/);
  });

  it('preset click applies to the selected tab; Boost-only presets are flagged', () => {
    push({ volume: 100, rev: 1 });
    const btns = [...document.querySelectorAll('.preset')];
    btns[0].click();
    expect(lastSent()).toMatchObject({ type: 'ACTION', action: 'preset', value: 25 });
    expect(btns[4].title).toMatch(/Boost mode/); // 200% needs boost
  });

  it('EQ and limiter controls send patches; bands disabled until EQ is on', async () => {
    push({ rev: 1 });
    expect($('eq-bass').disabled).toBe(true);
    $('eqToggle').checked = true; $('eqToggle').dispatchEvent(new Event('change'));
    expect(lastSent().patch).toEqual({ eq: { enabled: true } });
    $('eqProfile').value = 'vocal'; $('eqProfile').dispatchEvent(new Event('change'));
    expect(lastSent().patch).toEqual({ eq: { profile: 'vocal' } });
    push({ rev: 2, eq: { enabled: true, profile: 'custom', bass: 0, mid: 0, treble: 0 } });
    const bass = $('eq-bass');
    expect(bass.disabled).toBe(false);
    bass.value = '4.5'; bass.dispatchEvent(new Event('input'));
    bass.value = '5'; bass.dispatchEvent(new Event('input'));
    await raf();
    expect(lastSent().patch).toEqual({ eq: { bass: 5 } });
    $('eqReset').click();
    expect(lastSent().patch).toEqual({ eq: { profile: 'flat' } });
    $('limiterToggle').checked = false; $('limiterToggle').dispatchEvent(new Event('change'));
    expect(lastSent().patch).toEqual({ limiter: false });
  });

  it('shows the audio-engine diagnostic', () => {
    push({ rev: 1 }, undefined, { diag: { status: 'suspended', reason: 'needs-gesture', reductionDb: -3.2 } });
    expect($('audioNote').textContent).toMatch(/suspended \(needs-gesture\).*−3\.2 dB/);
  });

  it('disconnect (tab reloaded / extension reloaded) is reported and controls disable', () => {
    push({ rev: 1 });
    port.handlers.disconnect();
    expect($('tabControls').disabled).toBe(true);
    expect($('status').textContent).toMatch(/reload the YouTube tab/i);
  });
});

describe('presets editor and settings', () => {
  beforeEach(load);
  const rows = () => [...document.querySelectorAll('.preset-edit')];

  it('add, rename, reject duplicate, reorder, delete, restore - persisted globally', async () => {
    push({ volume: 123, rev: 1 });
    $('presetAdd').click(); await sleep(20);
    expect(rows()).toHaveLength(6);
    expect(storage.rl_settings.presets.at(-1).volume).toBe(123);

    const name0 = rows()[0].querySelector('input');
    name0.value = 'Night'; name0.dispatchEvent(new Event('change')); await sleep(20);
    expect(storage.rl_settings.presets[0].name).toBe('Night');

    const name1 = rows()[1].querySelector('input');
    name1.value = 'night'; name1.dispatchEvent(new Event('change')); await sleep(20);
    expect($('status').textContent).toMatch(/exists/);
    expect(storage.rl_settings.presets[1].name).not.toBe('night');

    const vol1 = rows()[1].querySelectorAll('input')[1];
    vol1.value = '999'; vol1.dispatchEvent(new Event('change')); await sleep(20);
    expect($('status').textContent).toMatch(/0–300/);

    rows()[0].querySelector('button[aria-label^="Move"][aria-label$="down"]').click(); await sleep(20);
    expect(storage.rl_settings.presets[1].name).toBe('Night');
    expect(rows()[0].querySelector('button[aria-label$="up"]').disabled).toBe(true);

    rows()[0].querySelector('button[aria-label^="Delete"]').click(); await sleep(20);
    expect(rows()).toHaveLength(5);

    $('presetRestore').click(); await sleep(20);
    expect(storage.rl_settings.presets.map((p) => p.volume)).toEqual([25, 50, 100, 150, 200]);
  });

  it('cannot delete the last preset', async () => {
    for (let i = 0; i < 4; i++) { rows()[0].querySelector('button[aria-label^="Delete"]').click(); await sleep(15); }
    expect(rows()).toHaveLength(1);
    expect(rows()[0].querySelector('button[aria-label^="Delete"]').disabled).toBe(true);
  });

  it('boost toggle, key step validation and new-tab default are saved as settings', async () => {
    push({ volume: 70, rev: 1 });
    $('boostToggle').checked = true; $('boostToggle').dispatchEvent(new Event('change')); await sleep(20);
    expect(storage.rl_settings.boost).toBe(true);
    expect($('volSlider').max).toBe('300');

    $('stepInput').value = '10'; $('stepInput').dispatchEvent(new Event('change')); await sleep(20);
    expect(storage.rl_settings.step).toBe(10);
    $('stepInput').value = '99'; $('stepInput').dispatchEvent(new Event('change')); await sleep(20);
    expect(storage.rl_settings.step).toBe(10);
    expect($('status').textContent).toMatch(/1–25/);

    $('setDefault').click(); await sleep(20);
    expect(storage.rl_settings.defaultVolume).toBe(70);
  });

  it('lists browser shortcuts (with "not set") and opens the browser shortcut page', async () => {
    const text = $('cmdList').textContent;
    expect(text).toContain('Alt+Up');
    expect(text).toContain('not set');
    expect(text).not.toContain('_execute_action');
    $('openShortcuts').click();
    expect(tabsCreated).toEqual([{ url: 'chrome://extensions/shortcuts' }]);
  });
});
