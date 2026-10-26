// RELAXLIKES Volume+ — content.js
// Isolated world. Owns THIS document's volume state (the per-tab authority), the Web Audio
// graph and the in-player widget. Talks to MAIN-world injected.js via CustomEvents and to the
// popup / background via chrome.runtime ports/messages. Pure logic lives in lib/*.js.
//
// State model: desired state `state` (rev increments per accepted change) vs `applied`
// (what actually reached the player/graph, tagged with the rev it belongs to). UI only claims
// a level is audible when applied.rev === state.rev and applied.status === 'ok'.

(function () {
'use strict';

const S = RL.state, ST = RL.settings, A = RL.audio;
const WIDGET_ID = 'rl-vol-widget';
const STYLE_ID  = 'rl-vol-style';
const EPOCH     = crypto.randomUUID();       // identifies this document load; stale acks are rejected by it

let settings = ST.defaultSettings();
let hadSession = false;
let state = (() => {
  try {
    const raw = sessionStorage.getItem(S.SESSION_KEY);
    if (raw) { hadSession = true; return S.sanitizeTabState(raw); }
  } catch (_) {}
  return S.defaultTabState(100);
})();
let applied  = { rev: -1, pct: null, status: 'pending', reason: 'booting' };
let lastAck  = null;
let guardUntil = 0;                           // ignore YouTube's echo of our own writes briefly
const mgr    = A.createManager();
const ports  = new Set();
const lastSeq = new Map();                    // clientId -> highest seq seen (out-of-order protection)

function persist() {
  try { sessionStorage.setItem(S.SESSION_KEY, JSON.stringify(state)); } catch (_) {}
}

const getVideo = () => document.querySelector('.html5-main-video') || document.querySelector('video');

// =============================================
//  BRIDGE TO injected.js (native 0–100% part)
// =============================================

document.addEventListener('RL_APPLIED', (e) => { lastAck = e.detail; });

function sendNative(pct, rev) {
  lastAck = null;
  document.dispatchEvent(new CustomEvent('RL_APPLY', { detail: { pct, rev } }));
  // dispatchEvent is synchronous, so the ack (if injected.js is alive) is already here.
  return lastAck && lastAck.rev === rev ? lastAck : null;
}

// =============================================
//  APPLY: desired state -> player + audio graph
// =============================================

let retryTimer = null;

async function applyAudio(rev) {
  guardUntil = Date.now() + 150;
  const s = state;
  const video = getVideo();
  let status = 'ok', reason = null;

  if (!video) {
    status = 'pending'; reason = 'no-video';
  } else if (S.needsGraph(s) || (mgr.hasGraph() && !mgr.isRouted(video))) {
    const r = await mgr.ensure(video);
    if (!r.ok) { status = 'failed'; reason = r.reason; }
  }
  if (rev !== state.rev) return;              // a newer intent arrived while awaiting; it applies itself

  const routed = !!video && mgr.hasGraph() && mgr.isRouted(video);
  // A video routed into a context that is not running is SILENT, whatever the gain says.
  const dead = routed && mgr.diag().ctxState !== 'running';
  const graphLive = routed && !dead;
  if (routed) mgr.apply(s, S);
  if (dead) { status = 'failed'; reason = reason || 'ctx-suspended'; }

  const nat = S.nativePct(s);
  const ack = sendNative(nat, rev);
  if (!ack) { status = 'failed'; reason = 'no-injected'; }
  else if (video && ack.pct !== null && Math.abs(ack.pct - nat) > 1) { status = 'failed'; reason = 'native-mismatch'; }

  const eff = S.effective(s);
  // Report what is really audible: above 100% only if the gain stage is routed.
  const pct = dead ? 0 : eff > 100 && !graphLive ? Math.min(nat, 100) : eff;
  if (eff > 100 && !graphLive && status === 'ok') { status = 'failed'; reason = reason || 'no-graph'; }
  applied = { rev, pct, status, reason };

  clearTimeout(retryTimer);
  if (status === 'pending') retryTimer = setTimeout(reApply, 500);
  syncUI(); broadcast();
}

function reApply() { applyAudio(state.rev); }

// =============================================
//  COMMIT: the only way state changes
// =============================================

const snapshot = () => ({ epoch: EPOCH, state, applied, boost: settings.boost, diag: mgr.diag() });
let ready = null; // resolved after settings load

async function commit(patch) {
  await ready;
  const r = S.reduce(state, patch, { boost: settings.boost });
  if (!r.ok) return { ok: false, error: r.error, ...snapshot() };
  state = r.state;
  persist();
  syncUI();                                   // optimistic: shows pending until applyAudio finishes
  await applyAudio(state.rev);
  return { ok: true, ...snapshot() };
}

function broadcast() {
  const msg = { type: 'STATE', ...snapshot() };
  for (const p of ports) { try { p.postMessage(msg); } catch (_) { ports.delete(p); } }
}

// =============================================
//  COMMAND HANDLING (popup port, background messages)
// =============================================

function trustedSender(sender) {
  // Only our own extension's non-content-script contexts (popup / service worker).
  return !!sender && sender.id === chrome.runtime.id && !sender.tab;
}

async function handle(msg, sender) {
  if (!trustedSender(sender) || !msg || typeof msg !== 'object') return { ok: false, error: 'untrusted' };
  if (typeof msg.clientId === 'string' && msg.clientId.length <= 40 && Number.isInteger(msg.seq)) {
    if (msg.seq <= (lastSeq.get(msg.clientId) ?? -1)) return { ok: false, error: 'stale-seq', ...snapshot() };
    lastSeq.set(msg.clientId, msg.seq);
    if (lastSeq.size > 16) lastSeq.delete(lastSeq.keys().next().value);
  }
  switch (msg.type) {
    case 'GET_STATE': case 'GET_DIAG': await ready; return { ok: true, ...snapshot() };
    case 'PATCH':     return commit(msg.patch);
    case 'ACTION': {
      await ready;
      const patch = S.actionToPatch(state, msg.action, { step: settings.step, boost: settings.boost, value: msg.value });
      return patch ? commit(patch) : { ok: false, error: 'bad-action', ...snapshot() };
    }
    default: return { ok: false, error: 'unknown-type' };
  }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  handle(msg, sender).then(sendResponse);
  return true;
});

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== 'rl-popup' || !trustedSender(port.sender)) { port.disconnect(); return; }
  ports.add(port);
  port.onDisconnect.addListener(() => ports.delete(port));
  port.onMessage.addListener(async (msg) => {
    const reply = await handle(msg, port.sender);
    try { port.postMessage({ type: 'REPLY', id: msg && msg.id, ...reply }); } catch (_) {}
  });
  ready.then(() => { try { port.postMessage({ type: 'STATE', ...snapshot() }); } catch (_) {} });
});

// =============================================
//  UI
// =============================================

function injectStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const s = document.createElement('style');
  s.id = STYLE_ID;
  s.textContent = `
    .ytp-volume-panel { display: none !important; }

    #rl-vol-widget {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      height: 100%;
      flex-shrink: 0;
    }

    #rl-vol-slider-wrap {
      position: relative;
      width: 64px;
      height: 100%;
      display: flex;
      align-items: center;
      cursor: pointer;
      flex-shrink: 0;
    }

    #rl-vol-track {
      position: relative;
      width: 100%;
      height: 4px;
      background: rgba(255,255,255,0.3);
      border-radius: 99px;
    }

    #rl-vol-fill {
      position: absolute;
      left: 0; top: 0; bottom: 0;
      background: #fff;
      border-radius: 99px;
      pointer-events: none;
      transition: background 0.15s;
    }
    #rl-vol-fill.boosted { background: #ffb340; }

    /* the 100% line: past it the sound is louder than YouTube itself allows */
    #rl-vol-tick {
      position: absolute;
      top: -4px; bottom: -4px; width: 2px;
      left: 33.333%;
      margin-left: -1px;
      background: rgba(255,255,255,0.7);
      border-radius: 1px;
      pointer-events: none;
      display: none;
    }

    #rl-vol-thumb {
      position: absolute;
      width: 12px; height: 12px;
      background: #fff;
      border-radius: 50%;
      top: 50%;
      transform: translate(-50%, -50%);
      pointer-events: none;
      opacity: 0;
      transition: opacity 0.12s;
      box-shadow: 0 0 3px rgba(0,0,0,0.5);
    }

    #rl-vol-slider-wrap:hover #rl-vol-thumb,
    #rl-vol-slider-wrap:focus-visible #rl-vol-thumb { opacity: 1; }
    #rl-vol-slider-wrap:hover #rl-vol-fill:not(.boosted) { background: #e8ff47; }
    #rl-vol-slider-wrap:hover #rl-vol-track  { background: rgba(255,255,255,0.4); }

    #rl-vol-input {
      width: 38px;
      background: transparent;
      border: none;
      border-bottom: 1px solid rgba(255,255,255,0.3);
      color: #fff;
      font-family: "YouTube Sans", "Roboto", sans-serif;
      font-size: 13px;
      font-weight: 500;
      text-align: center;
      outline: none;
      padding: 0 1px 1px;
      -moz-appearance: textfield;
      transition: border-color 0.15s, color 0.15s;
      cursor: text;
    }

    @media (prefers-reduced-motion: reduce) { #rl-vol-widget * { transition: none !important; } }

    #rl-vol-input::-webkit-inner-spin-button,
    #rl-vol-input::-webkit-outer-spin-button { -webkit-appearance: none; }

    #rl-vol-input:focus   { border-bottom-color: #e8ff47; color: #e8ff47; }
    #rl-vol-input.boosted { color: #ffb340; }
    #rl-vol-input.muted   { color: rgba(255,255,255,0.4); }

    #rl-vol-slider-wrap:focus-visible { outline: 2px solid #e8ff47; outline-offset: 2px; border-radius: 3px; }
    #rl-vol-input.failed  { border-bottom-color: #ff7466; color: #ff7466; }
    #rl-vol-input.pending { opacity: 0.6; }

    .rl-sym {
      font-family: "YouTube Sans", "Roboto", sans-serif;
      font-size: 11px;
      color: rgba(255,255,255,0.4);
      pointer-events: none;
    }
  `;
  document.head.appendChild(s);
}


function buildWidget() {
  const wrap = document.createElement('div');
  wrap.id = WIDGET_ID;

  const sliderWrap = document.createElement('div');
  sliderWrap.id = 'rl-vol-slider-wrap';
  sliderWrap.tabIndex = 0;
  sliderWrap.setAttribute('role', 'slider');
  sliderWrap.setAttribute('aria-label', 'Volume');
  sliderWrap.setAttribute('aria-valuemin', '0');

  const track = document.createElement('div'); track.id = 'rl-vol-track';
  const fill  = document.createElement('div'); fill.id  = 'rl-vol-fill';
  const thumb = document.createElement('div'); thumb.id = 'rl-vol-thumb';
  const tick  = document.createElement('div'); tick.id  = 'rl-vol-tick';
  track.appendChild(fill); track.appendChild(tick); track.appendChild(thumb);
  sliderWrap.appendChild(track);

  const input = document.createElement('input');
  input.id    = 'rl-vol-input';
  input.type  = 'number';
  input.min   = '0';
  input.setAttribute('aria-label', 'Volume percent');
  input.title = 'Volume — type + Enter, or scroll wheel';

  const sym = document.createElement('span');
  sym.className = 'rl-sym';
  sym.textContent = '%';

  wrap.appendChild(sliderWrap);
  wrap.appendChild(input);
  wrap.appendChild(sym);

  const maxVol = () => (settings.boost ? 300 : 100);
  const patchVol = (v) => commit({ volume: v });

  // Slider drag — rAF-gated so a fast drag coalesces to at most one commit per frame.
  let dragging = false, dragRaf = null, dragVolume = null;

  function volFromX(clientX) {
    const rect = track.getBoundingClientRect();
    const frac = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    return Math.round(frac * maxVol());
  }
  function scheduleDragVolume(v) {
    dragVolume = v;
    if (dragRaf) return;
    dragRaf = requestAnimationFrame(() => { dragRaf = null; patchVol(dragVolume); });
  }

  sliderWrap.addEventListener('mousedown', (e) => {
    e.preventDefault(); e.stopPropagation();
    dragging = true; scheduleDragVolume(volFromX(e.clientX));
  });
  window.addEventListener('mousemove', (e) => { if (dragging) scheduleDragVolume(volFromX(e.clientX)); });
  window.addEventListener('mouseup',   () => { dragging = false; });

  // Keyboard on the slider itself (it is focusable): arrows = step, Shift = 1, Home/End = 0/max.
  sliderWrap.addEventListener('keydown', (e) => {
    const act = S.keyToAction(e.key, { shift: e.shiftKey, ctrl: e.ctrlKey, alt: e.altKey, meta: e.metaKey });
    if (act) { e.preventDefault(); e.stopPropagation(); runAction(act); }
    else if (e.key === 'Home' || e.key === 'End') {
      e.preventDefault(); e.stopPropagation(); patchVol(e.key === 'Home' ? 0 : maxVol());
    }
  });

  // Text input
  ['keydown', 'keyup', 'keypress'].forEach((ev) => input.addEventListener(ev, (e) => e.stopPropagation()));
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); input.blur(); } });
  input.addEventListener('blur', () => {
    const v = S.clampVolume(input.value, maxVol());
    if (v === null) syncUI(); else patchVol(v);
  });
  input.addEventListener('wheel', (e) => {
    e.preventDefault(); e.stopPropagation();
    runAction(e.deltaY < 0 ? 'volUp' : 'volDown');
  }, { passive: false });

  return wrap;
}

function runAction(action, value) {
  return handle({ type: 'ACTION', action, value }, { id: chrome.runtime.id });
}

function syncUI() {
  const input  = document.getElementById('rl-vol-input');
  const fill   = document.getElementById('rl-vol-fill');
  const thumb  = document.getElementById('rl-vol-thumb');
  const slider = document.getElementById('rl-vol-slider-wrap');
  if (!input) return;

  const shown = S.effective(state);
  const max   = settings.boost ? 300 : 100;
  const ok    = applied.rev === state.rev;
  const bad   = ok && applied.status === 'failed';

  if (document.activeElement !== input) input.value = shown;
  input.max = String(max);
  input.className = [
    state.muted || shown === 0 ? 'muted' : shown > 100 ? 'boosted' : '',
    !ok ? 'pending' : '', bad ? 'failed' : ''
  ].join(' ').trim();
  input.title = bad
    ? `Could not apply ${shown}% (${applied.reason}) — playing at ${applied.pct}%`
    : state.muted ? 'Muted — click the speaker to unmute' : 'Volume — type + Enter, or scroll wheel';

  if (slider) {
    slider.setAttribute('aria-valuemax', String(max));
    slider.setAttribute('aria-valuenow', String(shown));
    slider.setAttribute('aria-valuetext', state.muted ? 'Muted' : shown + '%');
  }
  const tickEl = document.getElementById('rl-vol-tick');
  if (tickEl) tickEl.style.display = settings.boost ? 'block' : 'none';
  if (fill) fill.classList.toggle('boosted', shown > 100);
  if (fill && thumb) {
    const frac = Math.min(shown, max) / max;
    fill.style.width = (frac * 100) + '%';
    thumb.style.left = (frac * 100) + '%';
  }
}

// =============================================
//  MOUNT (+ SPA re-injection)
// =============================================

function tryInjectUI() {
  if (document.getElementById(WIDGET_ID)) return true;
  const volumeArea = document.querySelector('.ytp-volume-area');
  if (!volumeArea) return false;
  injectStyle();
  volumeArea.appendChild(buildWidget());
  syncUI();
  return true;
}

// Observe only while the widget is missing; disconnect the moment it is back.
let observer = null;

function watchForPlayer() {
  if (observer || tryInjectUI()) return;
  observer = new MutationObserver(() => {
    if (tryInjectUI()) { observer.disconnect(); observer = null; }
  });
  observer.observe(document.body, { childList: true, subtree: true });
}

document.addEventListener('yt-navigate-finish', () => {
  setTimeout(reApply, 300);
  watchForPlayer();
});
// A replaced <video> (or first load) announces itself with loadstart; re-route + re-apply.
document.addEventListener('loadstart', (e) => { if (e.target instanceof HTMLMediaElement) reApply(); }, true);

// Autoplay policy: if the graph was blocked, retry on the first real user gesture.
function onGesture() {
  if (applied.status === 'ok' || !/gesture|ctx-/.test(applied.reason || '')) return;
  mgr.recover().then(reApply);
}
document.addEventListener('pointerdown', onGesture, true);
document.addEventListener('keydown', onGesture, true);

// =============================================
//  NATIVE YOUTUBE CONTROLS -> our state
//  The speaker button / "m" key toggle <video>.muted; fold that into our single mute flag.
// =============================================

document.addEventListener('click', (e) => {
  if (e.target.closest && e.target.closest('.ytp-mute-button')) {
    e.preventDefault(); e.stopPropagation();
    runAction('toggleMute');
  }
}, true);

let lastNativeMuted = false;
document.addEventListener('volumechange', (e) => {
  const v = e.target;
  if (!(v instanceof HTMLMediaElement)) return;
  const changed = v.muted !== lastNativeMuted;
  lastNativeMuted = v.muted;
  if (!changed || Date.now() < guardUntil || !v.muted) return;
  // YouTube muted its element (e.g. the "m" key): toggle our mute flag instead, keep element unmuted.
  guardUntil = Date.now() + 150;
  runAction('toggleMute');
  v.muted = false;
  lastNativeMuted = false;
}, true);

// =============================================
//  IN-PAGE KEYBOARD (arrow keys, active after clicking the player — same as YouTube)
// =============================================

let playerFocused = false;
document.addEventListener('mousedown', (e) => { playerFocused = !!(e.target.closest && e.target.closest('#movie_player')); }, true);

document.addEventListener('keydown', (e) => {
  if (!playerFocused || e.defaultPrevented) return;
  const act = S.keyToAction(e.key, { shift: e.shiftKey, ctrl: e.ctrlKey, alt: e.altKey, meta: e.metaKey });
  if (!act || S.isEditable(document.activeElement)) return;
  e.preventDefault();
  runAction(act);
}, true);

// =============================================
//  INIT
// =============================================

function mirrorDefault() {
  // Synchronous seed for injected.js in brand-new tabs. NOT a live value (see CLAUDE.md).
  try { localStorage.setItem('rl_volume', String(Math.min(settings.defaultVolume, 100))); } catch (_) {}
}

ready = (async () => {
  settings = await ST.load();
  if (!hadSession) {
    // Brand-new tab: start from the global new-tab default (never another live tab's volume).
    state = S.defaultTabState(settings.boost ? settings.defaultVolume : Math.min(settings.defaultVolume, 100));
    persist();
  } else if (!settings.boost && state.volume > 100) {
    state = { ...state, volume: 100, lastNonZero: 100, rev: state.rev + 1 };
    persist();
  }
  mirrorDefault();
})();

ready.then(() => { watchForPlayer(); reApply(); });

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local' || !changes[ST.SETTINGS_KEY]) return;
  const prevBoost = settings.boost;
  settings = ST.sanitizeSettings(changes[ST.SETTINGS_KEY].newValue);
  mirrorDefault();
  if (prevBoost && !settings.boost && state.volume > 100) commit({ volume: 100 });
  else { syncUI(); broadcast(); }
});

})();
