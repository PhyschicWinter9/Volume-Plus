// RELAXLIKES Volume+ — popup.js
// A thin view of ONE tab's state. The tab's content script is the authority: the popup sends
// intents over a port, renders what comes back, and never writes volume to storage itself.
// Global settings (presets, boost, step, new-tab default) live in chrome.storage.local.

const S = RL.state, ST = RL.settings;
const $ = (id) => document.getElementById(id);

const el = {
  fs: $('tabControls'), target: $('target'), disp: $('volDisplay'), num: $('volNum'),
  mute: $('muteBtn'), waves: $('muteWaves'), x: $('muteX'),
  slider: $('volSlider'), labels: $('sliderLabels'), presets: $('presetRow'),
  custom: $('customInput'), customMax: $('customMax'), status: $('status'),
  limiter: $('limiterToggle'), eqOn: $('eqToggle'), eqProfile: $('eqProfile'),
  eqReset: $('eqReset'), eqBands: $('eqBands'), audioNote: $('audioNote'),
  presetEditor: $('presetEditor'), presetAdd: $('presetAdd'), presetRestore: $('presetRestore'),
  boost: $('boostToggle'), boostRow: $('boostRow'), boostSub: $('boostSub'),
  step: $('stepInput'), setDefault: $('setDefault'), cmdList: $('cmdList'), openShortcuts: $('openShortcuts')
};

let settings = ST.defaultSettings();
let view = null;            // last accepted {epoch, state, applied}
let port = null;
let tabId = null;
const clientId = Math.random().toString(36).slice(2, 12);
let seq = 0;
const waiting = new Map();  // request id -> resolve

// =============================================
//  STATUS
// =============================================

const REASONS = {
  'needs-gesture': 'Browser blocked the audio engine — click the YouTube page once, then retry',
  'source-failed': 'Audio engine could not attach (reload the tab)',
  'no-injected': 'Reload this YouTube tab to reconnect Volume+',
  'native-mismatch': 'YouTube did not accept the volume',
  'no-video': 'Waiting for the video…',
  'no-graph': 'Boost needs the audio engine, which is unavailable',
  'no-webaudio': 'Web Audio is unavailable in this browser'
};

function setStatus(msg, type = '') { el.status.textContent = msg; el.status.className = 'status ' + type; }

function renderStatus() {
  if (!view) return;
  const { state: s, applied: a } = view;
  const eff = S.effective(s);
  if (a.rev !== s.rev) return setStatus('Applying…', '');
  if (a.status === 'ok') return setStatus(s.muted ? 'Muted' : eff > 100 ? `Boosted to ${eff}% - louder than YouTube allows` : `Applied at ${eff}%`, eff > 100 ? 'warn' : 'ok');
  if (a.status === 'pending') return setStatus(REASONS[a.reason] || 'Waiting for the player…', '');
  setStatus(`Playing at ${a.pct}% — ${REASONS[a.reason] || a.reason}`, 'err');
}

// =============================================
//  RENDER
// =============================================

const max = () => (settings.boost ? 300 : 100);

function renderPresets() {
  el.presets.replaceChildren();
  const cur = view ? view.state.volume : null;
  settings.presets.forEach((p) => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'preset';
    b.setAttribute('aria-pressed', String(p.volume === cur));
    b.title = `${p.name} — ${p.volume}%` + (p.volume > max() ? ' (turn on Boost mode)' : '');
    const n = document.createElement('span'); n.textContent = p.volume;
    const l = document.createElement('small'); l.textContent = p.name;
    b.append(n, l);
    b.addEventListener('click', () => act('preset', p.volume));
    el.presets.append(b);
  });
}

function renderEditor() {
  el.presetEditor.replaceChildren();
  settings.presets.forEach((p, i) => {
    const row = document.createElement('div'); row.className = 'preset-edit';
    const name = document.createElement('input');
    name.className = 'field'; name.value = p.name; name.maxLength = ST.NAME_MAX;
    name.setAttribute('aria-label', `Preset ${i + 1} name`);
    const vol = document.createElement('input');
    vol.className = 'field'; vol.type = 'number'; vol.min = 0; vol.max = 300; vol.value = p.volume;
    vol.setAttribute('aria-label', `${p.name} volume percent`);
    const mk = (icon, aria, fn, disabled) => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'btn icon'; b.setAttribute('aria-label', aria); b.title = aria;
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('class', 'i');
      const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
      use.setAttribute('href', '#i-' + icon);
      svg.append(use); b.append(svg);
      b.disabled = !!disabled; b.addEventListener('click', fn); return b;
    };
    name.addEventListener('change', () => mutatePresets(ST.editPreset(settings.presets, p.id, { name: name.value })));
    vol.addEventListener('change', () => mutatePresets(ST.editPreset(settings.presets, p.id, { volume: vol.valueAsNumber })));
    row.append(name, vol,
      mk('up', `Move ${p.name} up`, () => mutatePresets(ST.movePreset(settings.presets, p.id, -1)), i === 0),
      mk('down', `Move ${p.name} down`, () => mutatePresets(ST.movePreset(settings.presets, p.id, 1)), i === settings.presets.length - 1),
      mk('trash', `Delete ${p.name}`, () => mutatePresets(ST.removePreset(settings.presets, p.id)), settings.presets.length <= 1));
    el.presetEditor.append(row);
  });
}

const PRESET_ERR = {
  'bad-name': `Name must be 1–${ST.NAME_MAX} characters`, 'duplicate-name': 'A preset with that name exists',
  'bad-volume': 'Volume must be 0–300', 'too-many': `At most ${ST.MAX_PRESETS} presets`, 'not-found': 'Preset not found'
};

async function mutatePresets(r) {
  if (!r.ok) { setStatus(PRESET_ERR[r.error] || r.error, 'err'); renderEditor(); return; }
  settings = await ST.save({ ...settings, presets: r.presets });
  renderPresets(); renderEditor();
}

function renderBands(s) {
  if (!el.eqBands.childElementCount) {
    for (const b of ['bass', 'mid', 'treble']) {
      const row = document.createElement('div'); row.className = 'eq-band';
      const lab = document.createElement('label'); lab.htmlFor = 'eq-' + b; lab.textContent = b[0].toUpperCase() + b.slice(1);
      const r = document.createElement('input');
      r.type = 'range'; r.id = 'eq-' + b; r.min = -S.EQ_RANGE; r.max = S.EQ_RANGE; r.step = 0.5; r.value = 0;
      const o = document.createElement('output'); o.htmlFor = r.id;
      r.addEventListener('input', () => { o.textContent = fmtDb(+r.value); queueEq(b, +r.value); });
      row.append(lab, r, o);
      el.eqBands.append(row);
    }
  }
  for (const b of ['bass', 'mid', 'treble']) {
    const r = $('eq-' + b);
    if (document.activeElement !== r) r.value = s.eq[b];
    r.disabled = !s.eq.enabled;
    r.nextElementSibling.textContent = fmtDb(s.eq[b]);
  }
}
const fmtDb = (v) => (v > 0 ? '+' : '') + v + ' dB';

function render() {
  if (!view) return;
  const s = view.state;
  const eff = S.effective(s);
  const m = max();

  el.num.textContent = eff;
  el.num.className = 'vol-num' + (eff > 100 ? ' boost' : eff === 0 ? ' dim' : '');
  el.mute.setAttribute('aria-pressed', String(s.muted));
  el.mute.setAttribute('aria-label', s.muted ? 'Unmute' : 'Mute');
  el.x.style.display = s.muted || eff === 0 ? '' : 'none';
  el.waves.style.display = s.muted || eff === 0 ? 'none' : '';

  el.slider.max = m;
  if (!dragging) el.slider.value = eff;
  const box = $('sliderBox');
  box.classList.toggle('boostable', m === 300);
  box.style.setProperty('--zone', m === 300 ? '33.333%' : '100%');
  box.style.setProperty('--fill', (Math.min(eff, m) / m * 100) + '%');
  box.style.setProperty('--fill-color', eff > 100 ? 'var(--boost)' : 'var(--accent)');
  el.slider.setAttribute('aria-valuetext', s.muted ? 'Muted' : eff + '%');
  el.labels.innerHTML = m === 300 ? '<span>0</span><span>100</span><span>200</span><span>300</span>' : '<span>0</span><span>50</span><span>100</span>';
  el.custom.max = m; el.custom.placeholder = `0–${m}`; el.customMax.textContent = `/ ${m}%`;

  el.limiter.checked = s.limiter;
  el.eqOn.checked = s.eq.enabled;
  el.eqProfile.value = s.eq.profile;
  $('limiterRow').classList.toggle('active', s.limiter);
  $('eqRow').classList.toggle('active', s.eq.enabled);
  renderBands(s);
  el.eqProfile.disabled = el.eqReset.disabled = !s.eq.enabled;

  const d = view.diag;
  el.audioNote.textContent = d && d.status !== 'none'
    ? `Audio engine: ${d.status}${d.reason ? ' (' + d.reason + ')' : ''}${d.reductionDb ? `, limiter −${Math.abs(d.reductionDb).toFixed(1)} dB` : ''}`
    : 'Audio engine starts when boost or EQ is first used. The limiter reduces peaks but cannot guarantee zero clipping.';

  $('soundState').textContent = `${s.limiter ? 'Limiter on' : 'Limiter off'} · EQ ${s.eq.enabled ? S.EQ_PROFILE_LABELS[s.eq.profile] : 'off'}`;
  renderPresets();
  renderStatus();
}

function renderSettings() {
  el.boost.checked = settings.boost;
  el.boostRow.classList.toggle('active', settings.boost);
  el.boostSub.textContent = settings.boost ? 'On - up to 300%. Loud: lower it if it hurts.' : 'Off - limited to YouTube\'s own maximum';
  $('settingsState').textContent = `Step ${settings.step}%`;
  $('presetState').textContent = `${settings.presets.length} saved`;
  if (document.activeElement !== el.step) el.step.value = settings.step;
  renderPresets(); renderEditor(); render();
}

// =============================================
//  CONNECTION
// =============================================

function accept(msg) {
  if (!S.acceptUpdate(view, msg)) return false;
  view = { epoch: msg.epoch, state: msg.state, applied: msg.applied, diag: msg.diag || null };
  if (typeof msg.boost === 'boolean' && msg.boost !== settings.boost) { settings.boost = msg.boost; renderSettings(); return true; }
  render();
  return true;
}

function connect(id) {
  tabId = id;
  port = chrome.tabs.connect(id, { name: 'rl-popup' });
  port.onMessage.addListener((msg) => {
    if (msg.type === 'STATE') accept(msg);
    else if (msg.type === 'REPLY') {
      if (msg.state) accept(msg);
      const done = waiting.get(msg.id); waiting.delete(msg.id);
      if (done) done(msg);
    }
  });
  port.onDisconnect.addListener(() => {
    void chrome.runtime.lastError;
    port = null;
    el.fs.disabled = true;
    setStatus('Disconnected — reload the YouTube tab to reconnect', 'err');
  });
}

function request(cmd) {
  return new Promise((resolve) => {
    if (!port) return resolve({ ok: false, error: 'disconnected' });
    const id = ++seq;
    waiting.set(id, resolve);
    setTimeout(() => { if (waiting.delete(id)) resolve({ ok: false, error: 'timeout' }); }, 2500);
    try { port.postMessage({ ...cmd, id, clientId, seq: id }); } catch (_) { waiting.delete(id); resolve({ ok: false, error: 'disconnected' }); }
  });
}

async function patch(p) {
  const r = await request({ type: 'PATCH', patch: p });
  if (!r.ok && r.error !== 'stale-seq') setStatus(r.error === 'timeout' ? 'Tab did not respond' : 'Rejected: ' + r.error, 'err');
  return r;
}
async function act(action, value) {
  const r = await request({ type: 'ACTION', action, value });
  if (!r.ok && r.error !== 'stale-seq') setStatus('Rejected: ' + r.error, 'err');
}

// =============================================
//  CONTROLS
// =============================================

// Slider: coalesce to one patch per frame while dragging; flush on release.
let dragging = false, dragRaf = null, dragVal = 0;
el.slider.addEventListener('input', () => {
  dragging = true; dragVal = +el.slider.value;
  el.num.textContent = dragVal;
  if (dragRaf) return;
  dragRaf = requestAnimationFrame(() => { dragRaf = null; patch({ volume: dragVal }); });
});
el.slider.addEventListener('change', () => { dragging = false; patch({ volume: +el.slider.value }); });

el.disp.addEventListener('wheel', (e) => { e.preventDefault(); act(e.deltaY < 0 ? 'volUp' : 'volDown'); }, { passive: false });
el.mute.addEventListener('click', () => act('toggleMute'));

document.addEventListener('keydown', (e) => {
  if (S.isEditable(document.activeElement) || document.activeElement === el.slider) return;
  const a = S.keyToAction(e.key, { shift: e.shiftKey, ctrl: e.ctrlKey, alt: e.altKey, meta: e.metaKey });
  if (a) { e.preventDefault(); act(a); }
});

el.custom.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter') return;
  const v = S.clampVolume(el.custom.value, max());
  if (v !== null) patch({ volume: v });
  el.custom.value = '';
});

// EQ: slider events coalesce into one patch per frame
let eqPending = {}, eqRaf = null;
function queueEq(band, v) {
  eqPending[band] = v;
  if (eqRaf) return;
  eqRaf = requestAnimationFrame(() => { eqRaf = null; const e = eqPending; eqPending = {}; patch({ eq: e }); });
}
for (const [k, label] of Object.entries(S.EQ_PROFILE_LABELS)) el.eqProfile.add(new Option(label, k));
el.limiter.addEventListener('change', () => patch({ limiter: el.limiter.checked }));
el.eqOn.addEventListener('change', () => patch({ eq: { enabled: el.eqOn.checked } }));
el.eqProfile.addEventListener('change', () => patch({ eq: { profile: el.eqProfile.value } }));
el.eqReset.addEventListener('click', () => patch({ eq: { profile: 'flat' } }));

// Settings
el.boost.addEventListener('change', async () => { settings = await ST.save({ ...settings, boost: el.boost.checked }); renderSettings(); });
el.step.addEventListener('change', async () => {
  const v = el.step.valueAsNumber;
  if (!Number.isInteger(v) || v < 1 || v > 25) { setStatus('Step must be 1–25', 'err'); el.step.value = settings.step; return; }
  settings = await ST.save({ ...settings, step: v });
});
el.setDefault.addEventListener('click', async () => {
  if (!view) return;
  settings = await ST.save({ ...settings, defaultVolume: view.state.volume });
  setStatus(`New tabs will start at ${view.state.volume}%`, 'ok');
});
el.presetAdd.addEventListener('click', () => {
  const v = view ? view.state.volume : 100;
  let n = `Preset ${settings.presets.length + 1}`;
  while (settings.presets.some((p) => p.name === n)) n += '+';
  mutatePresets(ST.addPreset(settings.presets, n.slice(0, ST.NAME_MAX), v));
});
el.presetRestore.addEventListener('click', () => mutatePresets({ ok: true, presets: ST.restorePresets() }));

// Shortcuts
const isEdge = /\bEdg\//.test(navigator.userAgent);
el.openShortcuts.addEventListener('click', () => chrome.tabs.create({ url: (isEdge ? 'edge' : 'chrome') + '://extensions/shortcuts' }));
async function renderCommands() {
  el.cmdList.replaceChildren();
  let cmds = [];
  try { cmds = await chrome.commands.getAll(); } catch (_) {}
  for (const c of cmds) {
    if (c.name.startsWith('_')) continue;
    const row = document.createElement('div'); row.className = 'cmd-row';
    const k = document.createElement('kbd'); k.textContent = c.shortcut || 'not set'; if (!c.shortcut) k.className = 'unset';
    row.append(document.createTextNode(c.description || c.name), k);
    el.cmdList.append(row);
  }
}

chrome.storage.onChanged.addListener((ch, area) => {
  if (area === 'local' && ch[ST.SETTINGS_KEY]) { settings = ST.sanitizeSettings(ch[ST.SETTINGS_KEY].newValue); renderSettings(); }
});

// =============================================
//  INIT
// =============================================

async function init() {
  settings = await ST.load();
  renderSettings();
  renderCommands();

  const [active] = await chrome.tabs.query({ active: true, currentWindow: true });
  const yt = await chrome.tabs.query({ url: 'https://www.youtube.com/*' });
  const t = S.pickTarget(active, yt);
  if (!t) { setStatus('Open YouTube to control volume', ''); return; }

  el.target.textContent = t.tab.title || 'YouTube';
  el.target.dataset.bg = String(!!t.background);
  el.target.title = t.background ? 'Controlling a YouTube tab in the background' : t.tab.title || '';
  el.fs.disabled = false;
  connect(t.tab.id);
  setStatus('Connecting…', '');

  const r = await request({ type: 'GET_STATE' });
  if (!r.ok && r.error === 'timeout') setStatus('Reload this YouTube tab to reconnect Volume+', 'err');
}

init();
