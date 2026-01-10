export type CompressorState = {
  thresholdDb: number;
  ratio: number;
  attackMs: number;
  releaseMs: number;
  kneeDb: number;
  makeupDb: number;
};

export function makeCompDefault(): CompressorState {
  return {
    thresholdDb: -24,
    ratio: 2,
    attackMs: 15,
    releaseMs: 200,
    kneeDb: 1,
    makeupDb: 0
  };
}

type CompressorPreset = {
  name: string;
  description: string;
  state: CompressorState;
};

export const COMP_PRESETS = {
  podcastLeveler: {
    name: "Podcast Leveler",
    description: "Smooths dialog dynamics without sounding squashed.",
    state: { thresholdDb: -24, ratio: 2.5, attackMs: 10, releaseMs: 140, kneeDb: 3, makeupDb: 2 }
  },
  voiceoverSmooth: {
    name: "Voiceover Smooth",
    description: "Polished, even voice with gentle movement.",
    state: { thresholdDb: -22, ratio: 2, attackMs: 12, releaseMs: 180, kneeDb: 4, makeupDb: 2 }
  },
  broadcastTight: {
    name: "Broadcast Tight",
    description: "Firm control for energetic, consistent delivery.",
    state: { thresholdDb: -26, ratio: 3.5, attackMs: 6, releaseMs: 120, kneeDb: 2, makeupDb: 3 }
  },
  softSpokenLift: {
    name: "Soft Spoken Lift",
    description: "Raises quiet speech and reduces peaks.",
    state: { thresholdDb: -30, ratio: 2.8, attackMs: 8, releaseMs: 180, kneeDb: 4, makeupDb: 4 }
  },
  loudVoiceControl: {
    name: "Loud / Shout Control",
    description: "Tames loud passages and keeps tone stable.",
    state: { thresholdDb: -28, ratio: 4, attackMs: 4, releaseMs: 130, kneeDb: 2, makeupDb: 2 }
  },
  asmrControl: {
    name: "ASMR / Whisper Control",
    description: "Gentle compression with longer release for whispers.",
    state: { thresholdDb: -32, ratio: 2, attackMs: 15, releaseMs: 220, kneeDb: 5, makeupDb: 5 }
  },
  noisyRoomGentle: {
    name: "Noisy Room Gentle",
    description: "Light leveling that avoids bringing up room noise.",
    state: { thresholdDb: -20, ratio: 1.8, attackMs: 18, releaseMs: 200, kneeDb: 5, makeupDb: 1 }
  },
  aggressiveCreator: {
    name: "Aggressive Creator Voice",
    description: "Punchy, controlled delivery for energetic creators.",
    state: { thresholdDb: -27, ratio: 4.5, attackMs: 5, releaseMs: 110, kneeDb: 2, makeupDb: 3 }
  }
} as const satisfies Record<string, CompressorPreset>;

export type CompressorPresetId = keyof typeof COMP_PRESETS;
