# Volume Booster

A Chrome / Edge / Brave extension (Manifest V3) that boosts the volume of any audio or video playing in a tab, from 0% up to 600%.

## Install (unpacked)

1. Open `chrome://extensions` (or `edge://extensions`).
2. Turn on **Developer mode**.
3. Click **Load unpacked** and select this folder.
4. Pin the extension, open a tab with audio, click the icon and drag the slider.

## How it works

- The popup calls `chrome.tabCapture.getMediaStreamId` for the active tab.
- An offscreen document opens that stream and routes it through a Web Audio graph:
  `tab audio -> GainNode -> DynamicsCompressor (limiter, optional) -> speakers`.
- It captures the tab's whole audio output, so it works on every site, including cross-origin players, iframes and embedded media.
- The toolbar badge shows the current level for each tab. Closing the tab, or clicking **Turn off for this tab**, releases the capture.

## Notes

- Browser pages (`chrome://`, the Web Store) can't be captured.
- While a tab is boosted, Chrome may show a capture indicator on it. That's normal with `tabCapture`.
- At high boost the limiter keeps peaks from distorting harshly. Turn it off for raw gain.
