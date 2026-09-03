// RELAXLIKES Volume+ — popup.js

// Load the custom font asynchronously so it never blocks the popup's
// initial paint (extension pages also forbid the old onload="" attribute
// trick — inline event handlers violate the default CSP).
const fontLink = document.createElement("link");
fontLink.rel  = "stylesheet";
fontLink.href = "https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=Syne:wght@500;700;800&display=swap";
document.head.appendChild(fontLink);

const volNum       = document.getElementById("volNum");
const volDisplay   = document.querySelector(".vol-display");
const volSlider    = document.getElementById("volSlider");
const customInput  = document.getElementById("customInput");
const customMax    = document.getElementById("customMax");
const boostToggle  = document.getElementById("boostToggle");
const boostRow     = document.getElementById("boostRow");
const boostSub     = document.getElementById("boostSub");
const sliderLabels = document.getElementById("sliderLabels");
const status       = document.getElementById("status");
const presetRow    = document.getElementById("presetRow");

function getPresets() {
  return document.querySelectorAll(".preset");
}

let currentVol   = 100;
let boostEnabled = false;
let ytTab        = null;

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

  // Animated number
  animateNumber(prev, vol);

  // Color class
  volNum.className   = vol > 100 ? "vol-num danger" : vol === 0 ? "vol-num" : "vol-num normal";

  // Display card glow when boosted
  volDisplay.classList.toggle("boosted", vol > 100);

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
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const tab  = tabs[0];
  return tab?.url?.includes("youtube.com") ? tab : null;
}

// =============================================
//  SET volume via executeScript (MAIN world)
// =============================================

async function applyVolumeInPage(tabId, vol) {
  const nativeVol = Math.min(vol, 100);

  await chrome.scripting.executeScript({
    target: { tabId },
    func: (volume) => {
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
    },
    args: [nativeVol]
  });

  chrome.tabs.sendMessage(tabId, { type: "SET_VOLUME", volume: vol }, () => {});
}

// =============================================
//  SEND VOLUME
// =============================================

async function sendVolume(vol) {
  const max = boostEnabled ? 300 : 100;
  vol = Math.max(0, Math.min(max, Math.round(vol)));
  updateDisplay(vol);

  // Persist immediately from the popup itself — don't rely solely on
  // content.js relaying it back, since that message silently fails
  // when content.js isn't alive on the tab (e.g. right after the
  // extension reloads, before the YouTube page is refreshed).
  chrome.storage.local.set({ rl_volume: vol });

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

volSlider.addEventListener("input", () => sendVolume(+volSlider.value));

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
  const stored = await chrome.storage.local.get(["rl_volume", "rl_boost"]);
  boostEnabled = !!stored.rl_boost;

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

  // Ask content.js for the authoritative tracked volume — but don't let a
  // stale/unresponsive content script (e.g. right after an extension
  // reload, before the tab is refreshed) hold up the popup.
  let vol = stored.rl_volume ?? 100;
  try {
    const response = await Promise.race([
      chrome.tabs.sendMessage(tab.id, { type: 'GET_VOLUME' }),
      new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 300))
    ]);
    if (response?.volume != null) vol = response.volume;
  } catch (_) {}
  updateDisplay(vol);
  setStatus("Ready — adjust below", "ok");
}

init();