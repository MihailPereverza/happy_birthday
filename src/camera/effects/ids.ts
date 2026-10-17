/** Effect ids usable as `{"type": "effect", "effect": "<id>"}` in a pack; kept free of canvas code for validation. */
export const EFFECT_IDS = [
  'bigEyes', 'hamster', 'bigHead', 'alien', 'blowCandles', 'rainbow', 'kiss', 'laserEyes', 'partyHorn', 'dragon',
  'happyTears', 'heartHalo', 'fireworks', 'ageBalloons', 'disco', 'faceSwap', 'faceBalloons',
] as const;

export type EffectId = (typeof EFFECT_IDS)[number];
