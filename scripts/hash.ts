import { hashAnswer, normalizeAnswer } from '../src/core/hash';

const inputs = process.argv.slice(2);
if (!inputs.length) {
  console.error('Usage: npm run hash "<строка>" ["<строка 2>" ...]');
  process.exit(1);
}
for (const input of inputs) {
  console.log(`${await hashAnswer(input)}  ← "${normalizeAnswer(input)}"`);
}
