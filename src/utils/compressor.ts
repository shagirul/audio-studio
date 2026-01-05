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
