// RELAXLIKES Volume+ — lib/state.js
// Pure per-tab state logic. No chrome.* / DOM access except isEditable(el).
// Loaded as a classic script (content script, popup, tests) -> globalThis.RL.state

(function (g) {
  'use strict';

  const MAX_VOLUME = 300;
  const NATIVE_MAX = 100;
  const EQ_RANGE   = 12; // dB, +/-
  const SESSION_KEY = 'rl_tab';

  // Bass / Mid / Treble gains in dB. "custom" keeps whatever the user dialled in.
  const EQ_PROFILES = {
    flat:   { bass: 0,  mid: 0, treble: 0 },
    bass:   { bass: 6,  mid: 0, treble: 0 },
    vocal:  { bass: -2, mid: 4, treble: 1 },
    treble: { bass: 0,  mid: 0, treble: 6 },
    custom: null
  };
  const EQ_PROFILE_LABELS = {
    flat: 'Flat', bass: 'Bass Boost', vocal: 'Vocal', treble: 'Treble Boost', custom: 'Custom'
  };

  const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

  // Strict: only a finite number inside 0..300 is a valid volume. Used for messages.
  function validVolume(v) {
    return isNum(v) && v >= 0 && v <= MAX_VOLUME ? Math.round(v) : null;
  }
  // Lenient: UI input (strings allowed, out-of-range clamped). Non-numeric -> null.
  function clampVolume(v, max = MAX_VOLUME) {
    if (typeof v === 'string' && v.trim() !== '') v = Number(v);
    if (!isNum(v)) return null;
    return Math.max(0, Math.min(max, Math.round(v)));
  }
  function validDb(v) {
    return isNum(v) && v >= -EQ_RANGE && v <= EQ_RANGE ? Math.round(v * 2) / 2 : null;
  }

  function defaultTabState(volume = 100) {
    const v = validVolume(volume) ?? 100;
    return {
      v: 1,
      volume: v,
      muted: false,
      lastNonZero: v > 0 ? v : 100,
      limiter: true,
      eq: { enabled: false, profile: 'flat', bass: 0, mid: 0, treble: 0 },
      rev: 0
    };
  }

  // Tolerant loader for sessionStorage JSON: every field validated independently,
  // anything wrong falls back to its default. Never throws.
  function sanitizeTabState(raw, fallbackVolume = 100) {
    const d = defaultTabState(fallbackVolume);
    let o = raw;
    if (typeof raw === 'string') { try { o = JSON.parse(raw); } catch (_) { return d; } }
    if (!o || typeof o !== 'object' || Array.isArray(o)) return d;
    const vol = validVolume(o.volume);
    if (vol !== null) d.volume = vol;
    d.muted = o.muted === true;
    const lnz = validVolume(o.lastNonZero);
    d.lastNonZero = lnz ? lnz : (d.volume > 0 ? d.volume : 100);
    if (typeof o.limiter === 'boolean') d.limiter = o.limiter;
    if (o.eq && typeof o.eq === 'object') {
      d.eq.enabled = o.eq.enabled === true;
      d.eq.profile = Object.prototype.hasOwnProperty.call(EQ_PROFILES, o.eq.profile) ? o.eq.profile : 'custom';
      for (const b of ['bass', 'mid', 'treble']) d.eq[b] = validDb(o.eq[b]) ?? 0;
    }
    d.rev = isNum(o.rev) && o.rev >= 0 ? Math.floor(o.rev) : 0;
    return d;
  }

  const effective = (s) => (s.muted ? 0 : s.volume);
  const nativePct = (s) => Math.min(effective(s), NATIVE_MAX);
  const gainFor   = (s) => (effective(s) > NATIVE_MAX ? effective(s) / 100 : 1);
  // The Web Audio graph is only needed above 100% or when EQ colours the sound.
  const needsGraph = (s) => effective(s) > NATIVE_MAX || s.eq.enabled;

  const PATCH_KEYS = ['volume', 'muted', 'limiter', 'eq'];

  // Validate + apply a patch. Returns {ok:true,state,changed} or {ok:false,error}.
  // opts.boost = whether >100% is currently permitted (global setting).
  function reduce(state, patch, opts = {}) {
    if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return { ok: false, error: 'bad-patch' };
    for (const k of Object.keys(patch)) if (!PATCH_KEYS.includes(k)) return { ok: false, error: 'unknown-key:' + k };

    const next = { ...state, eq: { ...state.eq } };
    const max = opts.boost ? MAX_VOLUME : NATIVE_MAX;

    if ('volume' in patch) {
      const v = validVolume(patch.volume);
      if (v === null) return { ok: false, error: 'bad-volume' };
      next.volume = Math.min(v, max);
      // Raising the volume implicitly unmutes; lowering to 0 is a plain value, not a mute.
      if (!('muted' in patch)) next.muted = false;
    }
    if ('muted' in patch) {
      if (typeof patch.muted !== 'boolean') return { ok: false, error: 'bad-muted' };
      next.muted = patch.muted;
    }
    if ('limiter' in patch) {
      if (typeof patch.limiter !== 'boolean') return { ok: false, error: 'bad-limiter' };
      next.limiter = patch.limiter;
    }
    if ('eq' in patch) {
      const e = patch.eq;
      if (!e || typeof e !== 'object' || Array.isArray(e)) return { ok: false, error: 'bad-eq' };
      for (const k of Object.keys(e)) {
        if (!['enabled', 'profile', 'bass', 'mid', 'treble'].includes(k)) return { ok: false, error: 'bad-eq-key' };
      }
      if ('enabled' in e) {
        if (typeof e.enabled !== 'boolean') return { ok: false, error: 'bad-eq-enabled' };
        next.eq.enabled = e.enabled;
      }
      if ('profile' in e) {
        if (!Object.prototype.hasOwnProperty.call(EQ_PROFILES, e.profile)) return { ok: false, error: 'bad-eq-profile' };
        next.eq.profile = e.profile;
        if (EQ_PROFILES[e.profile]) Object.assign(next.eq, EQ_PROFILES[e.profile]);
      }
      let manual = false;
      for (const b of ['bass', 'mid', 'treble']) {
        if (b in e) {
          const db = validDb(e[b]);
          if (db === null) return { ok: false, error: 'bad-eq-' + b };
          next.eq[b] = db;
          manual = true;
        }
      }
      // Hand-tuning a band leaves the named profile; matching one again re-labels it.
      if (manual && !('profile' in e)) next.eq.profile = matchProfile(next.eq);
    }

    if (next.volume > 0) next.lastNonZero = next.volume;
    if (next.muted && next.lastNonZero === 0) next.lastNonZero = 100;
    const changed = JSON.stringify(next) !== JSON.stringify(state);
    if (changed) next.rev = state.rev + 1;
    return { ok: true, state: next, changed };
  }

  function matchProfile(eq) {
    for (const [name, p] of Object.entries(EQ_PROFILES)) {
      if (p && p.bass === eq.bass && p.mid === eq.mid && p.treble === eq.treble) return name;
    }
    return 'custom';
  }

  // Map a high-level action (shortcut / key / preset) to a patch. Returns null if unknown/invalid.
  function actionToPatch(state, action, ctx = {}) {
    const step = Number.isInteger(ctx.step) && ctx.step >= 1 && ctx.step <= 25 ? ctx.step : 5;
    const cur = effective(state);
    const max = ctx.boost ? MAX_VOLUME : NATIVE_MAX;
    switch (action) {
      case 'volUp':   return { volume: Math.min(max, cur + step) };
      case 'volDown': return { volume: Math.max(0, cur - step) };
      case 'fineUp':   return { volume: Math.min(max, cur + 1) };
      case 'fineDown': return { volume: Math.max(0, cur - 1) };
      case 'toggleMute':
        if (state.muted) return { muted: false };
        // volume 0 and not muted: "unmute" means go back to the last audible level
        return state.volume === 0 ? { volume: Math.min(max, state.lastNonZero) } : { muted: true };
      case 'reset':   return { volume: 100 };
      case 'preset': {
        const v = validVolume(ctx.value);
        return v === null ? null : { volume: v };
      }
      default: return null;
    }
  }

  // Popup-side ordering guard: accept an update from a tab only if it is not older than what
  // we already show. New document (epoch) always wins; within one, higher rev wins, and at an
  // equal rev only an equal-or-newer acknowledgement may replace the current one.
  function acceptUpdate(cur, msg) {
    if (!msg || typeof msg.epoch !== 'string' || !msg.state || !isNum(msg.state.rev)) return false;
    if (!cur || cur.epoch !== msg.epoch) return true;
    if (msg.state.rev !== cur.state.rev) return msg.state.rev > cur.state.rev;
    return ((msg.applied && msg.applied.rev) ?? -1) >= ((cur.applied && cur.applied.rev) ?? -1);
  }

  // Browser `commands` id -> action (+ preset slot). Presets are 1-based slots in the user's list.
  function commandToAction(cmd, presets) {
    const fixed = { 'volume-up': 'volUp', 'volume-down': 'volDown', 'toggle-mute': 'toggleMute', 'reset-volume': 'reset' };
    if (fixed[cmd]) return { action: fixed[cmd] };
    const m = /^preset-([1-4])$/.exec(cmd);
    const p = m && Array.isArray(presets) ? presets[Number(m[1]) - 1] : null;
    return p ? { action: 'preset', value: p.volume } : null;
  }

  // Pure keyboard mapping used by the in-page handler (testable without a DOM event).
  function keyToAction(key, { shift = false, ctrl = false, alt = false, meta = false } = {}) {
    if (ctrl || alt || meta) return null; // leave browser/YouTube combos alone
    if (key === 'ArrowUp')   return shift ? 'fineUp'   : 'volUp';
    if (key === 'ArrowDown') return shift ? 'fineDown' : 'volDown';
    return null;
  }

  function isEditable(el) {
    if (!el || !el.tagName) return false;
    const t = el.tagName.toLowerCase();
    if (t === 'input' || t === 'textarea' || t === 'select') return true;
    if (el.isContentEditable) return true;
    const role = el.getAttribute && el.getAttribute('role');
    return role === 'textbox' || role === 'searchbox' || role === 'combobox';
  }

  // Which tab should popup / browser shortcuts control? The focused tab if it is YouTube,
  // otherwise the audible YouTube tab, otherwise the first one. Returns {tab, background} | null.
  function pickTarget(activeTab, ytTabs) {
    const isYt = (t) => t && typeof t.url === 'string' && /^https:\/\/www\.youtube\.com\//.test(t.url);
    if (isYt(activeTab)) return { tab: activeTab, background: false };
    const list = (ytTabs || []).filter(isYt);
    if (!list.length) return null;
    return { tab: list.find((t) => t.audible) || list[0], background: true };
  }

  g.RL = g.RL || {};
  g.RL.state = {
    MAX_VOLUME, NATIVE_MAX, EQ_RANGE, SESSION_KEY, EQ_PROFILES, EQ_PROFILE_LABELS,
    validVolume, clampVolume, validDb, defaultTabState, sanitizeTabState,
    effective, nativePct, gainFor, needsGraph, reduce, matchProfile,
    actionToPatch, commandToAction, acceptUpdate, keyToAction, isEditable, pickTarget
  };
})(globalThis);
