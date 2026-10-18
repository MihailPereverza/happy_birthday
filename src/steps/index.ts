import { registerStep } from './registry';
import { actionStep } from './action';
import { audioStep } from './audio';
import { choiceStep } from './choice';
import { codeStep } from './code';
import { finalStep } from './final';
import { geoStep } from './geo';
import { infoStep } from './info';
import { numberStep } from './number';
import { photoStep } from './photo';
import { qrStep } from './qr';
import { receiptStep } from './receipt';
import { riddleStep } from './riddle';

[
  infoStep,
  riddleStep,
  choiceStep,
  codeStep,
  qrStep,
  geoStep,
  actionStep,
  numberStep,
  photoStep,
  audioStep,
  receiptStep,
  finalStep,
].forEach((d) => registerStep(d as never));
