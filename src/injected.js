// RELAXLIKES Volume+ — injected.js
// Runs in the MAIN JavaScript world at document_start, i.e. BEFORE YouTube's code.
// No chrome.* APIs here — it talks to content.js through DOM CustomEvents, which the page
// can also dispatch, so every payload is validated and can only ever set THIS page's native volume.
//
// Early bootstrap (synchronous, per tab):
//   1. sessionStorage["rl_tab"]  — this tab's own state (survives reload, copied on duplicate)
//   2. localStorage["rl_volume"] — new-tab default mirror written by content.js (NOT a live value)
//   3. YouTube's own yt-player-volume (first run only), else 100
// Only the native 0–100% part is handled here; >100% is Web Audio gain in content.js.

(function () {
  'use strict';

  const LOG = () => {}; // swap for console.log.bind(console, '[RL injected]') when debugging

  const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
  const clampNative = (v) => Math.max(0, Math.min(100, Math.round(v)));

  let nativePct = 100;   // what the <video> element must be at (0–100)
  let allowSet  = false;

  try {
    const tab = sessionStorage.getItem('rl_tab');
    const o = tab && JSON.parse(tab);
    if (o && isNum(o.volume) && o.volume >= 0 && o.volume <= 300) {
      nativePct = clampNative(o.muted === true ? 0 : o.volume);
    } else {
      const def = Number(localStorage.getItem('rl_volume'));
      if (localStorage.getItem('rl_volume') !== null && isNum(def)) {
        nativePct = clampNative(def);
      } else {
        const ytRaw = localStorage.getItem('yt-player-volume');
        if (ytRaw) {
          const inner = JSON.parse(JSON.parse(ytRaw).data);
          if (isNum(inner.volume)) nativePct = clampNative(inner.volume);
        }
      }
    }
  } catch (_) {}
  LOG('nativePct initialised to', nativePct);

  // =============================================
  //  PATCH HTMLMediaElement.prototype.volume
  //  YouTube restoring its own saved volume is replaced by ours.
  // =============================================

  const nativeVolDesc = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'volume');

  Object.defineProperty(HTMLMediaElement.prototype, 'volume', {
    configurable: true,
    enumerable:   nativeVolDesc.enumerable,
    get() { return nativeVolDesc.get.call(this); },
    set(val) {
      nativeVolDesc.set.call(this, allowSet ? val : nativePct / 100);
    }
  });

  // First audio of a tab must already be at this tab's level, before content.js is ready.
  function enforceOn(el) {
    try {
      if (el instanceof HTMLMediaElement && Math.abs(nativeVolDesc.get.call(el) - nativePct / 100) > 0.005) {
        nativeVolDesc.set.call(el, nativePct / 100);
      }
    } catch (_) {}
  }
  for (const ev of ['loadstart', 'play']) {
    document.addEventListener(ev, (e) => enforceOn(e.target), true);
  }

  // =============================================
  //  PATCH Storage.prototype.setItem
  //  Rewrite yt-player-volume so YouTube's own persisted value matches this tab.
  // =============================================

  const origSetItem = Storage.prototype.setItem;

  Storage.prototype.setItem = function (key, value) {
    if (key === 'yt-player-volume' && this === window.localStorage) {
      try {
        const outer = JSON.parse(value);
        const inner = JSON.parse(outer.data);
        inner.volume = nativePct;
        inner.muted  = nativePct === 0;
        outer.data   = JSON.stringify(inner);
        return origSetItem.call(this, key, JSON.stringify(outer));
      } catch (_) {}
    }
    return origSetItem.call(this, key, value);
  };

  // =============================================
  //  APPLY (native part only)
  // =============================================

  function applyNative(pct) {
    nativePct = pct;
    allowSet = true;
    try {
      const player = document.querySelector('#movie_player');
      if (player && typeof player.setVolume === 'function') {
        if (pct > 0 && typeof player.unMute === 'function') player.unMute();
        player.setVolume(pct);
      }
    } finally {
      allowSet = false;
      // Bypass our own patch to land exactly on the target after YouTube's synchronous callbacks.
      const video = document.querySelector('.html5-main-video') || document.querySelector('video');
      if (video) nativeVolDesc.set.call(video, pct / 100);
    }
  }

  // =============================================
  //  EVENT BRIDGE  (validated; the page can forge these, which only affects itself)
  // =============================================

  document.addEventListener('RL_APPLY', (e) => {
    const d = e.detail;
    if (!d || !isNum(d.pct) || d.pct < 0 || d.pct > 100 || !Number.isInteger(d.rev)) return;
    applyNative(Math.round(d.pct));
    const video = document.querySelector('.html5-main-video') || document.querySelector('video');
    document.dispatchEvent(new CustomEvent('RL_APPLIED', {
      detail: { rev: d.rev, pct: video ? Math.round(nativeVolDesc.get.call(video) * 100) : null }
    }));
  });

  document.dispatchEvent(new CustomEvent('RL_INJECTED'));
})();
