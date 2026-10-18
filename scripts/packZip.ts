import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import JSZip from 'jszip';
import { referencedAssets, validateQuest } from '../src/content/validate';
import { BUILTIN_STEP_TYPES } from '../src/steps/registry';

// Private packs (personal answers, photos) live in the gitignored private/ folder and reach the phone as a ZIP.
const PRIVATE_DIR = resolve(import.meta.dirname, '..', 'private');

function fail(lines: string[]): never {
  console.error(lines.join('\n'));
  process.exit(1);
}

function listFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? listFiles(full) : [full];
  });
}

const packId = process.argv[2];
if (!packId || !/^[a-zA-Z0-9_-]+$/.test(packId)) fail(['Usage: npm run pack:zip -- <packId>   (папка private/<packId>/)']);
const packDir = join(PRIVATE_DIR, packId);
if (!existsSync(packDir)) fail([`Нет папки ${packDir}`]);

// A pack may keep plaintext answers in build.ts and generate quest.json with hashes from it.
const buildScript = join(packDir, 'build.ts');
if (existsSync(buildScript)) {
  const { buildQuest } = (await import(pathToFileURL(buildScript).href)) as { buildQuest: () => Promise<unknown> };
  writeFileSync(join(packDir, 'quest.json'), `${JSON.stringify(await buildQuest(), null, 2)}\n`);
  console.log(`quest.json собран из build.ts`);
}

const questPath = join(packDir, 'quest.json');
if (!existsSync(questPath)) fail([`Нет ${questPath}`]);
let data: unknown;
try {
  data = JSON.parse(readFileSync(questPath, 'utf8'));
} catch (e) {
  fail([`quest.json: неверный JSON — ${String(e)}`]);
}

const result = validateQuest(data, BUILTIN_STEP_TYPES);
if (!result.ok) fail([`✗ Пакет «${packId}» не прошёл проверку (${result.errors.length}):`, ...result.errors.map((e) => `  • ${e.path}: ${e.message}`)]);

const assetFiles = listFiles(join(packDir, 'assets')).map((f) => relative(packDir, f).split(sep).join('/'));
const missing = referencedAssets(result.quest).filter((p) => !assetFiles.includes(p.replace(/^\.\//, '')));
if (missing.length) fail([`✗ Файлов нет в assets/ (${missing.length}):`, ...missing.map((p) => `  • ${p}`)]);

const zip = new JSZip();
zip.file('quest.json', readFileSync(questPath));
for (const file of assetFiles) zip.file(file, readFileSync(join(packDir, file)));
mkdirSync(PRIVATE_DIR, { recursive: true });
const out = join(PRIVATE_DIR, `${packId}.zip`);
writeFileSync(out, await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }));

const { quest } = result;
const steps = quest.points.reduce((n, p) => n + p.steps.length, 0);
console.log(`✓ ${quest.title} (${quest.id}): ${quest.points.length} точек, ${steps} шагов, ${assetFiles.length} файлов в assets/`);
console.log(`→ ${relative(process.cwd(), out)} (${(statSync(out).size / 1024).toFixed(0)} КБ)`);
