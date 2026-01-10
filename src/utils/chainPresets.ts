import type { PresetId } from "./eq.ts";
import type { CompressorPresetId } from "./compressor.ts";
import type { DeEsserPresetId } from "./deesser.ts";

export type ChainPreset = {
  name: string;
  description: string;
  useWhen: string;
  eqPreset: PresetId;
  compPreset: CompressorPresetId;
  deEsserPreset: DeEsserPresetId;
  limiterEnabled: boolean;
};

export const CHAIN_PRESETS = {
  podcastStandard: {
    name: "Podcast Standard",
    description: "Balanced chain for clean, conversational dialog.",
    useWhen: "Use when you want a clear, natural podcast sound.",
    eqPreset: "podcastClean",
    compPreset: "podcastLeveler",
    deEsserPreset: "medium",
    limiterEnabled: true
  },
  youtubeNarration: {
    name: "YouTube Narration",
    description: "Bright clarity with steady loudness for tutorials.",
    useWhen: "Use when narration needs crisp intelligibility.",
    eqPreset: "brightPresence",
    compPreset: "broadcastTight",
    deEsserPreset: "light",
    limiterEnabled: true
  },
  warmInterview: {
    name: "Warm Interview",
    description: "Adds warmth and controls peaks for interview dialog.",
    useWhen: "Use when voices feel thin or cold.",
    eqPreset: "warmRadio",
    compPreset: "voiceoverSmooth",
    deEsserPreset: "light",
    limiterEnabled: true
  },
  brightTutorial: {
    name: "Bright Tutorial Voice",
    description: "Extra presence without harshness.",
    useWhen: "Use when the voice sounds dull or buried.",
    eqPreset: "softSpoken",
    compPreset: "softSpokenLift",
    deEsserPreset: "medium",
    limiterEnabled: true
  },
  noisyRoomCleanup: {
    name: "Noisy Room Cleanup (light)",
    description: "Gentle EQ and compression that avoids amplifying room tone.",
    useWhen: "Use when noise is present and you want subtle control.",
    eqPreset: "muddyRoomFix",
    compPreset: "noisyRoomGentle",
    deEsserPreset: "light",
    limiterEnabled: true
  },
  voiceoverPro: {
    name: "Voiceover Pro Clean",
    description: "Polished VO chain with controlled sibilance.",
    useWhen: "Use for studio voiceover or narration work.",
    eqPreset: "maleClarity",
    compPreset: "voiceoverSmooth",
    deEsserPreset: "medium",
    limiterEnabled: true
  }
} as const satisfies Record<string, ChainPreset>;

export type ChainPresetId = keyof typeof CHAIN_PRESETS;
