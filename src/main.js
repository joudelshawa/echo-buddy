import { processOffline } from '@soundtouchjs/audio-worklet';
import processorUrl from '@soundtouchjs/audio-worklet/processor?url';

// Echo Buddy v2: keep a pre-roll buffer so we don't lose first syllables,
// then render each pitch/speed change OFFLINE to avoid real-time playback gaps.
const $ = (selector) => document.querySelector(selector);
const stage = $('#stage');
const statusText = $('#statusText');
const helperText = $('#helperText');
const listenBtn = $('#listenBtn');
const listenLabel = $('#listenLabel');
const replayBtn = $('#replayBtn');
const pitchSlider = $('#pitch');
const speedSlider = $('#speed');
const showCharacterToggle = $('#showCharacter');

const PRE_ROLL_MS = 650;          // Save audio before detecting speech
const SILENCE_MS = 900;          // Detect the end of a phrase
const MIN_RECORDING_MS = 300;
const MAX_RECORDING_MS = 12000;
const COOLDOWN_MS = 550;         // Don't capture our own playback tail
const AFTER_SPEECH_MS = 240;     // Keep a bit after the last word
const CAPTURE_BLOCK_SIZE = 2048;

let audioContext = null;
let captureWorkletRegistered = false;
let micStream = null;
let microphoneSource = null;
let captureNode = null;
let silentMonitor = null;
let mode = 'off';
let enabled = false;
let sessionId = 0;
let noiseFloor = 0.004;
let loudBlocks = 0;
let lastLoudAt = 0;
let recordingStartedAt = 0;
let cooldownUntil = 0;
let preRoll = [];
let preRollSamples = 0;
let recordingChunks = [];
let recordedSamples = 0;
let lastVoiceSample = 0;
let lastBuffer = null;
let playback = null;
let playbackRequestId = 0;

function showStatus(nextMode, message, detail) {
  mode = nextMode;
  stage.dataset.mode = nextMode;
  statusText.textContent = message;
  if (detail) helperText.textContent = detail;
  listenLabel.textContent = enabled ? 'Stop listening' : 'Start listening';
  listenBtn.classList.toggle('stop-btn', enabled);
  replayBtn.disabled = !lastBuffer || nextMode === 'recording' || nextMode === 'processing';
}

function showError(message) {
  showStatus(enabled ? 'idle' : 'off', 'Something went wrong', message);
}

function getPitch() { return Number(pitchSlider.value); }
function getSpeed() { return Number(speedSlider.value); }

function updateControls() {
  $('#pitchValue').textContent = `${getPitch().toFixed(2)}×`;
  $('#speedValue').textContent = `${getSpeed().toFixed(2)}×`;
  // Audio is rendered in advance. The new setting applies on the next
  // automatic repeat or when Replay is clicked, rather than mid-sentence.
}
pitchSlider.addEventListener('input', updateControls);
speedSlider.addEventListener('input', updateControls);
showCharacterToggle.addEventListener('change', () => {
  stage.dataset.character = showCharacterToggle.checked ? 'on' : 'off';
});
updateControls();

async function ensureAudioEngine() {
  if (!audioContext || audioContext.state === 'closed') {
    audioContext = new AudioContext();
  }
  if (audioContext.state === 'suspended') await audioContext.resume();
}

function clearCapture() {
  preRoll = [];
  preRollSamples = 0;
  recordingChunks = [];
  recordedSamples = 0;
  lastVoiceSample = 0;
  loudBlocks = 0;
}

async function startListening() {
  const currentSession = ++sessionId;
  enabled = true;
  listenBtn.disabled = true;
  showStatus('idle', 'Setting up microphone…', 'Allow microphone access when your browser asks.');
  try {
    if (!navigator.mediaDevices?.getUserMedia || !window.AudioWorkletNode) {
      throw new Error('This browser needs microphone and AudioWorklet support. Try recent Chrome or Edge.');
    }
    await ensureAudioEngine();
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
      video: false,
    });
    if (!enabled || currentSession !== sessionId) {
      stream.getTracks().forEach(track => track.stop());
      return;
    }
    micStream = stream;
    // Unlike starting MediaRecorder AFTER detecting speech, this processor
    // captures continuously and keeps a 650ms circular pre-roll in memory.
    if (!captureWorkletRegistered) {
      await audioContext.audioWorklet.addModule(
        `${import.meta.env.BASE_URL}capture-processor.js`
      );
      captureWorkletRegistered = true;
    }
    if (!enabled || currentSession !== sessionId) {
      closeMicrophone();
      return;
    }
    microphoneSource = audioContext.createMediaStreamSource(micStream);
    captureNode = new AudioWorkletNode(audioContext, 'echo-capture-processor', {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [1],
    });
    captureNode.port.onmessage = (event) => handleCapturedAudio(event.data);
    silentMonitor = audioContext.createGain();
    silentMonitor.gain.value = 0;  // Never play the live microphone through speakers
    microphoneSource.connect(captureNode);
    captureNode.connect(silentMonitor);
    silentMonitor.connect(audioContext.destination);
    clearCapture();
    noiseFloor = 0.004;
    cooldownUntil = performance.now() + 250;
    showStatus('idle', 'Listening for your voice', 'Speak naturally, then pause. Echo Buddy will repeat you automatically.');
  } catch (error) {
    if (currentSession !== sessionId) return;
    enabled = false;
    showError(error.message || 'Could not access the microphone. Check permissions.');
    closeMicrophone();
  } finally {
    listenBtn.disabled = false;
    listenLabel.textContent = enabled ? 'Stop listening' : 'Start listening';
  }
}

function calculateRms(frame) {
  let sum = 0;
  for (let i = 0; i < frame.length; i++) sum += frame[i] * frame[i];
  return Math.sqrt(sum / frame.length);
}

function pushPreRoll(frame) {
  preRoll.push(frame);
  preRollSamples += frame.length;
  const maxSamples = Math.ceil((PRE_ROLL_MS / 1000) * audioContext.sampleRate);
  while (preRollSamples > maxSamples + CAPTURE_BLOCK_SIZE && preRoll.length > 1) {
    preRollSamples -= preRoll.shift().length;
  }
}

function addRecordingFrame(frame) {
  recordingChunks.push(frame);
  recordedSamples += frame.length;
}

function handleCapturedAudio(frame) {
  if (!enabled || !(frame instanceof Float32Array)) return;
  const now = performance.now();
  if ((mode !== 'idle' && mode !== 'recording') || now < cooldownUntil) return;

  const rms = calculateRms(frame);
  const threshold = Math.max(0.012, noiseFloor * 2.8);
  const loud = rms > threshold;

  if (mode === 'idle') {
    // Keep rolling microphone audio even while waiting for a voice.
    pushPreRoll(frame);
    if (!loud) noiseFloor = noiseFloor * 0.992 + rms * 0.008;
    loudBlocks = loud ? loudBlocks + 1 : 0;
    if (loudBlocks >= 2) {
      recordingChunks = preRoll;
      recordedSamples = preRollSamples;
      preRoll = [];
      preRollSamples = 0;
      lastVoiceSample = recordedSamples;
      recordingStartedAt = now;
      lastLoudAt = now;
      showStatus('recording', 'I’m listening!', 'Finish your sentence, then pause for about a second.');
    }
    return;
  }

  addRecordingFrame(frame);
  if (loud) {
    lastLoudAt = now;
    lastVoiceSample = recordedSamples;
  }
  const finished = (now - lastLoudAt >= SILENCE_MS && now - recordingStartedAt >= MIN_RECORDING_MS) ||
                   now - recordingStartedAt >= MAX_RECORDING_MS;
  if (finished) finishRecording();
}

function createRecordingBuffer(chunks, sampleCount) {
  // Trim the long end-of-speech detection silence to ~240ms; retain pre-roll.
  const keepSamples = Math.min(sampleCount, lastVoiceSample + Math.floor(AFTER_SPEECH_MS * audioContext.sampleRate / 1000));
  const buffer = audioContext.createBuffer(1, Math.max(1, keepSamples), audioContext.sampleRate);
  const pcm = buffer.getChannelData(0);
  let offset = 0;
  for (const chunk of chunks) {
    if (offset >= pcm.length) break;
    const count = Math.min(chunk.length, pcm.length - offset);
    pcm.set(chunk.subarray(0, count), offset);
    offset += count;
  }
  // Small fade eliminates sharp clicks at the boundaries.
  const fadeSamples = Math.min(Math.floor(audioContext.sampleRate * 0.012), Math.floor(pcm.length / 3));
  for (let i = 0; i < fadeSamples; i++) {
    pcm[i] *= i / fadeSamples;
    pcm[pcm.length - 1 - i] *= i / fadeSamples;
  }
  return buffer;
}

function finishRecording() {
  if (mode !== 'recording' || !recordingChunks.length) return;
  const chunks = recordingChunks;
  const sampleCount = recordedSamples;
  const buffer = createRecordingBuffer(chunks, sampleCount);
  clearCapture();
  lastBuffer = buffer;
  showStatus('processing', 'Making your silly voice…', 'Rendering audio smoothly before playback.');
  playAudio(buffer).catch((error) => {
    if (!enabled) return;
    showError('Playback failed: ' + (error.message || 'Try another phrase.'));
    cooldownUntil = performance.now() + COOLDOWN_MS;
    showStatus('idle', 'Listening for your voice', 'Try speaking again.');
  });
}

// Extra edge padding protects consonants and allows the pitch processor
// to finish its last blocks without cutting off the audio tail.
function padAudio(input) {
  const leading = Math.round(input.sampleRate * 0.15);
  const trailing = Math.round(input.sampleRate * 0.35);
  const padded = audioContext.createBuffer(1, leading + input.length + trailing, input.sampleRate);
  padded.getChannelData(0).set(input.getChannelData(0), leading);
  return padded;
}

function stopPlayback() {
  playbackRequestId += 1; // Invalidate any offline render still in progress.
  if (!playback) return;
  const old = playback;
  playback = null;
  old.source.onended = null;
  try { old.source.stop(); } catch {}
  old.source.disconnect();
  old.gain.disconnect();
}

async function playAudio(buffer, currentSession = sessionId) {
  await ensureAudioEngine();
  if (currentSession !== sessionId) return;
  stopPlayback();
  const requestId = playbackRequestId;
  const pitch = getPitch();
  const speed = getSpeed();
  showStatus('processing', 'Making your silly voice…', 'Preparing smooth playback.');
  const processed = await processOffline({
    input: padAudio(buffer),
    processorUrl,
    pitch,
    playbackRate: speed,
    stretchParameters: { overlapMs: 12 },
  });
  if (requestId !== playbackRequestId || currentSession !== sessionId) return;
  const source = audioContext.createBufferSource();
  const gain = audioContext.createGain();
  source.buffer = processed;
  gain.gain.value = 0.94;
  source.connect(gain);
  gain.connect(audioContext.destination);
  const item = { source, gain };
  playback = item;
  clearCapture();
  showStatus('playing', 'Repeating!', 'Change pitch or speed, then press Replay to hear the new setting.');
  source.onended = () => {
    if (playback !== item) return;
    playback = null;
    source.disconnect();
    gain.disconnect();
    cooldownUntil = performance.now() + COOLDOWN_MS;
    clearCapture();
    if (enabled) {
      showStatus('idle', 'Listening for your voice', 'Your turn! Say another phrase.');
    } else {
      showStatus('off', 'Mic is off', 'Press Start listening or Replay your last phrase.');
    }
  };
  source.start();
}

function closeMicrophone() {
  captureNode && (captureNode.port.onmessage = null);
  microphoneSource?.disconnect();
  captureNode?.disconnect();
  silentMonitor?.disconnect();
  microphoneSource = null;
  captureNode = null;
  silentMonitor = null;
  micStream?.getTracks().forEach(track => track.stop());
  micStream = null;
  clearCapture();
}

function stopListening() {
  enabled = false;
  sessionId++;
  closeMicrophone();
  stopPlayback();
  showStatus('off', 'Mic is off', 'Your microphone is stopped. You can still replay the last phrase.');
}

listenBtn.addEventListener('click', () => enabled ? stopListening() : startListening());
replayBtn.addEventListener('click', async () => {
  if (!lastBuffer || mode === 'recording' || mode === 'processing') return;
  try { await playAudio(lastBuffer); }
  catch (error) { showError('Could not play that recording: ' + (error.message || 'Try again.')); }
});
window.addEventListener('pagehide', stopListening);
