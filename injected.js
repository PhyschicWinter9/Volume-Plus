// RELAXLIKES Volume+ — injected.js
// Runs in the MAIN JavaScript world at document_start.
// This means it runs BEFORE YouTube's code and patches live in YouTube's context.
// No chrome.* APIs available here — communicates with content.js via CustomEvent.

(function () {
  'use strict';

  // =============================================
  //  INIT currentVolume BEFORE ANYTHING RUNS
  //
  //  Priority order:
  //  1. Our own 'rl_volume' localStorage key  (set by us on every volume change)
  //  2. YouTube's 'yt-player-volume' key      (fallback on first-ever install)
  //  3. Default 100
  //
  //  This is the critical fix: by reading our value HERE, the prototype
  //  patch below already knows the correct volume before YouTube's code
  //  tries to restore its saved value.
  // =============================================

  let currentVolume = 100;
  let allowSet      = false;

  try {
    const rlRaw = localStorage.getItem('rl_volume');
    if (rlRaw !== null) {
      currentVolume = Number(rlRaw);
    } else {
      // First install — read YouTube's own saved volume as the starting point
      const ytRaw = localStorage.getItem('yt-player-volume');
      if (ytRaw) {
        const inner = JSON.parse(JSON.parse(ytRaw).data);
        if (typeof inner.volume === 'number') currentVolume = inner.volume;
      }
    }
  } catch (_) {}

  // =============================================
  //  PATCH HTMLMediaElement.prototype.volume
  // =============================================

  const nativeVolDesc = Object.getOwnPropertyDescriptor(
    HTMLMediaElement.prototype, 'volume'
  );

  Object.defineProperty(HTMLMediaElement.prototype, 'volume', {
    configurable: true,
    enumerable:   true,
    get() { return nativeVolDesc.get.call(this); },
    set(val) {
      if (allowSet) {
        nativeVolDesc.set.call(this, val);
      } else {
        // YouTube trying to restore — enforce our value instead
        const ours = Math.min(currentVolume, 100) / 100;
        nativeVolDesc.set.call(this, ours);
      }
    }
  });

  // =============================================
  //  PATCH Storage.prototype.setItem
  //  Rewrite yt-player-volume so future restores load our value
  // =============================================

  const origSetItem = Storage.prototype.setItem;

  Storage.prototype.setItem = function (key, value) {
    if (key === 'yt-player-volume') {
      try {
        const outer = JSON.parse(value);
        const inner = JSON.parse(outer.data);
        inner.volume = Math.min(currentVolume, 100);
        inner.muted  = currentVolume === 0;
        outer.data   = JSON.stringify(inner);
        origSetItem.call(this, key, JSON.stringify(outer));
        return;
      } catch (_) {}
    }
    origSetItem.call(this, key, value);
  };

  // =============================================
  //  HELPERS
  // =============================================

  function rewriteLocalStorage(pct) {
    try {
      const raw = localStorage.getItem('yt-player-volume');
      if (!raw) return;
      const outer = JSON.parse(raw);
      const inner = JSON.parse(outer.data);
      inner.volume = Math.min(pct, 100);
      inner.muted  = pct === 0;
      outer.data   = JSON.stringify(inner);
      origSetItem.call(localStorage, 'yt-player-volume', JSON.stringify(outer));
    } catch (_) {}
  }

  function persistVolume(pct) {
    // Mirror to localStorage so injected.js can read it at next document_start
    try { origSetItem.call(localStorage, 'rl_volume', String(pct)); } catch (_) {}
    rewriteLocalStorage(pct);
  }

  // =============================================
  //  APPLY VOLUME
  // =============================================

  function applyVolume(pct) {
    currentVolume = pct;
    persistVolume(pct);

    const target = Math.min(pct, 100) / 100;
    allowSet = true;
    try {
      const player = document.querySelector('#movie_player');
      if (player && typeof player.setVolume === 'function') {
        if (pct > 0 && typeof player.unMute === 'function') player.unMute();
        player.setVolume(Math.min(pct, 100));
      }
    } finally {
      allowSet = false;
      // Bypass our own patch to force the correct level after whatever
      // YouTube's synchronous callbacks may have written during allowSet.
      const video = document.querySelector('video');
      if (video) nativeVolDesc.set.call(video, target);
    }
  }

  // =============================================
  //  EVENT BRIDGE
  // =============================================

  document.addEventListener('RL_SET_VOLUME', (e) => {
    applyVolume(e.detail.volume);
    document.dispatchEvent(new CustomEvent('RL_VOLUME_APPLIED', {
      detail: { volume: e.detail.volume }
    }));
  });

  document.addEventListener('RL_INIT_VOLUME', (e) => {
    currentVolume = e.detail.volume;
    persistVolume(currentVolume);
  });

  document.dispatchEvent(new CustomEvent('RL_INJECTED'));

})();