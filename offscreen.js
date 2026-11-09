// Offscreen document: holds the captured tab streams and their Web Audio graphs.
// Graph per tab: source -> gain -> [limiter] -> destination

const MAX_GAIN = 6;
const sessions = new Map(); // tabId -> { stream, ctx, source, gain, limiter, limiterOn, level }

const clamp = (v) => Math.max(0, Math.min(MAX_GAIN, Number.isFinite(Number(v)) ? Number(v) : 1));

function stateOf(tabId) {
  const s = sessions.get(tabId);
  if (!s) return { active: false };
  return { active: true, gain: s.level, limiter: s.limiterOn };
}

function wire(s) {
  s.source.disconnect();
  s.gain.disconnect();
  s.limiter.disconnect();
  s.source.connect(s.gain);
  if (s.limiterOn) {
    s.gain.connect(s.limiter);
    s.limiter.connect(s.ctx.destination);
  } else {
    s.gain.connect(s.ctx.destination);
  }
}

function setGain(s, value) {
  s.level = clamp(value);
  // Short ramp avoids clicks when dragging the slider.
  s.gain.gain.setTargetAtTime(s.level, s.ctx.currentTime, 0.015);
}

async function start(tabId, streamId, gain, limiterOn) {
  if (sessions.has(tabId)) {
    setGain(sessions.get(tabId), gain);
    return stateOf(tabId);
  }
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { mandatory: { chromeMediaSource: 'tab', chromeMediaSourceId: streamId } },
    video: false
  });

  const ctx = new AudioContext({ latencyHint: 'interactive' });
  const source = ctx.createMediaStreamSource(stream);
  const gainNode = ctx.createGain();
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -2;
  limiter.knee.value = 0;
  limiter.ratio.value = 20;
  limiter.attack.value = 0.002;
  limiter.release.value = 0.2;

  const level = clamp(gain);
  gainNode.gain.value = level;
  const s = { stream, ctx, source, gain: gainNode, limiter, limiterOn: limiterOn !== false, level };
  sessions.set(tabId, s);
  wire(s);

  stream.getAudioTracks().forEach((t) =>
    t.addEventListener('ended', () => {
      if (sessions.get(tabId) !== s) return;
      stop(tabId);
      chrome.runtime.sendMessage({ target: 'background', type: 'capture-ended', tabId, remaining: sessions.size });
    })
  );
  return stateOf(tabId);
}

function stop(tabId) {
  const s = sessions.get(tabId);
  if (!s) return;
  sessions.delete(tabId);
  s.stream.getTracks().forEach((t) => t.stop());
  s.ctx.close().catch(() => {});
}

async function handle(msg) {
  const s = sessions.get(msg.tabId);
  switch (msg.type) {
    case 'get-state':
      return stateOf(msg.tabId);
    case 'start':
      return start(msg.tabId, msg.streamId, msg.gain, msg.limiter);
    case 'set-gain':
      if (s) setGain(s, msg.gain);
      return stateOf(msg.tabId);
    case 'set-limiter':
      if (s) { s.limiterOn = !!msg.limiter; wire(s); }
      return stateOf(msg.tabId);
    case 'stop':
      stop(msg.tabId);
      return { active: false, remaining: sessions.size };
  }
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.target !== 'offscreen') return;
  handle(msg).then(sendResponse, (err) => sendResponse({ error: String(err?.message || err) }));
  return true;
});
