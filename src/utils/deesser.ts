export type DeEsserState = {
  /** Simple amount from 0..100 (mapped to threshold/ratio). */
  amount: number;
  /** Center frequency in Hz for sibilance band. */
  frequencyHz: number;
  /** Threshold in dB for sibilance compressor. */
  thresholdDb: number;
  /** Compression ratio for sibilance band. */
  ratio: number;
  /** Attack in milliseconds. */
  attackMs: number;
  /** Release in milliseconds. */
  releaseMs: number;
};

export function makeDeEsserDefault(): DeEsserState {
  return {
    amount: 35,
    frequencyHz: 6500,
    thresholdDb: -24,
    ratio: 3.5,
    attackMs: 4,
    releaseMs: 80
  };
}

const AMOUNT_THRESHOLD_MIN = -36;
const AMOUNT_THRESHOLD_MAX = -18;
const AMOUNT_RATIO_MIN = 2;
const AMOUNT_RATIO_MAX = 8;

export function deEsserFromAmount(amount: number, base: DeEsserState): DeEsserState {
  const t = Math.max(0, Math.min(100, amount)) / 100;
  return {
    ...base,
    amount,
    thresholdDb: AMOUNT_THRESHOLD_MAX + (AMOUNT_THRESHOLD_MIN - AMOUNT_THRESHOLD_MAX) * t,
    ratio: AMOUNT_RATIO_MIN + (AMOUNT_RATIO_MAX - AMOUNT_RATIO_MIN) * t
  };
}

export function deEsserAmountFromState(state: DeEsserState): number {
  const t = (state.thresholdDb - AMOUNT_THRESHOLD_MAX) / (AMOUNT_THRESHOLD_MIN - AMOUNT_THRESHOLD_MAX);
  return Math.max(0, Math.min(100, t * 100));
}

type DeEsserPreset = {
  name: string;
  description: string;
  state: DeEsserState;
};

export const DE_ESSER_PRESETS = {
  light: {
    name: "Light (natural)",
    description: "Subtle softening of sharp S sounds while keeping brightness.",
    state: {
      ...makeDeEsserDefault(),
      amount: 25,
      frequencyHz: 6500,
      thresholdDb: -20,
      ratio: 2.5,
      attackMs: 3,
      releaseMs: 70
    }
  },
  medium: {
    name: "Medium (podcast)",
    description: "Balanced control for most spoken word recordings.",
    state: {
      ...makeDeEsserDefault(),
      amount: 45,
      frequencyHz: 6800,
      thresholdDb: -26,
      ratio: 4,
      attackMs: 4,
      releaseMs: 90
    }
  },
  heavy: {
    name: "Heavy (sharp sibilance)",
    description: "Tames aggressive sibilance and harsh consonants.",
    state: {
      ...makeDeEsserDefault(),
      amount: 70,
      frequencyHz: 7200,
      thresholdDb: -32,
      ratio: 6,
      attackMs: 5,
      releaseMs: 110
    }
  }
} as const satisfies Record<string, DeEsserPreset>;

export type DeEsserPresetId = keyof typeof DE_ESSER_PRESETS;
