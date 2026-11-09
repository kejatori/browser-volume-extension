const $ = (id) => document.getElementById(id);
const slider = $('slider'), valueEl = $('value'), statusEl = $('status');
const limiterEl = $('limiter'), stopBtn = $('stop'), errorEl = $('error');

let tab = null;
let active = false;
let starting = null; // in-flight start, so rapid slider events only start capture once

const send = (msg) => chrome.runtime.sendMessage({ ...msg, target: 'background' });

function showError(text) {
  errorEl.textContent = text || '';
  errorEl.hidden = !text;
}

function render(state) {
  active = !!state?.active;
  statusEl.textContent = active ? 'On' : 'Off';
  statusEl.classList.toggle('on', active);
  stopBtn.disabled = !active;
  if (active) {
    const pct = Math.round(state.gain * 100);
    slider.value = pct;
    valueEl.textContent = pct;
    limiterEl.checked = state.limiter;
  }
}

function friendly(err) {
  const m = String(err?.message || err);
  if (/chrome:\/\/|chrome pages|cannot be captured|not been invoked|webstore/i.test(m)) {
    return "This page can't be captured (browser pages and the extension store are off limits).";
  }
  if (/active stream|already/i.test(m)) {
    return 'This tab is already being captured by another extension or app.';
  }
  return m;
}

async function startCapture(gain) {
  if (!starting) {
    starting = (async () => {
      const streamId = await chrome.tabCapture.getMediaStreamId({ targetTabId: tab.id });
      const res = await send({ type: 'start', tabId: tab.id, streamId, gain, limiter: limiterEl.checked });
      if (res?.error) throw new Error(res.error);
      return res;
    })().finally(() => { starting = null; });
  }
  return starting;
}

async function apply(pct) {
  showError('');
  valueEl.textContent = pct;
  try {
    if (!active) {
      render(await startCapture(pct / 100));
    }
    // Always push the latest slider value (it may have moved while capture was starting).
    const res = await send({ type: 'set-gain', tabId: tab.id, gain: Number(slider.value) / 100 });
    if (res?.error) throw new Error(res.error);
    render(res);
  } catch (err) {
    showError(friendly(err));
    render({ active: false });
  }
}

slider.addEventListener('input', () => apply(Number(slider.value)));

document.querySelectorAll('.presets button').forEach((b) =>
  b.addEventListener('click', () => {
    slider.value = b.dataset.v;
    apply(Number(b.dataset.v));
  })
);

limiterEl.addEventListener('change', async () => {
  if (active) render(await send({ type: 'set-limiter', tabId: tab.id, limiter: limiterEl.checked }));
});

stopBtn.addEventListener('click', async () => {
  render(await send({ type: 'stop', tabId: tab.id }));
  slider.value = 100;
  valueEl.textContent = 100;
});

(async () => {
  [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  render(await send({ type: 'get-state', tabId: tab.id }));
})();
