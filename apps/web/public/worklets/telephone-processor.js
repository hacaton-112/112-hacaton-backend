const TELEPHONE_HIGH_PASS_HZ = 320;
const TELEPHONE_LOW_PASS_HZ = 1800;
const COMPRESSOR_THRESHOLD = 0.1;
const COMPRESSOR_RATIO = 0.45;
const TELEPHONE_DRIVE = 1.2;
const OUTPUT_GAIN = 0.88;
const TELEPHONE_OUTPUT_LIMIT = 0.92;
const INTERFERENCE_NOISE_LEVEL = 0.045;
const INTERFERENCE_CRACKLE_LEVEL = 0.1;
const STARTUP_BUFFER_MS = 160;

class TelephoneProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    this.sourceRate = options.processorOptions.sampleRate;
    this.volume = options.processorOptions.volume ?? 1;
    this.generation = options.processorOptions.generation;
    this.queue = [];
    this.offset = 0;
    this.phase = 0;
    this.current = 0;
    this.finished = false;
    this.started = false;
    this.previousInput = 0;
    this.hp = 0;
    this.previousHp = 0;
    this.hp2 = 0;
    this.lp = 0;
    this.lp2 = 0;
    this.noiseState =
      (Date.now() ^ this.sourceRate ^ 0x9e3779b9) >>> 0 || 0x6d2b79f5;
    this.wait = Math.floor(sampleRate / 2);
    this.remaining = 0;
    this.iPrevious = 0;
    this.iHp = 0;
    this.iLp = 0;
    const dt = 1 / sampleRate;
    const hpRc = 1 / (2 * Math.PI * TELEPHONE_HIGH_PASS_HZ);
    const lpRc = 1 / (2 * Math.PI * TELEPHONE_LOW_PASS_HZ);
    this.hpAlpha = hpRc / (hpRc + dt);
    this.lpAlpha = dt / (lpRc + dt);
    this.levelSamples = [];
    this.port.onmessage = ({ data }) => {
      if (data.type === "pcm") {
        const view = new DataView(data.chunk);
        const samples = new Float32Array(view.byteLength / 2);
        for (let i = 0; i < samples.length; i += 1)
          samples[i] = view.getInt16(i * 2, true) / 32768;
        this.queue.push(samples);
      } else if (data.type === "finish") this.finished = true;
      else if (data.type === "volume") this.volume = data.value;
    };
  }
  random() {
    let x = this.noiseState;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    this.noiseState = x >>> 0;
    return this.noiseState;
  }
  signed() {
    return (this.random() / 0xffffffff) * 2 - 1;
  }
  interference() {
    if (this.remaining > 0) {
      this.remaining -= 1;
      const crackle =
        this.random() % 41 === 0
          ? Math.sign(this.signed()) * INTERFERENCE_CRACKLE_LEVEL
          : 0;
      const input = this.signed() * INTERFERENCE_NOISE_LEVEL + crackle;
      const hp = this.hpAlpha * (this.iHp + input - this.iPrevious);
      this.iPrevious = input;
      this.iHp = hp;
      this.iLp += this.lpAlpha * (hp - this.iLp);
      return Math.max(-0.12, Math.min(0.12, this.iLp));
    }
    if (this.wait-- > 0) return 0;
    const duration =
      this.random() % 5 === 0
        ? 450 + (this.random() % 1051)
        : 45 + (this.random() % 256);
    this.remaining = Math.floor((sampleRate * duration) / 1000);
    this.wait = Math.floor(
      (sampleRate * (800 + (this.random() % 2400))) / 1000,
    );
    return this.interference();
  }
  filter(input) {
    const hp = this.hpAlpha * (this.hp + input - this.previousInput);
    this.previousInput = input;
    this.hp = hp;
    const hp2 = this.hpAlpha * (this.hp2 + hp - this.previousHp);
    this.previousHp = hp;
    this.hp2 = hp2;
    this.lp += this.lpAlpha * (hp2 - this.lp);
    this.lp2 += this.lpAlpha * (this.lp - this.lp2);
    const magnitude = Math.abs(this.lp2);
    const compressedMagnitude =
      magnitude <= COMPRESSOR_THRESHOLD
        ? magnitude
        : COMPRESSOR_THRESHOLD +
          (magnitude - COMPRESSOR_THRESHOLD) * COMPRESSOR_RATIO;
    const compressed = Math.sign(this.lp2) * compressedMagnitude;
    let result =
      (Math.tanh(compressed * TELEPHONE_DRIVE) / Math.tanh(TELEPHONE_DRIVE)) *
        OUTPUT_GAIN +
      this.interference();
    result =
      Math.max(
        -TELEPHONE_OUTPUT_LIMIT,
        Math.min(TELEPHONE_OUTPUT_LIMIT, result),
      ) * this.volume;
    return Math.max(
      -1,
      Math.min(1, this.volume > 1 ? Math.tanh(result) : result),
    );
  }
  available() {
    return this.queue.reduce(
      (sum, item, index) => sum + item.length - (index === 0 ? this.offset : 0),
      0,
    );
  }
  next() {
    while (this.queue.length && this.offset >= this.queue[0].length) {
      this.queue.shift();
      this.offset = 0;
    }
    if (!this.queue.length) return null;
    return this.queue[0][this.offset++];
  }
  process(_inputs, outputs) {
    const output = outputs[0][0];
    if (
      !this.started &&
      (this.available() >= (this.sourceRate * STARTUP_BUFFER_MS) / 1000 ||
        this.finished)
    )
      this.started = true;
    if (!this.started) return true;
    const ratio = this.sourceRate / sampleRate;
    for (let i = 0; i < output.length; i += 1) {
      this.phase += ratio;
      while (this.phase >= 1) {
        // Пустая очередь — недогруз сети: тишина, а не залипший последний отсчёт.
        this.current = this.next() ?? 0;
        this.phase -= 1;
      }
      // Отсчёт держится до следующего. Если подать 0 между отсчётами, 24 кГц
      // на 48 кГц выходе звучали бы вдвое тише и с зеркальными призвуками.
      const value = this.filter(this.current);
      output[i] = value;
      this.levelSamples.push(value);
    }
    if (this.levelSamples.length >= sampleRate * 0.06) {
      const rms = Math.sqrt(
        this.levelSamples.reduce((sum, value) => sum + value * value, 0) /
          this.levelSamples.length,
      );
      this.port.postMessage({
        type: "level",
        level: Math.min(1, rms * 3),
        generation: this.generation,
      });
      this.levelSamples = [];
    }
    if (this.finished && this.available() === 0) {
      this.port.postMessage({ type: "drained", generation: this.generation });
      return false;
    }
    return true;
  }
}
registerProcessor("telephone-processor", TelephoneProcessor);
