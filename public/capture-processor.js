// Captures small PCM blocks continuously, including audio BEFORE voice detection.
// Audio samples stay inside this browser tab (they are not sent over the network).
class EchoCaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.frame = new Float32Array(2048);
    this.offset = 0;
  }

  process(inputs, outputs) {
    const input = inputs[0];
    const samples = input && input[0];
    const output = outputs[0];
    if (output) {
      for (const channel of output) channel.fill(0);
    }
    if (!samples) return true;
    let i = 0;
    while (i < samples.length) {
      const count = Math.min(this.frame.length - this.offset, samples.length - i);
      this.frame.set(samples.subarray(i, i + count), this.offset);
      this.offset += count;
      i += count;
      if (this.offset === this.frame.length) {
        this.port.postMessage(this.frame, [this.frame.buffer]);
        this.frame = new Float32Array(2048);
        this.offset = 0;
      }
    }
    return true;
  }
}
registerProcessor('echo-capture-processor', EchoCaptureProcessor);
