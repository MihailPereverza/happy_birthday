/// <reference types="vitest/config" />
import { defineConfig, type Plugin } from 'vite';
import preact from '@preact/preset-vite';
import { VitePWA } from 'vite-plugin-pwa';
import { createReadStream, existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join, relative, resolve, sep } from 'node:path';

// GitHub Pages serves the site from /<repo-name>/; the deploy workflow passes it via BASE_PATH.
const base = process.env.BASE_PATH ?? '/';
const contentDir = resolve(import.meta.dirname, 'content');

const MIME: Record<string, string> = {
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.m4a': 'audio/mp4',
};

function listFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? listFiles(full) : [full];
  });
}

function packIndex(): string {
  const packs = readdirSync(contentDir)
    .filter((id) => existsSync(join(contentDir, id, 'quest.json')))
    .map((id) => {
      const quest = JSON.parse(readFileSync(join(contentDir, id, 'quest.json'), 'utf8'));
      return { id, title: quest.title ?? id };
    });
  return JSON.stringify({ packs }, null, 2);
}

/** Publishes content/<packId>/ next to the app and generates content/index.json with the pack list. */
function contentPacks(): Plugin {
  return {
    name: 'content-packs',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = decodeURIComponent((req.url ?? '').split('?')[0]);
        const prefix = `${base}content/`;
        if (!url.startsWith(prefix)) return next();
        const rel = url.slice(prefix.length);
        if (rel === 'index.json') {
          res.setHeader('Content-Type', 'application/json');
          return res.end(packIndex());
        }
        const file = resolve(contentDir, rel);
        if (!file.startsWith(contentDir + sep) || !existsSync(file) || statSync(file).isDirectory()) return next();
        res.setHeader('Content-Type', MIME[extname(file).toLowerCase()] ?? 'application/octet-stream');
        createReadStream(file).pipe(res);
      });
    },
    generateBundle() {
      for (const file of listFiles(contentDir)) {
        const fileName = `content/${relative(contentDir, file).split(sep).join('/')}`;
        this.emitFile({ type: 'asset', fileName, source: readFileSync(file) });
      }
      this.emitFile({ type: 'asset', fileName: 'content/index.json', source: packIndex() });
    },
  };
}

export default defineConfig({
  base,
  plugins: [
    preact(),
    contentPacks(),
    VitePWA({
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: ['icons/*.png', 'icons/*.svg'],
      manifest: {
        name: 'Сердце — квест',
        short_name: 'Сердце',
        description: 'Гео-квест на один день',
        lang: 'ru',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#1a1016',
        theme_color: '#c2185b',
        scope: base,
        start_url: base,
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: [
          '**/*.{js,css,html,png,jpg,jpeg,webp,svg,json,mp3,ogg,m4a,task}',
          'mediapipe/wasm/vision_wasm_internal.{js,wasm}',
        ],
        // SIMD is available in every Chrome that runs on Android 10+, the no-SIMD build is only a network fallback.
        globIgnores: ['**/vision_wasm_nosimd_internal.*'],
        maximumFileSizeToCacheInBytes: 30 * 1024 * 1024,
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
        // Take control of the page right after the very first install, so assets fetched later in that session
        // (FaceLandmarker model, masks) go through the cache; updates still wait for the host's "update" button.
        clientsClaim: true,
      },
    }),
  ],
  build: { target: 'es2022', chunkSizeWarningLimit: 1500 },
  test: { environment: 'node', setupFiles: ['tests/setup.ts'] },
});
