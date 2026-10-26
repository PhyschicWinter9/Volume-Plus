import { describe, it, expect } from 'vitest';
import { RL } from './helpers.js';
const S = RL.state;

describe('volume validation (V01/V02)', () => {
  it.each([0, 1, 99, 100, 101, 150, 200, 300])('accepts %i', (v) => expect(S.validVolume(v)).toBe(v));
  it.each([NaN, Infinity, -Infinity, -1, 301, '50', null, undefined, {}, [], true])('rejects %s', (v) => expect(S.validVolume(v)).toBeNull());
  it('rounds fractions', () => expect(S.validVolume(49.6)).toBe(50));
  it('clampVolume is lenient for UI input', () => {
    expect(S.clampVolume(301)).toBe(300);
    expect(S.clampVolume(-5)).toBe(0);
    expect(S.clampVolume('42')).toBe(42);
    expect(S.clampVolume(500, 100)).toBe(100);
    for (const bad of [NaN, Infinity, '', 'abc', null, undefined]) expect(S.clampVolume(bad)).toBeNull();
  });
  it('validDb bounds to ±12 and half-dB steps', () => {
    expect(S.validDb(12)).toBe(12);
    expect(S.validDb(-12)).toBe(-12);
    expect(S.validDb(12.5)).toBeNull();
    expect(S.validDb(NaN)).toBeNull();
    expect(S.validDb(2.26)).toBe(2.5);
  });
});

describe('reduce', () => {
  const base = S.defaultTabState(100);
  it('bumps rev only when something changed', () => {
    const same = S.reduce(base, { volume: 100 }, { boost: true });
    expect(same.ok && same.changed).toBe(false);
    expect(same.state.rev).toBe(0);
    const diff = S.reduce(base, { volume: 50 }, { boost: true });
    expect(diff.state.rev).toBe(1);
    expect(diff.state.volume).toBe(50);
  });
  it('does not mutate its input', () => {
    const frozen = JSON.stringify(base);
    S.reduce(base, { volume: 20, eq: { enabled: true, bass: 3 } }, { boost: true });
    expect(JSON.stringify(base)).toBe(frozen);
  });
  it('clamps to 100 without boost, allows 300 with', () => {
    expect(S.reduce(base, { volume: 250 }, { boost: false }).state.volume).toBe(100);
    expect(S.reduce(base, { volume: 250 }, { boost: true }).state.volume).toBe(250);
  });
  it.each([
    [{ volume: NaN }], [{ volume: Infinity }], [{ volume: -1 }], [{ volume: 301 }], [{ volume: '5' }],
    [{ muted: 1 }], [{ limiter: 'yes' }], [{ eq: null }], [{ eq: { enabled: 1 } }], [{ eq: { bass: 13 } }],
    [{ eq: { profile: '__proto__' } }], [{ eq: { evil: 1 } }], [{ nope: 1 }], [null], [[]], ['x']
  ])('rejects %j', (p) => {
    expect(S.reduce(base, p, { boost: true }).ok).toBe(false);
  });
  it('mute keeps the volume; last-nonzero restores at 180% (V03)', () => {
    let s = S.reduce(base, { volume: 180 }, { boost: true }).state;
    s = S.reduce(s, S.actionToPatch(s, 'toggleMute', { boost: true }), { boost: true }).state;
    expect(s.muted).toBe(true);
    expect(S.effective(s)).toBe(0);
    expect(s.volume).toBe(180);
    s = S.reduce(s, S.actionToPatch(s, 'toggleMute', { boost: true }), { boost: true }).state;
    expect(S.effective(s)).toBe(180);
  });
  it('volume 0 then toggleMute restores last nonzero', () => {
    let s = S.reduce(base, { volume: 40 }, { boost: true }).state;
    s = S.reduce(s, { volume: 0 }, { boost: true }).state;
    expect(s.lastNonZero).toBe(40);
    expect(S.actionToPatch(s, 'toggleMute', { boost: true })).toEqual({ volume: 40 });
  });
  it('raising volume unmutes', () => {
    let s = S.reduce(base, { muted: true }, {}).state;
    s = S.reduce(s, { volume: 30 }, {}).state;
    expect(s.muted).toBe(false);
  });
  it('EQ profiles, manual bands and re-matching', () => {
    let s = S.reduce(base, { eq: { enabled: true, profile: 'bass' } }).state;
    expect(s.eq).toMatchObject({ enabled: true, profile: 'bass', bass: 6, mid: 0, treble: 0 });
    s = S.reduce(s, { eq: { mid: 3 } }).state;
    expect(s.eq.profile).toBe('custom');
    s = S.reduce(s, { eq: { mid: 0 } }).state;
    expect(s.eq.profile).toBe('bass');
    s = S.reduce(s, { eq: { profile: 'flat' } }).state;
    expect(s.eq).toMatchObject({ bass: 0, mid: 0, treble: 0 });
    const custom = S.reduce(s, { eq: { profile: 'custom' } }).state; // keeps current bands
    expect(custom.eq.profile).toBe('custom');
  });
  it('needsGraph / gain / native split', () => {
    const s = (v, extra = {}) => ({ ...S.defaultTabState(v), ...extra });
    expect(S.needsGraph(s(100))).toBe(false);
    expect(S.needsGraph(s(101))).toBe(true);
    expect(S.needsGraph({ ...s(50), eq: { enabled: true, bass: 0, mid: 0, treble: 0 } })).toBe(true);
    expect(S.gainFor(s(250))).toBe(2.5);
    expect(S.nativePct(s(250))).toBe(100);
    expect(S.gainFor(s(60))).toBe(1);
    expect(S.nativePct(s(60))).toBe(60);
    expect(S.nativePct(s(250, { muted: true }))).toBe(0);
  });
});

describe('sanitizeTabState (corrupt sessionStorage)', () => {
  it('survives garbage', () => {
    for (const raw of ['', '{', 'null', '[]', '"x"', '123', undefined, null, { volume: 'loud' }]) {
      const s = S.sanitizeTabState(raw);
      expect(S.validVolume(s.volume)).not.toBeNull();
      expect(s.eq.enabled).toBe(false);
    }
  });
  it('keeps valid fields and drops bad ones independently', () => {
    const s = S.sanitizeTabState(JSON.stringify({
      volume: 50, muted: true, limiter: false, rev: 7,
      eq: { enabled: true, profile: 'nope', bass: 99, mid: 3, treble: 'x' }
    }));
    expect(s).toMatchObject({ volume: 50, muted: true, limiter: false, rev: 7 });
    expect(s.eq).toMatchObject({ enabled: true, profile: 'custom', bass: 0, mid: 3, treble: 0 });
  });
  it('rejects out-of-range volume and uses fallback', () => {
    expect(S.sanitizeTabState({ volume: 999 }, 70).volume).toBe(70);
  });
});

describe('actionToPatch', () => {
  const s = S.defaultTabState(50);
  it('steps and clamps, honouring boost', () => {
    expect(S.actionToPatch(s, 'volUp', { step: 10 })).toEqual({ volume: 60 });
    expect(S.actionToPatch({ ...s, volume: 98 }, 'volUp', { step: 5 })).toEqual({ volume: 100 });
    expect(S.actionToPatch({ ...s, volume: 98 }, 'volUp', { step: 5, boost: true })).toEqual({ volume: 103 });
    expect(S.actionToPatch({ ...s, volume: 2 }, 'volDown', { step: 5 })).toEqual({ volume: 0 });
    expect(S.actionToPatch(s, 'fineUp')).toEqual({ volume: 51 });
    expect(S.actionToPatch(s, 'fineDown')).toEqual({ volume: 49 });
    expect(S.actionToPatch(s, 'reset')).toEqual({ volume: 100 });
  });
  it('bad step falls back to 5; unknown action / bad preset -> null', () => {
    expect(S.actionToPatch(s, 'volUp', { step: 0 })).toEqual({ volume: 55 });
    expect(S.actionToPatch(s, 'volUp', { step: 99 })).toEqual({ volume: 55 });
    expect(S.actionToPatch(s, 'explode')).toBeNull();
    expect(S.actionToPatch(s, 'preset', { value: NaN })).toBeNull();
    expect(S.actionToPatch(s, 'preset', { value: 150 })).toEqual({ volume: 150 });
  });
  it('unmute when muted', () => {
    expect(S.actionToPatch({ ...s, muted: true }, 'toggleMute')).toEqual({ muted: false });
  });
});

describe('keys (V23)', () => {
  it('maps arrows only without ctrl/alt/meta', () => {
    expect(S.keyToAction('ArrowUp')).toBe('volUp');
    expect(S.keyToAction('ArrowDown', { shift: true })).toBe('fineDown');
    expect(S.keyToAction('ArrowUp', { ctrl: true })).toBeNull();
    expect(S.keyToAction('ArrowUp', { alt: true })).toBeNull();
    expect(S.keyToAction('a')).toBeNull();
  });
  it('detects editable targets', () => {
    const el = (tagName, extra = {}) => ({ tagName, getAttribute: () => null, ...extra });
    expect(S.isEditable(el('INPUT'))).toBe(true);
    expect(S.isEditable(el('TEXTAREA'))).toBe(true);
    expect(S.isEditable(el('SELECT'))).toBe(true);
    expect(S.isEditable(el('DIV', { isContentEditable: true }))).toBe(true);
    expect(S.isEditable(el('DIV', { getAttribute: () => 'textbox' }))).toBe(true);
    expect(S.isEditable(el('DIV'))).toBe(false);
    expect(S.isEditable(null)).toBe(false);
  });
});

describe('commandToAction', () => {
  const presets = [{ volume: 25 }, { volume: 150 }];
  it('maps fixed and preset commands', () => {
    expect(S.commandToAction('volume-up')).toEqual({ action: 'volUp' });
    expect(S.commandToAction('reset-volume')).toEqual({ action: 'reset' });
    expect(S.commandToAction('preset-2', presets)).toEqual({ action: 'preset', value: 150 });
    expect(S.commandToAction('preset-4', presets)).toBeNull();
    expect(S.commandToAction('preset-9', presets)).toBeNull();
    expect(S.commandToAction('bogus')).toBeNull();
  });
});

describe('pickTarget (V05: wrong active tab)', () => {
  const yt = (id, audible = false) => ({ id, url: 'https://www.youtube.com/watch?v=x', audible });
  it('prefers the focused YouTube tab', () => {
    expect(S.pickTarget(yt(1), [yt(2, true)])).toEqual({ tab: yt(1), background: false });
  });
  it('falls back to the audible one, then the first', () => {
    expect(S.pickTarget({ id: 9, url: 'https://example.com/' }, [yt(1), yt(2, true)]).tab.id).toBe(2);
    expect(S.pickTarget(undefined, [yt(1), yt(2)]).tab.id).toBe(1);
  });
  it('null when no YouTube tab; ignores look-alike hosts', () => {
    expect(S.pickTarget({ id: 1, url: 'https://example.com/' }, [])).toBeNull();
    const fake = { id: 2, url: 'https://www.youtube.com.evil.test/' };
    expect(S.pickTarget(fake, [fake])).toBeNull();
  });
});

describe('acceptUpdate: out-of-order acks (V07)', () => {
  const m = (epoch, rev, arev) => ({ epoch, state: { rev }, applied: { rev: arev } });
  it('first update and new epoch always accepted', () => {
    expect(S.acceptUpdate(null, m('a', 1, 1))).toBe(true);
    expect(S.acceptUpdate(m('a', 9, 9), m('b', 0, -1))).toBe(true);
  });
  it('100→250→60→300 arriving shuffled leaves the newest rev shown', () => {
    let cur = null;
    const accepted = [];
    for (const rev of [3, 1, 4, 2]) {
      const msg = m('e', rev, rev);
      if (S.acceptUpdate(cur, msg)) { cur = msg; accepted.push(rev); }
    }
    expect(accepted).toEqual([3, 4]);
    expect(cur.state.rev).toBe(4);
  });
  it('same rev: ack may advance but not regress', () => {
    const pending = m('e', 5, 4), done = m('e', 5, 5);
    expect(S.acceptUpdate(pending, done)).toBe(true);
    expect(S.acceptUpdate(done, pending)).toBe(false);
  });
  it('rejects malformed messages', () => {
    for (const bad of [null, {}, { epoch: 1, state: { rev: 1 } }, { epoch: 'a', state: {} }, { epoch: 'a' }]) {
      expect(S.acceptUpdate(null, bad)).toBe(false);
    }
  });
});
