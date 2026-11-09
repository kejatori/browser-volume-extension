// Service worker: owns the offscreen document and relays popup commands to it.

let creating = null;

async function ensureOffscreen() {
  if (await chrome.offscreen.hasDocument()) return;
  if (!creating) {
    creating = chrome.offscreen.createDocument({
      url: 'offscreen.html',
      reasons: ['USER_MEDIA'],
      justification: 'Process captured tab audio through a gain node to boost volume.'
    }).finally(() => { creating = null; });
  }
  await creating;
}

function toOffscreen(msg) {
  return chrome.runtime.sendMessage({ ...msg, target: 'offscreen' });
}

function setBadge(tabId, gain) {
  if (gain == null) {
    chrome.action.setBadgeText({ tabId, text: '' }).catch(() => {});
    return;
  }
  const pct = Math.round(gain * 100);
  chrome.action.setBadgeText({ tabId, text: String(pct) }).catch(() => {});
  chrome.action.setBadgeBackgroundColor({
    tabId,
    color: pct > 100 ? '#d9480f' : pct < 100 ? '#1971c2' : '#495057'
  }).catch(() => {});
}

async function handle(msg) {
  switch (msg.type) {
    case 'get-state': {
      if (!(await chrome.offscreen.hasDocument())) return { active: false };
      return toOffscreen({ type: 'get-state', tabId: msg.tabId });
    }
    case 'start': {
      await ensureOffscreen();
      const res = await toOffscreen(msg);
      if (res?.active) setBadge(msg.tabId, res.gain);
      return res;
    }
    case 'set-gain':
    case 'set-limiter': {
      if (!(await chrome.offscreen.hasDocument())) return { active: false };
      const res = await toOffscreen(msg);
      if (res?.active) setBadge(msg.tabId, res.gain);
      return res;
    }
    case 'stop': {
      setBadge(msg.tabId, null);
      if (!(await chrome.offscreen.hasDocument())) return { active: false };
      const res = await toOffscreen(msg);
      if (res?.remaining === 0) await chrome.offscreen.closeDocument().catch(() => {});
      return { active: false };
    }
    case 'capture-ended': {
      // Sent by the offscreen doc when a captured stream ends on its own.
      setBadge(msg.tabId, null);
      if (msg.remaining === 0) await chrome.offscreen.closeDocument().catch(() => {});
      return;
    }
  }
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.target !== 'background') return;
  handle(msg).then(sendResponse, (err) => sendResponse({ error: String(err?.message || err) }));
  return true;
});

chrome.tabs.onRemoved.addListener(async (tabId) => {
  if (await chrome.offscreen.hasDocument()) {
    handle({ type: 'stop', tabId }).catch(() => {});
  }
});
