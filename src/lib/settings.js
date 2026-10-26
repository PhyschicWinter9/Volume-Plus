// RELAXLIKES Volume+ — lib/settings.js
// Global settings (chrome.storage.local `rl_settings`), presets and legacy migration.
// Pure functions + two tiny storage wrappers. -> globalThis.RL.settings

(function (g) {
  'use strict';

  const SETTINGS_KEY = 'rl_settings';
  const SCHEMA = 2;           // v1 = legacy loose keys (rl_volume / rl_boost / rl_last_nonzero)
  const MAX_PRESETS = 12;
  const NAME_MAX = 16;
  const DEFAULT_STEP = 5;

  const DEFAULT_PRESETS = [
    { id: 'p25',  name: 'Quiet',   volume: 25 },
    { id: 'p50',  name: 'Low',     volume: 50 },
    { id: 'p100', name: 'Normal',  volume: 100 },
    { id: 'p150', name: 'Boost',   volume: 150 },
    { id: 'p200', name: 'Loud',    volume: 200 }
  ];

  const V = () => g.RL.state;
  const clonePresets = (l) => l.map((p) => ({ ...p }));

  function cleanName(n) {
    if (typeof n !== 'string') return null;
    // strip control chars, collapse whitespace
    const s = n.replace(/[\u0000-\u001f\u007f<>]/g, '').replace(/\s+/g, ' ').trim();
    return s.length >= 1 && s.length <= NAME_MAX ? s : null;
  }

  const nameTaken = (list, name, exceptId) =>
    list.some((p) => p.id !== exceptId && p.name.toLowerCase() === name.toLowerCase());

  function newId(list) {
    let id;
    do { id = 'u' + Math.random().toString(36).slice(2, 8); } while (list.some((p) => p.id === id));
    return id;
  }

  // Corrupt / hostile stored list -> valid list. Drops bad entries and duplicate ids/names;
  // if nothing valid survives, returns the defaults.
  function sanitizePresets(raw) {
    if (!Array.isArray(raw)) return clonePresets(DEFAULT_PRESETS);
    const out = [];
    for (const p of raw) {
      if (!p || typeof p !== 'object') continue;
      const name = cleanName(p.name);
      const volume = V().validVolume(p.volume);
      if (!name || volume === null) continue;
      const id = typeof p.id === 'string' && /^[a-z0-9]{1,12}$/i.test(p.id) ? p.id : null;
      if (!id || out.some((q) => q.id === id) || nameTaken(out, name)) continue;
      out.push({ id, name, volume });
      if (out.length >= MAX_PRESETS) break;
    }
    return out.length ? out : clonePresets(DEFAULT_PRESETS);
  }

  // ---- preset CRUD: all return {ok:true, presets} or {ok:false, error}; input is never mutated ----
  function addPreset(list, name, volume) {
    const n = cleanName(name), v = V().validVolume(volume);
    if (!n) return { ok: false, error: 'bad-name' };
    if (v === null) return { ok: false, error: 'bad-volume' };
    if (list.length >= MAX_PRESETS) return { ok: false, error: 'too-many' };
    if (nameTaken(list, n)) return { ok: false, error: 'duplicate-name' };
    return { ok: true, presets: [...clonePresets(list), { id: newId(list), name: n, volume: v }] };
  }

  function editPreset(list, id, { name, volume }) {
    const i = list.findIndex((p) => p.id === id);
    if (i < 0) return { ok: false, error: 'not-found' };
    const next = clonePresets(list);
    if (name !== undefined) {
      const n = cleanName(name);
      if (!n) return { ok: false, error: 'bad-name' };
      if (nameTaken(list, n, id)) return { ok: false, error: 'duplicate-name' };
      next[i].name = n;
    }
    if (volume !== undefined) {
      const v = V().validVolume(volume);
      if (v === null) return { ok: false, error: 'bad-volume' };
      next[i].volume = v;
    }
    return { ok: true, presets: next };
  }

  function removePreset(list, id) {
    if (!list.some((p) => p.id === id)) return { ok: false, error: 'not-found' };
    return { ok: true, presets: clonePresets(list.filter((p) => p.id !== id)) };
  }

  function movePreset(list, id, delta) {
    const i = list.findIndex((p) => p.id === id);
    const j = i + delta;
    if (i < 0) return { ok: false, error: 'not-found' };
    if (j < 0 || j >= list.length) return { ok: true, presets: clonePresets(list) };
    const next = clonePresets(list);
    [next[i], next[j]] = [next[j], next[i]];
    return { ok: true, presets: next };
  }

  const restorePresets = () => clonePresets(DEFAULT_PRESETS);

  // ---- settings object ----
  function defaultSettings() {
    return {
      v: SCHEMA,
      boost: false,              // global capability: allow > 100%
      step: DEFAULT_STEP,        // keyboard / shortcut step
      defaultVolume: 100,        // starting volume for brand-new tabs (never a live tab's volume)
      presets: clonePresets(DEFAULT_PRESETS)
    };
  }

  function sanitizeSettings(raw) {
    const d = defaultSettings();
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return d;
    d.boost = raw.boost === true;
    if (Number.isInteger(raw.step) && raw.step >= 1 && raw.step <= 25) d.step = raw.step;
    const dv = V().validVolume(raw.defaultVolume);
    if (dv !== null) d.defaultVolume = dv;
    d.presets = sanitizePresets(raw.presets);
    return d;
  }

  // Idempotent v1 -> v2 migration. `stored` = whole chrome.storage.local contents.
  // Precedence for the new-tab default: legacy chrome.storage rl_volume (what the popup/content
  // wrote) is used only as the *default for new tabs*; it is NOT copied onto existing tabs.
  // Legacy keys are left in place so a downgrade keeps working.
  function migrate(stored) {
    stored = stored && typeof stored === 'object' ? stored : {};
    if (stored[SETTINGS_KEY] && stored[SETTINGS_KEY].v === SCHEMA) {
      return { settings: sanitizeSettings(stored[SETTINGS_KEY]), changed: false };
    }
    const s = sanitizeSettings(stored[SETTINGS_KEY]); // a half-written/corrupt v2 still yields defaults
    if (!stored[SETTINGS_KEY]) {
      s.boost = stored.rl_boost === true;
      const lv = V().validVolume(stored.rl_volume);
      if (lv !== null) s.defaultVolume = s.boost ? lv : Math.min(lv, 100);
    }
    s.v = SCHEMA;
    return { settings: s, changed: true };
  }

  // ---- storage wrappers (extension pages and content scripts only) ----
  async function load() {
    try {
      const stored = await chrome.storage.local.get(null);
      const { settings, changed } = migrate(stored);
      if (changed) await chrome.storage.local.set({ [SETTINGS_KEY]: settings });
      return settings;
    } catch (_) {
      return defaultSettings(); // storage failure: run on defaults, never crash the player
    }
  }
  async function save(settings) {
    const clean = sanitizeSettings(settings);
    await chrome.storage.local.set({ [SETTINGS_KEY]: clean });
    return clean;
  }

  g.RL = g.RL || {};
  g.RL.settings = {
    SETTINGS_KEY, SCHEMA, MAX_PRESETS, NAME_MAX, DEFAULT_PRESETS,
    cleanName, sanitizePresets, addPreset, editPreset, removePreset, movePreset, restorePresets,
    defaultSettings, sanitizeSettings, migrate, load, save
  };
})(globalThis);
