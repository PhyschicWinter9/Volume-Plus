// RELAXLIKES Volume+ — content.js
// Isolated world. Handles UI, chrome.storage, Web Audio boost.
// Communicates with injected.js (MAIN world) via CustomEvent.

let audioCtx      = null;
let gainNode      = null;
let sourceNode    = null;
let boostActive   = false;
let currentVolume = 100;
let boostEnabled  = false;

const WIDGET_ID = "rl-vol-widget";
const STYLE_ID  = "rl-vol-style";

// =============================================
//  BRIDGE TO injected.js
// =============================================

function sendSetVolume(pct) {
  document.dispatchEvent(new CustomEvent('RL_SET_VOLUME', {
    detail: { volume: pct }
  }));
}

function sendInitVolume(pct) {
  document.dispatchEvent(new CustomEvent('RL_INIT_VOLUME', {
    detail: { volume: pct }
  }));
}

// =============================================
//  AUDIO BOOST  (>100% only)
// =============================================

function connectBoost() {
  if (boostActive) return true;
  const video = document.querySelector('video');
  if (!video) return false;
  try {
    audioCtx   = new (window.AudioContext || window.webkitAudioContext)();
    gainNode   = audioCtx.createGain();
    sourceNode = audioCtx.createMediaElementSource(video);
    sourceNode.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    boostActive = true;
    return true;
  } catch (e) {
    console.error('[RL Volume+] Boost failed:', e);
    return false;
  }
}

// =============================================
//  CORE VOLUME SETTER
// =============================================

function setVolume(pct) {
  pct = Math.max(0, Math.min(boostEnabled ? 300 : 100, Math.round(pct)));
  currentVolume = pct;

  if (pct <= 100) {
    // Reset gain if boost was active
    if (boostActive && gainNode) {
      gainNode.gain.setTargetAtTime(1.0, audioCtx.currentTime, 0.01);
    }
    sendSetVolume(pct);
  } else {
    // Lock YouTube at 100, amplify with GainNode
    if (connectBoost()) {
      sendSetVolume(100);
      gainNode.gain.setTargetAtTime(pct / 100, audioCtx.currentTime, 0.01);
    } else {
      sendSetVolume(100);
    }
  }

  syncUI(pct);
  chrome.storage.local.set({ rl_volume: pct });
}

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
      width: 52px;
      height: 100%;
      display: flex;
      align-items: center;
      cursor: pointer;
      flex-shrink: 0;
    }

    #rl-vol-track {
      position: relative;
      width: 100%;
      height: 3px;
      background: rgba(255,255,255,0.3);
      border-radius: 99px;
    }

    #rl-vol-fill {
      position: absolute;
      left: 0; top: 0; bottom: 0;
      background: #fff;
      border-radius: 99px;
      pointer-events: none;
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
      transition: opacity 0.1s;
      box-shadow: 0 0 3px rgba(0,0,0,0.5);
    }

    #rl-vol-slider-wrap:hover #rl-vol-thumb  { opacity: 1; }
    #rl-vol-slider-wrap:hover #rl-vol-fill   { background: #f00; }
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

    #rl-vol-input::-webkit-inner-spin-button,
    #rl-vol-input::-webkit-outer-spin-button { -webkit-appearance: none; }

    #rl-vol-input:focus   { border-bottom-color: #e8ff47; color: #e8ff47; }
    #rl-vol-input.boosted { color: #e8ff47; }
    #rl-vol-input.muted   { color: rgba(255,255,255,0.4); }

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

  const track = document.createElement('div'); track.id = 'rl-vol-track';
  const fill  = document.createElement('div'); fill.id  = 'rl-vol-fill';
  const thumb = document.createElement('div'); thumb.id = 'rl-vol-thumb';
  track.appendChild(fill); track.appendChild(thumb);
  sliderWrap.appendChild(track);

  const input = document.createElement('input');
  input.id    = 'rl-vol-input';
  input.type  = 'number';
  input.min   = '0';
  input.max   = boostEnabled ? '300' : '100';
  input.value = currentVolume;
  input.title = 'Volume — type + Enter, or scroll wheel';

  const sym = document.createElement('span');
  sym.className = 'rl-sym';
  sym.textContent = '%';

  wrap.appendChild(sliderWrap);
  wrap.appendChild(input);
  wrap.appendChild(sym);

  // Slider drag — rAF-gated so a fast drag coalesces to at most one
  // setVolume() (and its storage write) per frame instead of one per
  // mousemove pixel.
  let dragging   = false;
  let dragRaf    = null;
  let dragVolume = null;

  function volFromX(clientX) {
    const rect = track.getBoundingClientRect();
    const frac = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    return Math.round(frac * (boostEnabled ? 300 : 100));
  }

  function scheduleDragVolume(v) {
    dragVolume = v;
    if (dragRaf) return;
    dragRaf = requestAnimationFrame(() => {
      dragRaf = null;
      setVolume(dragVolume);
    });
  }

  sliderWrap.addEventListener('mousedown', e => {
    e.preventDefault(); e.stopPropagation();
    dragging = true; scheduleDragVolume(volFromX(e.clientX));
  });
  window.addEventListener('mousemove',  e => { if (dragging) scheduleDragVolume(volFromX(e.clientX)); });
  window.addEventListener('mouseup',    () => { dragging = false; });

  // Text input
  ['keydown','keyup','keypress'].forEach(ev =>
    input.addEventListener(ev, e => e.stopPropagation())
  );
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
  });
  input.addEventListener('blur', () => {
    let val = parseInt(input.value);
    if (isNaN(val)) val = currentVolume;
    setVolume(val);
  });
  input.addEventListener('wheel', e => {
    e.preventDefault(); e.stopPropagation();
    setVolume(currentVolume + (e.deltaY < 0 ? 5 : -5));
  }, { passive: false });

  return wrap;
}

function syncUI(pct) {
  const input = document.getElementById('rl-vol-input');
  const fill  = document.getElementById('rl-vol-fill');
  const thumb = document.getElementById('rl-vol-thumb');

  if (input && document.activeElement !== input) {
    input.value     = pct;
    input.max       = boostEnabled ? '300' : '100';
    input.className = pct > 100 ? 'boosted' : pct === 0 ? 'muted' : '';
  }

  if (fill && thumb) {
    const max  = boostEnabled ? 300 : 100;
    const frac = Math.min(pct, max) / max;
    fill.style.width = (frac * 100) + '%';
    thumb.style.left = (frac * 100) + '%';
  }
}

// =============================================
//  MOUNT
// =============================================

function tryInjectUI() {
  if (document.getElementById(WIDGET_ID)) return true;
  const volumeArea = document.querySelector('.ytp-volume-area');
  if (!volumeArea) return false;
  injectStyle();
  volumeArea.appendChild(buildWidget());
  syncUI(currentVolume);
  return true;
}

// Watching the whole document for the extension's entire lifetime is
// expensive — YouTube mutates the DOM constantly. Only observe while the
// widget is actually missing (initial player load, or right after an SPA
// navigation that rebuilt the player controls), and disconnect the moment
// it's back.
let observer = null;

function watchForPlayer() {
  if (observer || tryInjectUI()) return;
  observer = new MutationObserver(() => {
    if (tryInjectUI()) {
      observer.disconnect();
      observer = null;
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
}

watchForPlayer();

document.addEventListener('yt-navigate-finish', () => {
  setTimeout(() => setVolume(currentVolume), 300);
  watchForPlayer();
});

// =============================================
//  GLOBAL ARROW KEY VOLUME (Up +5 / Down -5)
//  Active only after clicking inside the player (same as YouTube).
// =============================================

let playerFocused = false;

document.addEventListener('mousedown', e => {
  playerFocused = !!e.target.closest('#movie_player');
}, true);

document.addEventListener('keydown', e => {
  if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
  if (!playerFocused) return;
  const tag = document.activeElement && document.activeElement.tagName.toLowerCase();
  if (tag === 'input' || tag === 'textarea' || (document.activeElement && document.activeElement.isContentEditable)) return;
  e.preventDefault();
  setVolume(currentVolume + (e.key === 'ArrowUp' ? 5 : -5));
}, true);

// =============================================
//  INIT — restore saved settings
// =============================================

chrome.storage.local.get(['rl_volume', 'rl_boost'], data => {
  boostEnabled  = !!data.rl_boost;
  currentVolume = data.rl_volume ?? 100;

  // Tell injected.js immediately (patches localStorage before YouTube reads it)
  sendInitVolume(currentVolume);

  // Wait for player then apply properly
  const apply = () => {
    const player = document.querySelector('#movie_player');
    if (player && typeof player.setVolume === 'function') {
      setVolume(currentVolume);
    } else {
      setTimeout(apply, 400);
    }
  };
  apply();
});

// =============================================
//  POPUP BRIDGE
// =============================================

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === 'SET_VOLUME') {
    setVolume(msg.volume);
    sendResponse({ ok: true, volume: currentVolume });
  }
  if (msg.type === 'GET_VOLUME') {
    sendResponse({ volume: currentVolume, boost: boostEnabled });
  }
  if (msg.type === 'SET_BOOST') {
    boostEnabled = msg.enabled;
    chrome.storage.local.set({ rl_boost: boostEnabled });
    if (!boostEnabled && currentVolume > 100) setVolume(100);
    syncUI(currentVolume);
    sendResponse({ ok: true });
  }
  return true;
});