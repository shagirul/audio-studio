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

export function makeDenoiseDefault(): DenoiseState {
  return {
    noiseFloorDb: -50,
    amount: 12,
    smoothing: 0,
    freqScale: 1.25,
    outputNoiseOnly: false
  };
}
