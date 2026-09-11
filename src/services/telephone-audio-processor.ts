const PCM16_SCALE = 0x8000;
const TELEPHONE_HIGH_PASS_HZ = 300;
const TELEPHONE_LOW_PASS_HZ = 3_400;
const COMPRESSOR_THRESHOLD = 0.35;
const COMPRESSOR_RATIO = 0.28;
const OUTPUT_GAIN = 0.92;

export const TELEPHONE_OUTPUT_LIMIT = 0.98;
export const MAX_SCENARIO_AMBIENCE_LEVEL = 0.02;

export type ScenarioAmbienceProfile =
  "none" | "room" | "street" | "emergency-outdoor";

export interface TelephoneAudioProcessorOptions {
  sampleRate: number;
  ambience: ScenarioAmbienceProfile;
  seed: string;
}

/**
 * Категория приходит из выбранной серверной версии сценария. Неизвестная
 * будущая категория получает самый тихий нейтральный профиль, а не ломает
 * звонок посреди занятия.
 */
export const resolveScenarioAmbience = (
  category: string,
): ScenarioAmbienceProfile => {
  if (
    category === "fire" ||
    category === "road_accident" ||
    category === "gas_leak"
  ) {
    return "emergency-outdoor";
  }

  if (category === "criminal") {
    return "street";
  }

  return "room";
};

const seedFromString = (value: string): number => {
  let hash = 0x811c9dc5;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }

  return hash === 0 ? 0x6d2b79f5 : hash >>> 0;
};

const clamp = (value: number, minimum: number, maximum: number): number =>
  Math.min(maximum, Math.max(minimum, value));

/**
 * Потоковый телефонный DSP для голоса заявителя.
 *
 * Состояние фильтров и процедурного фона сохраняется между PCM-чанками. Это
 * важно: сброс на каждой HTTP/WebSocket-границе создавал бы щелчки и одинаковый
 * фрагмент сирены в начале каждого чанка.
 */
export class TelephoneAudioProcessor {
  private readonly sampleRate: number;
  private readonly ambience: ScenarioAmbienceProfile;
  private readonly initialNoiseState: number;
  private readonly highPassAlpha: number;
  private readonly lowPassAlpha: number;

  private noiseState: number;
  private colouredNoise = 0;
  private previousInput = 0;
  private highPassState = 0;
  private lowPassState = 0;
  private ambiencePhase = 0;
  private sirenPhase = 0;
  private sirenSweepPhase = 0;

  constructor(options: TelephoneAudioProcessorOptions) {
    if (!Number.isInteger(options.sampleRate) || options.sampleRate < 8_000) {
      throw new Error("Telephone DSP sample rate must be at least 8000 Hz");
    }

    if (options.seed.trim().length === 0) {
      throw new Error("Telephone DSP seed must not be empty");
    }

    this.sampleRate = options.sampleRate;
    this.ambience = options.ambience;
    this.initialNoiseState = seedFromString(options.seed);
    this.noiseState = this.initialNoiseState;

    const sampleInterval = 1 / this.sampleRate;
    const highPassRc = 1 / (2 * Math.PI * TELEPHONE_HIGH_PASS_HZ);
    const lowPassRc = 1 / (2 * Math.PI * TELEPHONE_LOW_PASS_HZ);

    this.highPassAlpha = highPassRc / (highPassRc + sampleInterval);
    this.lowPassAlpha = sampleInterval / (lowPassRc + sampleInterval);
  }

  process(pcm16: Int16Array): Float32Array {
    const output = new Float32Array(pcm16.length);

    for (let index = 0; index < pcm16.length; index += 1) {
      const speech = pcm16[index] / PCM16_SCALE;
      const input = speech + this.nextAmbienceSample();
      const highPassed =
        this.highPassAlpha * (this.highPassState + input - this.previousInput);

      this.previousInput = input;
      this.highPassState = highPassed;
      this.lowPassState += this.lowPassAlpha * (highPassed - this.lowPassState);

      const magnitude = Math.abs(this.lowPassState);
      const compressedMagnitude =
        magnitude <= COMPRESSOR_THRESHOLD
          ? magnitude
          : COMPRESSOR_THRESHOLD +
            (magnitude - COMPRESSOR_THRESHOLD) * COMPRESSOR_RATIO;
      const compressed = Math.sign(this.lowPassState) * compressedMagnitude;

      output[index] = clamp(
        compressed * OUTPUT_GAIN,
        -TELEPHONE_OUTPUT_LIMIT,
        TELEPHONE_OUTPUT_LIMIT,
      );
    }

    return output;
  }

  reset(): void {
    this.noiseState = this.initialNoiseState;
    this.colouredNoise = 0;
    this.previousInput = 0;
    this.highPassState = 0;
    this.lowPassState = 0;
    this.ambiencePhase = 0;
    this.sirenPhase = 0;
    this.sirenSweepPhase = 0;
  }

  private nextAmbienceSample(): number {
    if (this.ambience === "none") {
      return 0;
    }

    const whiteNoise = this.nextNoise();
    this.colouredNoise += 0.075 * (whiteNoise - this.colouredNoise);

    if (this.ambience === "room") {
      const roomTone = Math.sin(this.ambiencePhase) * 0.002;
      this.ambiencePhase = this.advancePhase(this.ambiencePhase, 420);

      return this.colouredNoise * 0.004 + roomTone;
    }

    if (this.ambience === "street") {
      return this.colouredNoise * 0.009 + whiteNoise * 0.002;
    }

    const sweep = (Math.sin(this.sirenSweepPhase) + 1) / 2;
    const sirenFrequency = 620 + sweep * 210;
    const siren = Math.sin(this.sirenPhase) * 0.007;

    this.sirenPhase = this.advancePhase(this.sirenPhase, sirenFrequency);
    this.sirenSweepPhase = this.advancePhase(this.sirenSweepPhase, 0.36);

    return clamp(
      this.colouredNoise * 0.012 + whiteNoise * 0.002 + siren,
      -MAX_SCENARIO_AMBIENCE_LEVEL,
      MAX_SCENARIO_AMBIENCE_LEVEL,
    );
  }

  private nextNoise(): number {
    let state = this.noiseState;
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    this.noiseState = state >>> 0;

    return (this.noiseState / 0xffffffff) * 2 - 1;
  }

  private advancePhase(phase: number, frequency: number): number {
    const next = phase + (2 * Math.PI * frequency) / this.sampleRate;
    return next >= 2 * Math.PI ? next - 2 * Math.PI : next;
  }
}
