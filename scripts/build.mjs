/**
 * Custom build script: runs two sequential Vite builds.
 * Build 1 (main): background service worker + options page. Empties dist.
 * Build 2 (content): content script as IIFE. Appends to dist.
 */
import { build } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { copyFileSync, mkdirSync, existsSync, readFileSync, writeFileSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const isWatch = process.argv.includes('--watch');

// Plugin to copy static assets after build
function copyAssetsPlugin() {
  return {
    name: 'copy-assets',
    closeBundle() {
      // Copy manifest
      copyFileSync(resolve(ROOT, 'manifest.json'), resolve(ROOT, 'dist/manifest.json'));

      // Copy icons
      const iconsDir = resolve(ROOT, 'public/icons');
      const distIconsDir = resolve(ROOT, 'dist/icons');
      if (existsSync(iconsDir)) {
        mkdirSync(distIconsDir, { recursive: true });
        for (const size of [16, 48, 128]) {
          const src = resolve(iconsDir, `icon${size}.png`);
          if (existsSync(src)) {
            copyFileSync(src, resolve(distIconsDir, `icon${size}.png`));
          }
        }
      }

      // Vite outputs the HTML at dist/src/options/options.html (mirrors input path).
      // Flatten it to dist/options.html so manifest can reference it simply.
      const deepHtml = resolve(ROOT, 'dist/src/options/options.html');
      const flatHtml = resolve(ROOT, 'dist/options.html');
      if (existsSync(deepHtml)) {
        const html = readFileSync(deepHtml, 'utf8');
        writeFileSync(flatHtml, html);
      }

      console.log('Static assets copied to dist/');
    },
  };
}

// Build 1: main (background + options) - ESM, empties dist
const mainConfig = {
  plugins: [react(), copyAssetsPlugin()],
  root: ROOT,
  build: {
    outDir: resolve(ROOT, 'dist'),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        background: resolve(ROOT, 'src/background/serviceWorker.ts'),
        options: resolve(ROOT, 'src/options/options.html'),
      },
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: 'chunks/[name]-[hash].js',
        assetFileNames: 'assets/[name][extname]',
        format: 'es',
      },
    },
    watch: isWatch ? {} : undefined,
  },
};

// Build 2: content script - IIFE, no code splitting, all deps inlined
const contentConfig = {
  plugins: [react()],
  root: ROOT,
  define: {
    'process.env.NODE_ENV': JSON.stringify('production'),
  },
  build: {
    outDir: resolve(ROOT, 'dist'),
    emptyOutDir: false,
    rollupOptions: {
      input: resolve(ROOT, 'src/contentScript/index.tsx'),
      output: {
        format: 'iife',
        name: 'KalshiIntelligence',
        entryFileNames: 'contentScript.js',
        inlineDynamicImports: true,
        assetFileNames: 'assets/[name][extname]',
      },
    },
    watch: isWatch ? {} : undefined,
  },
};

// ─── Generate icons if they don't exist ──────────────────────────────────────

const iconsExist = existsSync(resolve(ROOT, 'public/icons/icon128.png'));
if (!iconsExist) {
  console.log('Generating icons...');
  const { execSync } = await import('child_process');
  execSync('node scripts/generate-icons.mjs', { cwd: ROOT, stdio: 'inherit' });
}

console.log('Building Kalshi Intelligence Layer...');

try {
  await build(mainConfig);
  console.log('Build 1 complete (background + options)');
  await build(contentConfig);
  console.log('Build 2 complete (content script)');
  console.log('\nBuild finished. Load dist/ as unpacked Chrome extension.');
} catch (err) {
  console.error('Build failed:', err);
  process.exit(1);
}
