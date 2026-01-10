export type Band = { freq: number; gainDb: number };

export type EqState = {
  preampDb: number;
  limiter: boolean;
  bands: Band[];
};

export const BAND_FREQS = [60, 120, 250, 500, 1000, 2000, 4000, 8000] as const;

export function makeFlat(): EqState {
  return {
    preampDb: 0,
    limiter: true,
    bands: BAND_FREQS.map((f) => ({ freq: f, gainDb: 0 }))
  };
}

function fromGains(
  name: string,
  description: string,
  gains: Partial<Record<(typeof BAND_FREQS)[number], number>>,
  preampDb = 0,
  limiter = true
) {
  const state = makeFlat();
  state.preampDb = preampDb;
  state.limiter = limiter;
  state.bands = state.bands.map((b) => ({ ...b, gainDb: gains[b.freq as (typeof BAND_FREQS)[number]] ?? 0 }));
  return { name, description, state } as const;
}

export const PRESETS = {
  podcastClean: fromGains(
    'Podcast Clean',
    'Tightens low end and adds clarity for clean spoken voice.',
    { 60: -6, 120: -4, 250: -2, 500: 1, 1000: 2, 2000: 3, 4000: 2, 8000: 1 },
    -1,
    true
  ),
  warmRadio: fromGains(
    'Warm Radio',
    'Adds body and smooth highs for a broadcast-style warmth.',
    { 60: -3, 120: 2, 250: 2, 500: 1, 1000: 0, 2000: 1, 4000: -1, 8000: -1 },
    -1,
    true
  ),
  brightPresence: fromGains(
    'Bright Presence',
    'Boosts intelligibility and sparkle without harshness.',
    { 60: -5, 120: -3, 250: -1, 500: 0, 1000: 2, 2000: 3, 4000: 3, 8000: 2 },
    -2,
    true
  ),
  muddyRoomFix: fromGains(
    'Muddy Room Fix',
    'Cuts low-mid buildup and opens up boxy recordings.',
    { 60: -6, 120: -5, 250: -4, 500: -2, 1000: 1, 2000: 2, 4000: 1, 8000: 0 },
    -1,
    true
  ),
  harshMicFix: fromGains(
    'Harsh Mic Fix',
    'Tames aggressive upper-mids and fizz while keeping detail.',
    { 60: -4, 120: -2, 250: 0, 500: 1, 1000: 1, 2000: -1, 4000: -3, 8000: -2 },
    -1,
    true
  ),
  telephoneRescue: fromGains(
    'Telephone / Thin Mic Rescue',
    'Adds body to thin mics and restores intelligibility.',
    { 60: -6, 120: 2, 250: 3, 500: 2, 1000: 1, 2000: 1, 4000: 0, 8000: -1 },
    -1,
    true
  ),
  femalePresence: fromGains(
    'Female Vocal Presence',
    'Lifts clarity and air while softening harsh peaks.',
    { 60: -6, 120: -4, 250: -2, 500: 0, 1000: 1, 2000: 2, 4000: 3, 8000: 2 },
    -2,
    true
  ),
  maleClarity: fromGains(
    'Male Vocal Clarity',
    'Reduces boom and adds articulation for lower voices.',
    { 60: -5, 120: -4, 250: -3, 500: -1, 1000: 2, 2000: 3, 4000: 2, 8000: 1 },
    -2,
    true
  ),
  softSpoken: fromGains(
    'Soft Spoken Boost',
    'Gently lifts presence so quiet voices read clearly.',
    { 60: -5, 120: -3, 250: -1, 500: 1, 1000: 2, 2000: 3, 4000: 3, 8000: 2 },
    -2,
    true
  ),
  loudVoiceControl: fromGains(
    'Loud Voice Control',
    'Reduces honk and harsh peaks for loud delivery.',
    { 60: -6, 120: -4, 250: -2, 500: -1, 1000: 0, 2000: -1, 4000: -2, 8000: -2 },
    -1,
    true
  ),
  proximityFix: fromGains(
    'Close Mic Proximity Fix',
    'Cuts rumble and boom caused by close-mic proximity.',
    { 60: -8, 120: -6, 250: -4, 500: -1, 1000: 1, 2000: 2, 4000: 2, 8000: 1 },
    -2,
    true
  )
} as const;

export type PresetId = keyof typeof PRESETS;
