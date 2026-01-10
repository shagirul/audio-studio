export type DenoiseState = {
  /** Sampled noise floor in dBFS (FFmpeg afftdn expects -80..-20). */
  noiseFloorDb: number;

  /** Noise reduction amount (FFmpeg afftdn nr: 0.01..97). */
  amount: number;

  /** Gain smooth radius (FFmpeg afftdn gs: 0..50). */
  smoothing: number;

  /** Frequency scaling / band multiplier (FFmpeg afftdn bm: 0.2..5). */
  freqScale: number;

  /** If true, output noise only instead of denoised output. */
  outputNoiseOnly: boolean;
};

const SIMPLE_AMOUNT_MIN = 5;
const SIMPLE_AMOUNT_MAX = 40;
const SIMPLE_SMOOTHING_MAX = 20;
const SIMPLE_FREQ_SCALE_MIN = 1;
const SIMPLE_FREQ_SCALE_MAX = 1.6;

export function makeDenoiseDefault(): DenoiseState {
  return {
    noiseFloorDb: -50,
    amount: 12,
    smoothing: 0,
    freqScale: 1.25,
    outputNoiseOnly: false
  };
}

export function denoiseStrengthFromState(state: DenoiseState): number {
  const t = (state.amount - SIMPLE_AMOUNT_MIN) / (SIMPLE_AMOUNT_MAX - SIMPLE_AMOUNT_MIN);
  return Math.max(0, Math.min(100, t * 100));
}

export function denoiseStateFromStrength(strength: number, base: DenoiseState): DenoiseState {
  const t = Math.max(0, Math.min(100, strength)) / 100;
  return {
    ...base,
    amount: SIMPLE_AMOUNT_MIN + t * (SIMPLE_AMOUNT_MAX - SIMPLE_AMOUNT_MIN),
    smoothing: t * SIMPLE_SMOOTHING_MAX,
    freqScale: SIMPLE_FREQ_SCALE_MIN + t * (SIMPLE_FREQ_SCALE_MAX - SIMPLE_FREQ_SCALE_MIN)
  };
}
