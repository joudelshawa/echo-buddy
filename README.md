# Echo Buddy

A tiny, privacy-conscious web app that automatically listens to short phrases, waits for a pause, and repeats them in an adjustable silly voice. It includes a dancing animated cactus, plus a setting to replace the character with a waveform.

## Run locally

1. Install Node.js 22 or newer from https://nodejs.org/ if you do not have it already.
2. Download and unzip this project.
3. Open a terminal in the `echo-buddy-mvp` project folder.
4. Run:

   ```bash
   npm install
   npm run dev
   ```

5. Open **http://127.0.0.1:5173** on your computer.
6. Press **Start listening**, allow microphone access, say a phrase, and pause.

To shut it down, press **Ctrl + C** in the terminal.

**Tip for beginners:** If you're on a Mac, open Terminal, type `cd ` (with one trailing space), drag the unzipped project folder into Terminal, then press Enter. Now run the two commands above.

## Controls

- **Start/Stop listening:** Mic permission is requested only when starting.
- **Pitch:** High = squeakier, low = deeper; independent of playback speed.
- **Speed:** Talk faster or slower; independent of pitch.
- **Character switch:** Hide the dancing cactus and show animated sound waves instead.
- **Replay:** Repeat the most recent recording with current slider settings. Still works when the mic is stopped.

## How it works

- `getUserMedia` asks for permission to use your microphone.
- An `AnalyserNode` checks whether sound is present (RMS threshold, *not* transcription).
- `MediaRecorder` captures the short phrase until 950ms of silence, or 10s maximum.
- SoundTouchJS AudioWorklet processes the recording with independent pitch and speed controls.
- The sound is replayed locally; it is **not uploaded** and **not stored to a server**. It is held only in page memory until the tab closes.

## Known MVP limitations

- Background noise and very soft speech may cause false starts or missed starts. This uses a simple sound-level detector, not advanced voice recognition.
- The first few dozen milliseconds of speech may be cut off because recording starts when speech is detected. Pre-roll buffering is a possible improvement.
- For the cleanest result, use **headphones**, since speakers can trigger your mic again. The app pauses detection while its own voice plays and waits briefly before listening again.
- Some browsers/devices choose different recording formats. Start with current Chrome or Edge on desktop. Other browsers should work if they support `MediaRecorder`, `AudioWorklet` and recording decoding, but compatibility has not been hardware-tested.
- The character's mouth and dance animation indicate the playback state; the mouth doesn't track exact speech phonemes.
- Opening a phone browser directly to your computer's LAN IP may fail to get microphone permission. Browsers require a **secure context** (HTTPS or localhost). Phone testing generally needs HTTPS, a secure tunnel, or local developer setup; it is a later testing step.
- Google Fonts is used for visual styling, but the app still works with system fonts without internet after packages are installed.

## Files

- `index.html`: controls, character markup, accessibility text.
- `src/style.css`: responsive UI, cactus and waveform animations.
- `src/main.js`: recording, speech-pause logic, audio playback, and UI state.

## Safety and privacy

The app asks for mic access on Start, stops microphone tracks when Stop is pressed, and does not contact any transcription/AI service. No recordings are uploaded or intentionally persisted.
