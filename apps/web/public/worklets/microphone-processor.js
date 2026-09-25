const TARGET_SAMPLE_RATE = 16000;
const CHUNK_SAMPLES = 1600;
const LEVEL_SAMPLES = 960;
const SOFT_CLIP_THRESHOLD = 0.7;

class MicrophoneProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    this.gain = options.processorOptions?.inputGain ?? 3;
    this.position = 0;
    this.previous = 0;
    this.chunk = [];
    this.level = [];
    this.port.onmessage = ({ data }) => {
      if (data.type === "gain") this.gain = data.value;
    };
  }

  clip(sample) {
    const magnitude = Math.abs(sample);
    if (magnitude <= SOFT_CLIP_THRESHOLD) return sample;
    const headroom = 1 - SOFT_CLIP_THRESHOLD;
    return (
      Math.sign(sample) *
      (SOFT_CLIP_THRESHOLD +
        headroom * Math.tanh((magnitude - SOFT_CLIP_THRESHOLD) / headroom))
    );
  }

  emit(sample) {
    const processed = this.clip(sample * this.gain);
    this.chunk.push(processed);
    this.level.push(processed);
    if (this.chunk.length === CHUNK_SAMPLES) {
      const buffer = new ArrayBuffer(CHUNK_SAMPLES * 2);
      const view = new DataView(buffer);
      this.chunk.forEach((value, index) =>
        view.setInt16(
          index * 2,
          Math.max(
            -32768,
            Math.min(32767, Math.round(value * (value < 0 ? 32768 : 32767))),
          ),
          true,
        ),
      );
      this.port.postMessage({ type: "chunk", chunk: buffer }, [buffer]);
      this.chunk = [];
    }
    if (this.level.length >= LEVEL_SAMPLES) {
      const rms = Math.sqrt(
        this.level.reduce((sum, value) => sum + value * value, 0) /
          this.level.length,
      );
      const db = 20 * Math.log10(Math.max(rms, 1e-6));
      this.port.postMessage({
        type: "level",
        level: Math.max(0, Math.min(1, (db + 60) / 60)),
      });
      this.level = [];
    }
    return processed;
  }

  process(inputs, outputs) {
    const input = inputs[0]?.[0];
    const output = outputs[0]?.[0];
    if (!input) return true;
    if (output) {
      for (let i = 0; i < input.length; i += 1)
        output[i] = this.clip(input[i] * this.gain);
    }
    const ratio = sampleRate / TARGET_SAMPLE_RATE;
    while (this.position < input.length) {
      const left = Math.floor(this.position);
      const right = Math.min(left + 1, input.length - 1);
      const fraction = this.position - left;
      const sample =
        (input[left] ?? this.previous) * (1 - fraction) +
        input[right] * fraction;
      this.emit(sample);
      this.position += ratio;
    }
    this.position -= input.length;
    this.previous = input[input.length - 1];
    return true;
  }
}

registerProcessor("microphone-processor", MicrophoneProcessor);
