export type Band = { freq: number; gainDb: number };

export type EqState = {
  preampDb: number;
  limiter: boolean;
  bands: Band[];
};

export type CompressorState = {
  thresholdDb: number;
  ratio: number;
  attackMs: number;
  releaseMs: number;
  kneeDb: number;
  makeupDb: number;
};

export type DeEsserState = {
  amount: number;
  frequencyHz: number;
  thresholdDb: number;
  ratio: number;
  attackMs: number;
  releaseMs: number;
};

export type DenoiseState = {
  /**
   * Sampled noise floor in dBFS (FFmpeg afftdn expects -80..-20).
   * This is computed from the user-selected "noise only" region.
   */
  noiseFloorDb: number;

  /** Noise reduction amount (FFmpeg afftdn nr: 0.01..97). */
  amount: number;

  /** Gain smooth radius (FFmpeg afftdn gs: 0..50). */
  smoothing: number;

  /** Frequency scaling / band multiplier (FFmpeg afftdn bm: 0.2..5). */
  freqScale: number;

  /** If true, output *noise only* instead of denoised audio (FFmpeg afftdn om=noise). */
  outputNoiseOnly: boolean;
};

export type EffectsPayload = {
  denoiseEnabled: boolean;
  denoise: DenoiseState;
  deEsserEnabled: boolean;
  deEsser: DeEsserState;
  eqEnabled: boolean;
  eq: EqState;
  compEnabled: boolean;
  comp: CompressorState;
};

declare global {
  interface Window {
    api: {
      selectAudio: () => Promise<{ filePath: string; meta: any } | null>;
      readFileBase64: (payload: { filePath: string }) => Promise<{ mime: string; dataBase64: string }>;
      chooseExportPath: (payload: { defaultName: string }) => Promise<string | null>;
      exportAudio: (payload: { inputPath: string; outputPath: string; effects: EffectsPayload; range?: { startSeconds: number; endSeconds: number } }) => Promise<void>;
      renderWaveform: (payload: { inputPath: string; width?: number; height?: number; effects?: EffectsPayload }) => Promise<{ mime: 'image/png'; dataBase64: string }>;
      renderPreview: (payload: { inputPath: string; effects: EffectsPayload; startSeconds: number; durationSeconds: number }) => Promise<{ mime: string; dataBase64: string }>;
      applyDenoiseSelection: (payload: { inputPath: string; startSeconds: number; endSeconds: number; denoise: DenoiseState }) => Promise<{ filePath: string; meta: any }>;
    };
  }
}
