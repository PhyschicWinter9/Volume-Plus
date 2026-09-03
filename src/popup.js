// RELAXLIKES Volume+ — popup.js

// Load the custom font asynchronously so it never blocks the popup's
// initial paint (extension pages also forbid the old onload="" attribute
// trick — inline event handlers violate the default CSP).
const fontLink = document.createElement("link");
fontLink.rel  = "stylesheet";
fontLink.href = "https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=Syne:wght@500;700;800&display=swap";
document.head.appendChild(fontLink);

const volNum       = document.getElementById("volNum");
const volDisplay   = document.getElementById("volDisplay");
const volSlider    = document.getElementById("volSlider");
const customInput  = document.getElementById("customInput");
const customMax    = document.getElementById("customMax");
const boostToggle  = document.getElementById("boostToggle");
const boostRow     = document.getElementById("boostRow");
const boostSub     = document.getElementById("boostSub");
const sliderLabels = document.getElementById("sliderLabels");
const status       = document.getElementById("status");
const presetRow    = document.getElementById("presetRow");
const muteBtn      = document.getElementById("muteBtn");

function getPresets() {
  return document.querySelectorAll(".preset");
}

let currentVol      = 100;
let lastNonZeroVol  = 100; // remembered for the mute/unmute toggle
let boostEnabled    = false;
let ytTab           = null;

// =============================================
//  ANIMATED NUMBER COUNTER
// =============================================

let animFrom    = 100;
let animTo      = 100;
let animStart   = null;
let animFrame   = null;
const ANIM_MS   = 250; // duration in ms

function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3);
}

function animateNumber(from, to) {
  if (animFrame) cancelAnimationFrame(animFrame);
  animFrom  = from;
  animTo    = to;
  animStart = null;

  function step(ts) {
    if (!animStart) animStart = ts;
    const elapsed = ts - animStart;
    const progress = Math.min(elapsed / ANIM_MS, 1);
    const eased = easeOutCubic(progress);
    const value = Math.round(animFrom + (animTo - animFrom) * eased);

    volNum.textContent = value;

    if (progress < 1) {
      animFrame = requestAnimationFrame(step);
    } else {
      volNum.textContent = animTo;
      animFrame = null;
    }
  }

  animFrame = requestAnimationFrame(step);
}

// =============================================
//  STATUS WITH FADE
// =============================================

let statusTimer = null;

function setStatus(msg, type = "") {
  // Restart animation
  status.classList.remove("animate");
  void status.offsetWidth; // reflow trigger
  status.textContent = msg;
  status.className   = "status " + type + " animate";

  // Auto-clear after 3s
  if (statusTimer) clearTimeout(statusTimer);
  statusTimer = setTimeout(() => {
    status.classList.remove("animate");
  }, 3000);
}

// =============================================
//  DISPLAY
// =============================================

function updateDisplay(vol) {
  const max = boostEnabled ? 300 : 100;
  vol = Math.max(0, Math.min(max, Math.round(vol)));

  const prev = currentVol;
  currentVol = vol;
  if (vol > 0) lastNonZeroVol = vol;

  // Animated number
  animateNumber(prev, vol);

  // Color class
  volNum.className   = vol > 100 ? "vol-num danger" : vol === 0 ? "vol-num" : "vol-num normal";

  // Display card glow when boosted
  volDisplay.classList.toggle("boosted", vol > 100);

  // Mute button state
  muteBtn.textContent = vol === 0 ? "🔇" : "🔊";
  muteBtn.classList.toggle("muted", vol === 0);

  // Slider (set max before value)
  volSlider.max   = max;
  volSlider.value = vol;

  // Presets (fresh query)
  getPresets().forEach(b => b.classList.toggle("active", +b.dataset.val === vol));
}

function rebuildPresets() {
  if (boostEnabled) {
    sliderLabels.innerHTML = "<span>0%</span><span>100%</span><span>200%</span><span>300%</span>";
    presetRow.innerHTML = `
      <button class="preset" data-val="50">50</button>
      <button class="preset" data-val="100">100</button>
      <button class="preset" data-val="150">150</button>
      <button class="preset" data-val="200">200</button>
      <button class="preset" data-val="300">300</button>`;
  } else {
    sliderLabels.innerHTML = "<span>0%</span><span>50%</span><span>100%</span>";
    presetRow.innerHTML = `
      <button class="preset" data-val="0">0</button>
      <button class="preset" data-val="25">25</button>
      <button class="preset" data-val="50">50</button>
      <button class="preset" data-val="75">75</button>
      <button class="preset" data-val="100">100</button>`;
  }
  getPresets().forEach(b => {
    b.addEventListener("click", () => sendVolume(+b.dataset.val));
  });
}

function applyMax() {
  const max = boostEnabled ? 300 : 100;
  customInput.max         = max;
  customInput.placeholder = `0–${max}`;
  customMax.textContent   = `/ ${max}%`;
  rebuildPresets();
  updateDisplay(currentVol);
}

// =============================================
//  TAB HELPER
// =============================================

async function getYTTab() {
  const tabs   = await chrome.tabs.query({ active: true, currentWindow: true });
  const active = tabs[0];
  if (active?.url?.includes("youtube.com")) return active;

  // The focused tab isn't YouTube — look for one elsewhere so the popup
  // still works while YouTube keeps playing in a background tab. Prefer
  // whichever YouTube tab is actually making sound.
  try {
    const ytTabs = await chrome.tabs.query({ url: "*://www.youtube.com/*" });
    if (!ytTabs.length) return null;
    const best = ytTabs.find(t => t.audible) || ytTabs[0];
    best.__background = true;
    return best;
  } catch (_) {
    return null;
  }
}

// =============================================
//  SET volume via executeScript (MAIN world)
// =============================================

async function applyVolumeInPage(tabId, vol) {
  const nativeVol = Math.min(vol, 100);

  await chrome.scripting.executeScript({
    target: { tabId },
    func: (volume, realPct) => {
      const video = document.querySelector(".html5-main-video") || document.querySelector("video");
      if (!video) return;

      if (video.muted) {
        video.muted = false;
        const muteBtn = document.querySelector(".ytp-mute-button");
        if (muteBtn) muteBtn.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
      }

      video.volume = volume / 100;

      const handle = document.querySelector(".ytp-volume-slider-handle");
      if (handle) handle.style.left = `${volume * 0.77}%`;

      const panel = document.querySelector(".ytp-volume-panel");
      if (panel) {
        panel.setAttribute("aria-valuenow", String(volume));
        const text = panel.getAttribute("aria-valuetext") || "";
        if (!text.toLowerCase().includes("mut") && !text.includes("ปิด")) {
          panel.setAttribute("aria-valuetext", `${volume}%`);
        }
      }

      // Mirror to localStorage directly so the value survives a refresh
      // even if the SET_VOLUME message to content.js below never lands
      // (e.g. content.js isn't alive on this tab yet).
      try { localStorage.setItem("rl_volume", String(realPct)); } catch (_) {}
    },
    args: [nativeVol, vol]
  });

  chrome.tabs.sendMessage(tabId, { type: "SET_VOLUME", volume: vol }, () => {});
}

// =============================================
//  READ volume back from the page (authoritative)
// =============================================

// content.js's in-memory currentVolume / chrome.storage are relayed state
// and can lag behind a change made directly on the player (e.g. dragging
// the in-page widget) if that relay hiccups. The player itself is the
// source of truth — read it straight from the DOM instead of trusting
// only the relay.
async function readYTVolume(tabId) {
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        const player = document.querySelector('#movie_player');
        if (player && typeof player.getVolume === 'function') {
          const muted = typeof player.isMuted === 'function' && player.isMuted();
          return muted ? 0 : player.getVolume();
        }
        const video = document.querySelector(".html5-main-video") || document.querySelector("video");
        if (!video) return null;
        return Math.round((video.muted ? 0 : video.volume) * 100);
      }
    });
    return results?.[0]?.result ?? null;
  } catch (_) {
    return null;
  }
}

// =============================================
//  SEND VOLUME
// =============================================

// Persist to chrome.storage.local from the popup itself — don't rely
// solely on content.js relaying it back, since that message silently
// fails when content.js isn't alive on the tab (e.g. right after the
// extension reloads, before the YouTube page is refreshed).
//
// `immediate` writes straight away (discrete actions: presets, custom
// input, mute, boost). Drag input instead debounces — otherwise a fast
// slider drag would flood chrome.storage with a write per pixel — but
// still flushes right away if nothing calls it again within 120ms, and
// callers always flush explicitly on drag release (see volSlider "change").
let persistTimer = null;

function persistVolume(vol, immediate = true) {
  clearTimeout(persistTimer);
  const write = () => chrome.storage.local.set({ rl_volume: vol, rl_last_nonzero: lastNonZeroVol });
  if (immediate) write();
  else persistTimer = setTimeout(write, 120);
}

async function sendVolume(vol, { immediate = true } = {}) {
  const max = boostEnabled ? 300 : 100;
  vol = Math.max(0, Math.min(max, Math.round(vol)));
  updateDisplay(vol);
  persistVolume(vol, immediate);

  const tab = ytTab || await getYTTab();
  if (!tab) { setStatus("Open YouTube to control volume", ""); return; }
  ytTab = tab;

  try {
    await applyVolumeInPage(tab.id, vol);
    setStatus(
      vol > 100 ? `⚡ Boosted to ${vol}%` : `✓ Volume set to ${vol}%`,
      vol > 100 ? "warn" : "ok"
    );
  } catch (_) {
    setStatus("Reload YouTube page (Ctrl+Shift+R)", "err");
  }
}

// =============================================
//  EVENT LISTENERS
// =============================================

// rAF-gate the slider drag: some browsers fire many "input" events per
// frame while dragging, and each one used to trigger a fresh
// chrome.scripting.executeScript call — coalesce to at most one apply
// per frame, then flush storage immediately on release ("change").
let dragRaf     = null;
let pendingDrag = null;

volSlider.addEventListener("input", () => {
  pendingDrag = +volSlider.value;
  if (dragRaf) return;
  dragRaf = requestAnimationFrame(() => {
    dragRaf = null;
    sendVolume(pendingDrag, { immediate: false });
  });
});
volSlider.addEventListener("change", () => sendVolume(+volSlider.value, { immediate: true }));

// Scroll wheel on the volume display — mirrors the in-page widget.
volDisplay.addEventListener("wheel", e => {
  e.preventDefault();
  sendVolume(currentVol + (e.deltaY < 0 ? 5 : -5));
}, { passive: false });

// Mute / unmute — remembers the last non-zero volume.
muteBtn.addEventListener("click", () => {
  sendVolume(currentVol > 0 ? 0 : (lastNonZeroVol || 100));
});

// Arrow-key fine control anywhere in the popup that isn't a text field
// (Shift = fine step, plain = coarse step) — mirrors the in-page widget's
// arrow-key behavior so the popup doesn't need precise slider dragging.
document.addEventListener("keydown", e => {
  if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
  const tag = document.activeElement?.tagName?.toLowerCase();
  if (tag === "input" || tag === "textarea") return;
  e.preventDefault();
  const step = e.shiftKey ? 1 : 5;
  sendVolume(currentVol + (e.key === "ArrowUp" ? step : -step));
});

customInput.addEventListener("keydown", e => {
  e.stopPropagation();
  if (e.key === "Enter") {
    const val = parseInt(customInput.value);
    if (!isNaN(val)) sendVolume(val);
    customInput.value = "";
    customInput.blur();
  }
});
customInput.addEventListener("keyup",    e => e.stopPropagation());
customInput.addEventListener("keypress", e => e.stopPropagation());

boostToggle.addEventListener("change", async () => {
  boostEnabled = boostToggle.checked;
  boostRow.classList.toggle("active", boostEnabled);
  boostSub.textContent = boostEnabled
    ? "Active — up to 300% (use carefully)"
    : "Enable volume beyond 100%";

  applyMax();
  chrome.storage.local.set({ rl_boost: boostEnabled });

  const tab = ytTab || await getYTTab();
  if (tab) chrome.tabs.sendMessage(tab.id, { type: "SET_BOOST", enabled: boostEnabled }, () => {});

  if (!boostEnabled && currentVol > 100) sendVolume(100);
});

// =============================================
//  INIT
// =============================================

async function init() {
  const stored = await chrome.storage.local.get(["rl_volume", "rl_boost", "rl_last_nonzero"]);
  boostEnabled   = !!stored.rl_boost;
  lastNonZeroVol = stored.rl_last_nonzero ?? (stored.rl_volume > 0 ? stored.rl_volume : 100);

  boostToggle.checked = boostEnabled;
  boostRow.classList.toggle("active", boostEnabled);
  boostSub.textContent = boostEnabled
    ? "Active — up to 300% (use carefully)"
    : "Enable volume beyond 100%";

  rebuildPresets();

  const tab = await getYTTab();
  if (!tab) {
    setStatus("Open YouTube to control volume", "");
    updateDisplay(stored.rl_volume ?? 100);
    return;
  }
  ytTab = tab;

  // Read the volume straight from the player — the authoritative source,
  // not a value relayed through content.js that could be stale if the
  // relay hiccups (e.g. a change made by dragging the in-page widget).
  // The native player caps at 100 even while boosted, so trust our
  // tracked value instead when boost is on and the player reads ~100.
  let vol = stored.rl_volume ?? 100;
  const domVol = await readYTVolume(tab.id);
  if (domVol != null && !(boostEnabled && vol > 100 && domVol >= 99)) {
    vol = domVol;
  } else {
    // DOM read failed (e.g. player not ready yet) — fall back to asking
    // content.js, but don't let a stale/unresponsive content script
    // (e.g. right after an extension reload, before the tab is
    // refreshed) hold up the popup.
    try {
      const response = await Promise.race([
        chrome.tabs.sendMessage(tab.id, { type: 'GET_VOLUME' }),
        new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 300))
      ]);
      if (response?.volume != null) vol = response.volume;
    } catch (_) {}
  }
  updateDisplay(vol);
  setStatus(tab.__background ? "🎧 Controlling YouTube in a background tab" : "Ready — adjust below", "ok");
}

init();