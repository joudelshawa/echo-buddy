# Echo Buddy v2 — smoother audio + no missing first words

This updates the first MVP while preserving the same interface, animated cactus, waveform mode, pitch/speed controls, replay, and automatic listening.

## Changes in this version

- **Pre-roll capture:** A small AudioWorklet records microphone PCM continuously, holding the latest ~650ms in memory even before it detects speech. Once it detects speech it includes this audio, so the opening consonant/word isn't lost.
- **Offline processing:** The recorded phrase is transformed into an AudioBuffer with SoundTouchJS's `processOffline`, and *then* played normally. This eliminates real-time processing buffer starvation during playback. Note: any inherent artifacts from extreme pitch/time stretching can still happen.
- **Audio edges:** Adds quiet padding before and after processing and fades audio ends to reduce cuts/clicks.
- **Gentler defaults:** Pitch 1.35x, speed 1.0x for cleaner results. Try pitch 1.25–1.5x and speed 0.95–1.10x first.
- **Pitch and speed sliders remain separate**, but changes now take effect on the **next repeat / when you click Replay**, not halfway through the current sentence.

## How to run locally

Requires Node.js 22+ and a current Chrome or Edge browser.

```bash
npm install
npm run dev
```

Then go to **http://127.0.0.1:5173** and press **Start listening**.

If an older dev server is still running, stop it using Ctrl+C, then start this V2 folder instead. If Vite chooses another port, use the URL printed in your terminal.

## Quick test

1. Test with **pitch 1.00x, speed 1.00x** and say "Hello, can you hear the beginning of this sentence?" after the app says "Listening for your voice."
2. Repeat with **pitch 1.35x, speed 1.00x**, then 1.50x.
3. Press **Replay** after adjusting either slider; V2 re-renders the audio with your new settings.
4. For cleaner recording, use headphones. The app ignores mic audio during playback, but speakers can still cause echo and noise.

## Privacy, compatibility & limits

- Microphone input never goes to a server. Samples are processed in the browser and held in memory only.
- No AI APIs or Python are needed.
- This is a small prototype; simple volume-based speech detection can still be triggered by background noises and may miss very quiet speech.
- On slower devices, offline transformation can add a short *processing delay* before playback (rather than choppy audio).
- SoundTouch is an audio effect; large pitch changes inherently can sound synthetic.
- Mobile microphones generally require HTTPS or `localhost` (on the phone itself). Network IP URLs accessed from a phone are not normally considered secure contexts.

## Files

- `index.html`: app UI
- `src/style.css`: responsive design and character animations
- `src/main.js`: pre-roll logic, playback processing and UI states
- `public/capture-processor.js`: tiny, always-on microphone AudioWorklet for pre-roll

The project is built on SoundTouchJS (`@soundtouchjs/audio-worklet`, MPL-2.0).
