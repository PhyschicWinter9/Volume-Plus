// Deterministic Chromium E2E: the REAL extension (unpacked) in a persistent context, served a local
// fixture in place of youtube.com via request interception. No live YouTube in CI.
// Measures state, native volume and the live Web Audio graph (diag); sound itself is verified in tests/dsp.
import { test, expect, chromium } from '@playwright/test';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';

const ROOT = process.cwd();
const FIXTURE = readFileSync(resolve(ROOT, 'tests/fixtures/youtube-fixture.html'), 'utf8');

function wav(seconds = 2, sr = 22050, amp = 0.5, f = 440) {
  const n = sr * seconds, b = Buffer.alloc(44 + n * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + n * 2, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(sr, 24); b.writeUInt32LE(sr * 2, 28);
  b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) b.writeInt16LE(Math.round(amp * 32767 * Math.sin(2 * Math.PI * f * i / sr)), 44 + i * 2);
  return b;
}
const WAV = wav();

async function launch({ autoplay = true } = {}) {
  const dir = mkdtempSync(resolve(tmpdir(), 'rlpw-'));
  const args = [`--disable-extensions-except=${ROOT}`, `--load-extension=${ROOT}`];
  args.push('--autoplay-policy=' + (autoplay ? 'no-user-gesture-required' : 'document-user-activation-required'));
  const ctx = await chromium.launchPersistentContext(dir, { channel: 'chromium', headless: true, args });
  await ctx.route('https://www.youtube.com/**', (route) => {
    const u = new URL(route.request().url());
    if (u.pathname === '/fixture.wav') return route.fulfill({ contentType: 'audio/wav', body: WAV, headers: { 'accept-ranges': 'none' } });
    if (u.pathname === '/favicon.ico') return route.fulfill({ status: 204 });
    return route.fulfill({ contentType: 'text/html', body: FIXTURE });
  });
  let [sw] = ctx.serviceWorkers();
  if (!sw) sw = await ctx.waitForEvent('serviceworker');
  const extId = new URL(sw.url()).host;
  return { ctx, extId, cleanup: async () => { await ctx.close(); rmSync(dir, { recursive: true, force: true }); } };
}

async function openYt(ctx, v) {
  const page = await ctx.newPage();
  await page.goto(`https://www.youtube.com/watch?v=${v}`);
  await page.waitForSelector('#rl-vol-widget');
  await page.waitForFunction(() => document.querySelector('video').readyState >= 2);
  return page;
}
const openPopup = async (ctx, extId) => {
  const p = await ctx.newPage();
  await p.goto(`chrome-extension://${extId}/src/popup.html`);
  await p.waitForFunction(() => document.getElementById('status').textContent !== '');
  return p;
};
const tabIds = (pop) => pop.evaluate(async () => Object.fromEntries((await chrome.tabs.query({ url: 'https://www.youtube.com/*' })).map((t) => [new URL(t.url).searchParams.get('v'), t.id])));
const send = (pop, id, msg) => pop.evaluate(([i, m]) => chrome.tabs.sendMessage(i, m), [id, msg]);
// diag.gain is the live AudioParam value; it ramps (setTargetAtTime), so assert it by polling, never right after a command.
const gainLands = (pop, id, want) => expect.poll(async () => (await send(pop, id, { type: 'GET_STATE' })).diag.gain, { timeout: 4000 }).toBeCloseTo(want, 2);
const nativeVol = (page) => page.evaluate(() => Math.round(document.querySelector('video').volume * 100));
const setSettings = (pop, over) => pop.evaluate(async (o) => { const s = await RL.settings.load(); await RL.settings.save({ ...s, ...o }); }, over);

let env;
test.beforeAll(async () => { env = await launch(); });
test.afterAll(async () => { await env.cleanup(); });

test('E01 extension loads; widget + content script + MAIN-world patch active; popup works with ONLY storage + host permission', async () => {
  const yt = await openYt(env.ctx, 'solo');
  expect(await yt.locator('#rl-vol-widget').count()).toBe(1);
  const manifest = JSON.parse(readFileSync(resolve(ROOT, 'manifest.json'), 'utf8'));
  expect(manifest.permissions).toEqual(['storage']);
  const pop = await openPopup(env.ctx, env.extId);
  // tabs.query({url}) and tab.title work through the host permission alone
  await expect(pop.locator('#target')).toContainText('Fixture video');
  await expect(pop.locator('#tabControls')).toBeEnabled();
  // chrome.commands registered the manifest shortcuts (what the popup lists for the user)
  const cmds = await pop.evaluate(async () => (await chrome.commands.getAll()).map((c) => `${c.name}=${c.shortcut}`));
  console.log('registered commands:', cmds.join(', '));
  expect(cmds).toContain('volume-up=Alt+Up Arrow');
  expect(cmds.some((c) => c.startsWith('preset-1='))).toBe(true);
  await expect(pop.locator('#cmdList')).toContainText('Alt+Up Arrow');
  await pop.close(); await yt.close();
});

test('E02 per-tab isolation (V04/V06): A=50%, B=200% boosted, neither affects the other', async () => {
  const a = await openYt(env.ctx, 'A'), b = await openYt(env.ctx, 'B');
  const pop = await openPopup(env.ctx, env.extId);
  await setSettings(pop, { boost: true });
  const ids = await tabIds(pop);
  const ra = await send(pop, ids.A, { type: 'PATCH', patch: { volume: 50 } });
  const rb = await send(pop, ids.B, { type: 'PATCH', patch: { volume: 200 } });
  expect(ra.applied).toMatchObject({ pct: 50, status: 'ok' });
  expect(rb.applied).toMatchObject({ pct: 200, status: 'ok' });
  expect(await nativeVol(a)).toBe(50);
  expect(await nativeVol(b)).toBe(100);                       // native locked, gain does the rest
  expect(rb.diag).toMatchObject({ status: 'running', ctxState: 'running', sources: 1 });
  await gainLands(pop, ids.B, 2);
  expect(ra.diag.sources).toBe(0);                            // A never created an audio graph
  // change A again: B untouched
  await send(pop, ids.A, { type: 'PATCH', patch: { volume: 20 } });
  const sb = await send(pop, ids.B, { type: 'GET_STATE' });
  expect(sb.state.volume).toBe(200);
  await gainLands(pop, ids.B, 2);
  expect(await a.evaluate(() => JSON.parse(sessionStorage.getItem('rl_tab')).volume)).toBe(20);
  expect(await b.evaluate(() => JSON.parse(sessionStorage.getItem('rl_tab')).volume)).toBe(200);
  await setSettings(pop, { boost: false });
  await a.close(); await b.close(); await pop.close();
});

test('E03 refresh keeps the tab volume with no spike (V11) and a fresh tab does not inherit it (V06)', async () => {
  const a = await openYt(env.ctx, 'R');
  const pop = await openPopup(env.ctx, env.extId);
  const id = (await tabIds(pop)).R;
  await send(pop, id, { type: 'PATCH', patch: { volume: 35 } });
  await a.reload();
  await a.waitForSelector('#rl-vol-widget');
  await a.waitForFunction(() => document.querySelector('video').readyState >= 2);
  await a.waitForTimeout(300);
  const seen = await a.evaluate(() => window.__vol);
  console.log('volumes observed on the <video> after reload:', JSON.stringify(seen));
  expect(await nativeVol(a)).toBe(35);
  expect(seen.every((v) => v === 0.35)).toBe(true);           // never 1.0 (the fixture "restores" 100% twice)

  const fresh = await openYt(env.ctx, 'Fresh');               // brand-new tab: default, not tab R's 35
  expect(await nativeVol(fresh)).toBe(100);
  await a.close(); await fresh.close(); await pop.close();
});

test('E04 rapid out-of-order intents: 100→250→60→300 settles on the last (V07), applied tells the truth', async () => {
  const a = await openYt(env.ctx, 'RAPID');
  const pop = await openPopup(env.ctx, env.extId);
  await setSettings(pop, { boost: true });
  const id = (await tabIds(pop)).RAPID;
  const rs = await pop.evaluate(async (i) => Promise.all([100, 250, 60, 300].map((v) => chrome.tabs.sendMessage(i, { type: 'PATCH', patch: { volume: v } }))), id);
  const fin = await send(pop, id, { type: 'GET_STATE' });
  expect(rs.every((r) => r.ok)).toBe(true);
  expect(fin.state.volume).toBe(300);
  expect(fin.applied).toMatchObject({ rev: fin.state.rev, pct: 300, status: 'ok' });
  await gainLands(pop, id, 3);
  // stale seq from the same client is dropped
  await send(pop, id, { type: 'PATCH', patch: { volume: 10 }, clientId: 'x', seq: 9 });
  const late = await send(pop, id, { type: 'PATCH', patch: { volume: 90 }, clientId: 'x', seq: 4 });
  expect(late.error).toBe('stale-seq');
  expect(late.state.volume).toBe(10);
  await setSettings(pop, { boost: false });
  await a.close(); await pop.close();
});

test('E05 limiter, EQ and bypass reach the live graph (V19/V21); limiter shows real reduction on loud boost', async () => {
  const a = await openYt(env.ctx, 'DSP');
  const pop = await openPopup(env.ctx, env.extId);
  await setSettings(pop, { boost: true });
  const id = (await tabIds(pop)).DSP;
  await send(pop, id, { type: 'PATCH', patch: { volume: 300, eq: { enabled: true, profile: 'bass' } } });
  await a.waitForTimeout(400);
  const on = await send(pop, id, { type: 'GET_STATE' });
  expect(on.diag).toMatchObject({ limiter: true, status: 'running' });
  await gainLands(pop, id, 3);
  await expect.poll(async () => (await send(pop, id, { type: 'GET_STATE' })).diag.eq, { timeout: 4000 }).toEqual([6, 0, 0]);
  console.log('live compressor reduction at 300% on a 0.5-amplitude tone:', on.diag.reductionDb, 'dB');
  expect(on.diag.reductionDb).toBeLessThan(-1);
  const off = await send(pop, id, { type: 'PATCH', patch: { limiter: false, eq: { enabled: false } } });
  expect(off.diag).toMatchObject({ limiter: false, status: 'running' });
  await expect.poll(async () => (await send(pop, id, { type: 'GET_STATE' })).diag.eq, { timeout: 3000 }).toEqual([0, 0, 0]); // smoothed ramp lands on flat
  expect(off.diag.sources).toBe(1);                            // toggling never re-routes
  await setSettings(pop, { boost: false });
  await a.close(); await pop.close();
});

test('E06 replaced <video> (V09) and SPA navigation (V10): one widget, one source, volume kept', async () => {
  const a = await openYt(env.ctx, 'SPA');
  const pop = await openPopup(env.ctx, env.extId);
  await setSettings(pop, { boost: true });
  const id = (await tabIds(pop)).SPA;
  await send(pop, id, { type: 'PATCH', patch: { volume: 180 } });
  for (let i = 0; i < 3; i++) {
    await a.click('#swap');
    await a.waitForFunction(() => document.querySelector('video').readyState >= 2);
    await a.click('#spa');
    await a.waitForTimeout(450);
  }
  expect(await a.locator('#rl-vol-widget').count()).toBe(1);
  const s = await send(pop, id, { type: 'GET_STATE' });
  expect(s.state.volume).toBe(180);
  expect(s.diag).toMatchObject({ status: 'running', sources: 1 });
  await gainLands(pop, id, 1.8);
  expect(await nativeVol(a)).toBe(100);
  expect(s.applied).toMatchObject({ rev: s.state.rev, status: 'ok', pct: 180 });
  await setSettings(pop, { boost: false });
  await a.close(); await pop.close();
});

test('E07 keyboard (V23) and native speaker button: arrows work after clicking the player, never while typing', async () => {
  const a = await openYt(env.ctx, 'KEYS');
  const pop = await openPopup(env.ctx, env.extId);
  const id = (await tabIds(pop)).KEYS;
  await send(pop, id, { type: 'PATCH', patch: { volume: 50 } });
  await a.click('#movie_player');
  await a.keyboard.press('ArrowUp');
  await a.waitForTimeout(100);
  expect(await nativeVol(a)).toBe(55);
  await a.focus('#search');
  await a.keyboard.press('ArrowUp');
  await a.waitForTimeout(100);
  expect(await nativeVol(a)).toBe(55);
  await a.click('#movie_player');
  await a.click('.ytp-mute-button');
  await a.waitForTimeout(100);
  expect(await nativeVol(a)).toBe(0);
  expect((await send(pop, id, { type: 'GET_STATE' })).state).toMatchObject({ muted: true, volume: 55 });
  await a.click('.ytp-mute-button');
  await a.waitForTimeout(100);
  expect(await nativeVol(a)).toBe(55);
  await a.close(); await pop.close();
});

test('E08 popup UI end to end: slider/custom/mute/presets drive the tab; preset edits persist globally', async () => {
  const a = await openYt(env.ctx, 'UI');
  const pop = await openPopup(env.ctx, env.extId);
  await pop.fill('#customInput', '42'); await pop.press('#customInput', 'Enter');
  await expect.poll(() => nativeVol(a)).toBe(42);
  await expect(pop.locator('#volNum')).toHaveText('42');
  await pop.click('#muteBtn');
  await expect.poll(() => nativeVol(a)).toBe(0);
  await pop.click('#muteBtn');
  await expect.poll(() => nativeVol(a)).toBe(42);
  await pop.click('.preset >> nth=0');                         // "Quiet" = 25
  await expect.poll(() => nativeVol(a)).toBe(25);
  // changes made on the page (widget) are pushed to the open popup
  await a.fill('#rl-vol-input', '65'); await a.press('#rl-vol-input', 'Enter');
  await expect(pop.locator('#volNum')).toHaveText('65');
  // presets editor: rename + add, then reopen popup and confirm persistence
  await pop.click('#presetSection summary');
  await pop.fill('.preset-edit:nth-child(1) input >> nth=0', 'Night'); await pop.press('.preset-edit:nth-child(1) input >> nth=0', 'Tab');
  await pop.click('#presetAdd');
  await pop.close();
  const pop2 = await openPopup(env.ctx, env.extId);
  await expect(pop2.locator('.preset >> nth=0')).toContainText('Night');
  expect(await pop2.locator('.preset').count()).toBe(6);
  await pop2.click('#presetSection summary');
  await pop2.click('#presetRestore');
  await expect(pop2.locator('.preset')).toHaveCount(5);
  await a.close(); await pop2.close();
});

test('E09 popup a11y basics: labelled controls, keyboard reachable, reduced-motion respected', async () => {
  const a = await openYt(env.ctx, 'A11Y');
  const pop = await openPopup(env.ctx, env.extId);
  await pop.emulateMedia({ reducedMotion: 'reduce' });
  const unlabeled = await pop.evaluate(() => [...document.querySelectorAll('input, select, button')]
    .filter((e) => !(e.getAttribute('aria-label') || e.labels?.length || e.textContent.trim() || e.title)).map((e) => e.id || e.outerHTML.slice(0, 60)));
  expect(unlabeled).toEqual([]);
  expect(await pop.evaluate(() => getComputedStyle(document.querySelector('.preset')).transitionDuration)).toBe('0s');
  await pop.keyboard.press('Tab');
  expect(await pop.evaluate(() => document.activeElement.tagName)).not.toBe('BODY');
  expect(await pop.evaluate(() => document.querySelector('script[src^="http"], link[href^="http"]'))).toBeNull(); // no external fonts/scripts
  await a.close(); await pop.close();
});

test('E10 no YouTube tab: popup says so, tab controls disabled, settings still usable', async () => {
  const pop = await openPopup(env.ctx, env.extId);
  await expect(pop.locator('#status')).toContainText('Open YouTube');
  expect(await pop.locator('#tabControls').evaluate((e) => e.disabled)).toBe(true);
  await pop.click('#settingsSection summary');
  await expect(pop.locator('#stepInput')).toBeEnabled();
  await pop.close();
});

test('E11 messaging an unreachable tab rejects (the popup turns this into a "reload the tab" message; real extension reload V12 is manual)', async () => {
  const pop = await openPopup(env.ctx, env.extId);
  const err = await pop.evaluate(async () => {
    const tab = await chrome.tabs.create({ url: 'https://www.youtube.com/never-loaded-script', active: false });
    try { await chrome.tabs.sendMessage(tab.id + 9999, { type: 'GET_STATE' }); return null; } catch (e) { return String(e.message); } finally { await chrome.tabs.remove(tab.id); }
  });
  expect(err).toMatch(/No tab|Could not establish/i);
  await pop.close();
});

test('E13 duplicate / script-opened tab inherits the opener volume (documented policy); a link-opened (noopener) tab starts at the default', async () => {
  const a = await openYt(env.ctx, 'DUP');
  const pop = await openPopup(env.ctx, env.extId);
  const id = (await tabIds(pop)).DUP;
  await send(pop, id, { type: 'PATCH', patch: { volume: 30 } });
  const [dup] = await Promise.all([env.ctx.waitForEvent('page'), a.evaluate(() => window.open(location.href))]);
  await dup.waitForSelector('#rl-vol-widget');
  await dup.waitForFunction(() => document.querySelector('video').readyState >= 2);
  console.log('script-opened tab volume:', await nativeVol(dup));
  expect(await nativeVol(dup)).toBe(30);
  // from then on they are independent
  const dupId = (await pop.evaluate(async () => (await chrome.tabs.query({ url: 'https://www.youtube.com/*' })).map((t) => t.id))).find((i) => i !== id && i !== undefined);
  await send(pop, dupId, { type: 'PATCH', patch: { volume: 80 } });
  expect(await nativeVol(a)).toBe(30);
  const [nop] = await Promise.all([env.ctx.waitForEvent('page'), a.evaluate(() => window.open(location.href, '_blank', 'noopener'))]);
  await nop.waitForSelector('#rl-vol-widget');
  await nop.waitForFunction(() => document.querySelector('video').readyState >= 2);
  expect(await nativeVol(nop)).toBe(100);
  await a.close(); await dup.close(); await nop.close(); await pop.close();
});

test('E14 measurements (V30): popup latency, storage chatter during a 100-step drag, JS heap with/without graph', async () => {
  const a = await openYt(env.ctx, 'PERF');
  const t0 = Date.now();
  const pop = await openPopup(env.ctx, env.extId);
  await expect(pop.locator('#volNum')).toHaveText(/\d+/);
  await pop.waitForFunction(() => document.getElementById('status').textContent.length > 0 && !document.getElementById('tabControls').disabled);
  const popupMs = Date.now() - t0;
  const id = (await tabIds(pop)).PERF;
  await setSettings(pop, { boost: true });
  await pop.evaluate(() => { window.__writes = 0; chrome.storage.onChanged.addListener(() => { window.__writes++; }); });
  const heap = async (page) => { const c = await env.ctx.newCDPSession(page); await c.send('Performance.enable'); const m = (await c.send('Performance.getMetrics')).metrics; return m.find((x) => x.name === 'JSHeapUsedSize').value / 1048576; };
  const h0 = await heap(a);
  const t1 = Date.now();
  await pop.evaluate(async (i) => { for (let v = 0; v <= 100; v++) await chrome.tabs.sendMessage(i, { type: 'PATCH', patch: { volume: v } }); }, id);
  const dragMs = Date.now() - t1;
  const writes = await pop.evaluate(() => window.__writes);
  await send(pop, id, { type: 'PATCH', patch: { volume: 250, eq: { enabled: true, profile: 'vocal' } } });
  await a.waitForTimeout(500);
  const h1 = await heap(a);
  console.log(`PERF popup ready ${popupMs} ms | 101 sequential PATCH round trips ${dragMs} ms (${(dragMs / 101).toFixed(1)} ms each) | chrome.storage writes during drag: ${writes} | tab JS heap ${h0.toFixed(1)} MB -> ${h1.toFixed(1)} MB with graph+EQ+limiter`);
  expect(writes).toBe(0);
  expect(popupMs).toBeLessThan(3000);
  await setSettings(pop, { boost: false });
  await a.close(); await pop.close();
});

test('E12 autoplay policy: boost either runs, or is reported as blocked and recovers on a real click (V22)', async () => {
  const strict = await launch({ autoplay: false });
  try {
    const a = await openYt(strict.ctx, 'STRICT');
    const pop = await openPopup(strict.ctx, strict.extId);
    await setSettings(pop, { boost: true });
    const id = (await tabIds(pop)).STRICT;
    const r = await send(pop, id, { type: 'PATCH', patch: { volume: 200 } });
    console.log('strict autoplay result:', JSON.stringify(r.applied), JSON.stringify({ ctx: r.diag.ctxState, status: r.diag.status, reason: r.diag.reason }));
    if (r.applied.status === 'ok') {
      expect(r.diag.ctxState).toBe('running');                 // never "ok" with a silent graph
    } else {
      expect(r.applied).toMatchObject({ status: 'failed', reason: 'needs-gesture' });
      expect(r.applied.pct).toBeLessThanOrEqual(100);          // honest: not claiming 200%
      expect(r.diag.sources).toBe(0);                          // and the video was NOT routed into a dead context
      await a.click('#movie_player');
      await expect.poll(async () => (await send(pop, id, { type: 'GET_STATE' })).applied.status).toBe('ok');
    }
  } finally { await strict.cleanup(); }
});
