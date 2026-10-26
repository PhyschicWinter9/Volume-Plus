import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { RL } from './helpers.js';
const ST = RL.settings;

describe('presets', () => {
  const base = ST.restorePresets();

  it('restore defaults gives the five defaults', () => {
    expect(base.map((p) => p.volume)).toEqual([25, 50, 100, 150, 200]);
  });
  it('add validates name, volume, duplicates and the cap', () => {
    const ok = ST.addPreset(base, '  Movie  ', 175);
    expect(ok.ok).toBe(true);
    expect(ok.presets.at(-1)).toMatchObject({ name: 'Movie', volume: 175 });
    expect(base).toHaveLength(5); // input untouched
    expect(ST.addPreset(base, '', 50).error).toBe('bad-name');
    expect(ST.addPreset(base, 'x'.repeat(17), 50).error).toBe('bad-name');
    expect(ST.addPreset(base, 'ok', 301).error).toBe('bad-volume');
    expect(ST.addPreset(base, 'ok', NaN).error).toBe('bad-volume');
    expect(ST.addPreset(base, 'QUIET', 10).error).toBe('duplicate-name');
    let l = base;
    while (l.length < ST.MAX_PRESETS) l = ST.addPreset(l, 'p' + l.length, 10).presets;
    expect(ST.addPreset(l, 'extra', 10).error).toBe('too-many');
  });
  it('strips control characters and angle brackets from names', () => {
    expect(ST.cleanName('a\u0000b<i>')).toBe('abi');
    expect(ST.cleanName(42)).toBeNull();
  });
  it('edit renames / revolumes, rejects dupes, unknown ids and bad values', () => {
    const id = base[0].id;
    expect(ST.editPreset(base, id, { name: 'Night' }).presets[0].name).toBe('Night');
    expect(ST.editPreset(base, id, { volume: 30 }).presets[0].volume).toBe(30);
    expect(ST.editPreset(base, id, { name: 'Low' }).error).toBe('duplicate-name');
    expect(ST.editPreset(base, id, { name: base[0].name }).ok).toBe(true); // renaming to itself is fine
    expect(ST.editPreset(base, id, { volume: -1 }).error).toBe('bad-volume');
    expect(ST.editPreset(base, id, { name: '' }).error).toBe('bad-name');
    expect(ST.editPreset(base, 'nope', { name: 'x' }).error).toBe('not-found');
  });
  it('remove and reorder', () => {
    const [a, b] = base;
    expect(ST.removePreset(base, a.id).presets).toHaveLength(4);
    expect(ST.removePreset(base, 'nope').error).toBe('not-found');
    expect(ST.movePreset(base, a.id, 1).presets.slice(0, 2).map((p) => p.id)).toEqual([b.id, a.id]);
    expect(ST.movePreset(base, a.id, -1).presets[0].id).toBe(a.id); // at the edge: no-op
    expect(ST.movePreset(base, 'nope', 1).error).toBe('not-found');
  });
  it('sanitize drops corrupt entries, duplicate ids/names; empty -> defaults', () => {
    const raw = [
      { id: 'a1', name: 'Good', volume: 40 },
      { id: 'a1', name: 'SameId', volume: 40 },
      { id: 'a2', name: 'good', volume: 41 },
      { id: 'a3', name: 'Bad', volume: 999 },
      { id: 'a4', name: 'NaN', volume: NaN },
      { id: '../x', name: 'BadId', volume: 10 },
      null, 7, 'str', { name: 'NoId', volume: 5 }
    ];
    expect(ST.sanitizePresets(raw)).toEqual([{ id: 'a1', name: 'Good', volume: 40 }]);
    expect(ST.sanitizePresets([])).toEqual(ST.DEFAULT_PRESETS);
    expect(ST.sanitizePresets('{broken')).toEqual(ST.DEFAULT_PRESETS);
    expect(ST.sanitizePresets(undefined)).toEqual(ST.DEFAULT_PRESETS);
    const many = Array.from({ length: 40 }, (_, i) => ({ id: 'x' + i, name: 'n' + i, volume: 10 }));
    expect(ST.sanitizePresets(many)).toHaveLength(ST.MAX_PRESETS);
  });
});

describe('sanitizeSettings', () => {
  it('fills defaults and validates each field', () => {
    expect(ST.sanitizeSettings(null)).toEqual(ST.defaultSettings());
    const s = ST.sanitizeSettings({ boost: true, step: 10, defaultVolume: 60, presets: 'x' });
    expect(s).toMatchObject({ boost: true, step: 10, defaultVolume: 60 });
    expect(ST.sanitizeSettings({ step: 0 }).step).toBe(5);
    expect(ST.sanitizeSettings({ step: 2.5 }).step).toBe(5);
    expect(ST.sanitizeSettings({ defaultVolume: 301 }).defaultVolume).toBe(100);
    expect(ST.sanitizeSettings({ boost: 'true' }).boost).toBe(false);
  });
});

describe('legacy migration (V14)', () => {
  it('seeds from legacy keys as the NEW-TAB default only', () => {
    const { settings, changed } = ST.migrate({ rl_volume: 40, rl_boost: false, rl_last_nonzero: 40 });
    expect(changed).toBe(true);
    expect(settings).toMatchObject({ v: 2, defaultVolume: 40, boost: false, step: 5 });
  });
  it('legacy boosted value kept only when boost was on; otherwise capped', () => {
    expect(ST.migrate({ rl_volume: 250, rl_boost: true }).settings).toMatchObject({ defaultVolume: 250, boost: true });
    expect(ST.migrate({ rl_volume: 250, rl_boost: false }).settings.defaultVolume).toBe(100);
  });
  it.each([[undefined], [null], [{}], [{ rl_volume: 'abc' }], [{ rl_volume: NaN }], [{ rl_volume: -5 }], [{ rl_volume: 9999 }], ['junk']])(
    'malformed/missing legacy %j -> safe defaults', (stored) => {
      const { settings } = ST.migrate(stored);
      expect(settings.defaultVolume).toBe(100);
      expect(settings.v).toBe(2);
    });
  it('is idempotent: migrating the result changes nothing', () => {
    const first = ST.migrate({ rl_volume: 40 });
    const second = ST.migrate({ rl_volume: 99, [ST.SETTINGS_KEY]: first.settings });
    expect(second.changed).toBe(false);
    expect(second.settings).toEqual(first.settings); // later legacy writes do not override v2
  });
  it('a corrupt half-written v2 object is repaired, not trusted', () => {
    const { settings, changed } = ST.migrate({ [ST.SETTINGS_KEY]: { v: 1, presets: 'bad', step: 'x' } });
    expect(changed).toBe(true);
    expect(settings.presets).toEqual(ST.DEFAULT_PRESETS);
    expect(settings.step).toBe(5);
  });
});

describe('storage wrappers', () => {
  let store;
  beforeEach(() => {
    store = {};
    globalThis.chrome = {
      storage: {
        local: {
          get: async () => ({ ...store }),
          set: async (o) => { Object.assign(store, o); }
        }
      }
    };
  });
  afterEach(() => { delete globalThis.chrome; });

  it('load migrates once and persists schema v2 without deleting legacy keys', async () => {
    store.rl_volume = 55;
    const s = await ST.load();
    expect(s.defaultVolume).toBe(55);
    expect(store[ST.SETTINGS_KEY].v).toBe(2);
    expect(store.rl_volume).toBe(55); // rollback-friendly
  });
  it('save sanitizes before writing', async () => {
    const saved = await ST.save({ step: 999, boost: true });
    expect(saved.step).toBe(5);
    expect(store[ST.SETTINGS_KEY].boost).toBe(true);
  });
  it('load falls back to defaults when storage throws (migration failure)', async () => {
    globalThis.chrome.storage.local.get = async () => { throw new Error('quota'); };
    expect(await ST.load()).toEqual(ST.defaultSettings());
  });
});
