// RELAXLIKES Volume+ — background.js (MV3 service worker)
// Only job: turn browser-wide keyboard commands into ACTION messages for the right YouTube tab.
// Holds no state, so service-worker suspension is harmless.
importScripts('lib/state.js', 'lib/settings.js');

const { commandToAction, pickTarget } = RL.state;

chrome.commands.onCommand.addListener(async (cmd) => {
  const settings = cmd.startsWith('preset-') ? await RL.settings.load() : null;
  const act = commandToAction(cmd, settings && settings.presets);
  if (!act) return;

  const [active] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  const yt = await chrome.tabs.query({ url: 'https://www.youtube.com/*' });
  const target = pickTarget(active, yt);
  if (!target) return;

  try {
    const r = await chrome.tabs.sendMessage(target.tab.id, { type: 'ACTION', ...act });
    if (r && r.ok) return;
  } catch (_) { /* content script not alive (tab not reloaded after install/update) */ }
  chrome.action.setBadgeText({ text: '!', tabId: target.tab.id });
  setTimeout(() => chrome.action.setBadgeText({ text: '', tabId: target.tab.id }), 2500);
});
