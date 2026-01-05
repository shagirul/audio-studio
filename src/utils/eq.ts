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

function fromGains(name: string, gains: Partial<Record<(typeof BAND_FREQS)[number], number>>, preampDb = 0, limiter = true) {
  const state = makeFlat();
  state.preampDb = preampDb;
  state.limiter = limiter;
  state.bands = state.bands.map((b) => ({ ...b, gainDb: gains[b.freq as (typeof BAND_FREQS)[number]] ?? 0 }));
  return { name, state } as const;
}

export const PRESETS = {
  flat: fromGains('Flat', {}, 0, true),
  bassBoost: fromGains('Bass Boost', { 60: 6, 120: 4, 250: 2, 500: 0, 1000: -1, 2000: -1, 4000: 0, 8000: 1 }, -1, true),
  trebleBoost: fromGains('Treble Boost', { 60: -1, 120: -1, 250: 0, 500: 1, 1000: 2, 2000: 3, 4000: 4, 8000: 5 }, 0, true),
  vShape: fromGains('V-Shape', { 60: 5, 120: 3, 250: 1, 500: -1, 1000: -2, 2000: -1, 4000: 2, 8000: 4 }, -1, true),
  vocal: fromGains('Vocal', { 60: -2, 120: -1, 250: 1, 500: 3, 1000: 3, 2000: 2, 4000: 1, 8000: -1 }, 0, true),
  podcast: fromGains('Podcast / Speech', { 60: -6, 120: -4, 250: -1, 500: 2, 1000: 4, 2000: 3, 4000: 1, 8000: -2 }, 0, true),
  lofi: fromGains('Lo-Fi', { 60: 3, 120: 2, 250: 0, 500: -2, 1000: -4, 2000: -3, 4000: -1, 8000: -6 }, -1, true),
  phone: fromGains('Phone / Midband', { 60: -12, 120: -10, 250: -4, 500: 4, 1000: 6, 2000: 4, 4000: -2, 8000: -10 }, 0, true)
} as const;

export type PresetId = keyof typeof PRESETS;
