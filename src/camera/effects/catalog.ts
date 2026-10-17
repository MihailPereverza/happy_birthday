import { ageBalloons, disco, fireworks, heartHalo } from './ambient';
import { blowCandles } from './cake';
import { dragon, happyTears, kiss, laserEyes, partyHorn, rainbow } from './expressions';
import { faceBalloons, faceSwap } from './faceCut';
import type { EffectSpec } from './types';
import { alien, bigEyes, bigHead, hamster } from './warps';
import type { EffectId } from './ids';

export const EFFECTS: Record<EffectId, EffectSpec> = {
  bigEyes: { create: bigEyes, needsFaces: true },
  hamster: { create: hamster, needsFaces: true },
  bigHead: { create: bigHead, needsFaces: true },
  alien: { create: alien, needsFaces: true },
  blowCandles: { create: blowCandles, needsFaces: false },
  rainbow: { create: rainbow, needsFaces: true },
  kiss: { create: kiss, needsFaces: true },
  laserEyes: { create: laserEyes, needsFaces: true },
  partyHorn: { create: partyHorn, needsFaces: true },
  dragon: { create: dragon, needsFaces: true },
  happyTears: { create: happyTears, needsFaces: true },
  heartHalo: { create: heartHalo, needsFaces: true },
  fireworks: { create: fireworks, needsFaces: false },
  ageBalloons: { create: ageBalloons, needsFaces: false },
  disco: { create: disco, needsFaces: false },
  faceSwap: { create: faceSwap, needsFaces: true, minFaces: 2 },
  faceBalloons: { create: faceBalloons, needsFaces: true },
};
