import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RL } from './helpers.js';

let onCommand, sent, badges, tabs, activeTab, storage, sendImpl;

beforeEach(async () => {
  vi.resetModules();
  sent = []; badges = []; storage = {};
  activeTab = { id: 1, url: 'https://www.youtube.com/watch?v=a', audible: false };
  tabs = [activeTab];
  sendImpl = async () => ({ ok: true });
  globalThis.importScripts = () => {};
  globalThis.chrome = {
    commands: { onCommand: { addListener: (f) => (onCommand = f) } },
    tabs: {
      query: async (q) => (q.active ? [activeTab] : tabs),
      sendMessage: async (id, m) => { sent.push([id, m]); return sendImpl(id, m); }
    },
    action: { setBadgeText: (o) => badges.push(o) },
    storage: { local: { get: async () => ({ ...storage }), set: async (o) => Object.assign(storage, o) } }
  };
  await import('../../src/background.js');
});

describe('background commands', () => {
  it('sends the mapped action to the focused YouTube tab', async () => {
    await onCommand('volume-up');
    expect(sent).toEqual([[1, { type: 'ACTION', action: 'volUp' }]]);
    expect(badges).toEqual([]);
  });
  it('controls the audible YouTube tab when another site is focused (V05)', async () => {
    activeTab = { id: 9, url: 'https://example.com/' };
    tabs = [{ id: 2, url: 'https://www.youtube.com/a', audible: false }, { id: 3, url: 'https://www.youtube.com/b', audible: true }];
    await onCommand('toggle-mute');
    expect(sent[0][0]).toBe(3);
  });
  it('does nothing without a YouTube tab or for unknown commands', async () => {
    activeTab = { id: 9, url: 'https://example.com/' }; tabs = [];
    await onCommand('volume-up');
    await onCommand('bogus');
    expect(sent).toEqual([]);
  });
  it('preset commands use the user\'s preset list', async () => {
    storage.rl_settings = { v: 2, presets: [{ id: 'a', name: 'A', volume: 33 }, { id: 'b', name: 'B', volume: 77 }] };
    await onCommand('preset-2');
    expect(sent[0][1]).toEqual({ type: 'ACTION', action: 'preset', value: 77 });
    await onCommand('preset-4'); // no 4th preset
    expect(sent).toHaveLength(1);
  });
  it('flags failure on the badge when the content script is unreachable (V24)', async () => {
    vi.useFakeTimers();
    sendImpl = async () => { throw new Error('Receiving end does not exist'); };
    await onCommand('reset-volume');
    expect(badges[0]).toEqual({ text: '!', tabId: 1 });
    vi.advanceTimersByTime(3000);
    expect(badges[1]).toEqual({ text: '', tabId: 1 });
    vi.useRealTimers();
  });
  it('flags failure when the page rejects the command', async () => {
    sendImpl = async () => ({ ok: false, error: 'bad-action' });
    await onCommand('volume-down');
    expect(badges[0].text).toBe('!');
  });
});
