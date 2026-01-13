import * as esbuild from 'esbuild';
import { cp, mkdir } from 'node:fs/promises';

const isWatch = process.argv.includes('--watch');

async function copyStatic() {
  await mkdir('dist', { recursive: true });
  await cp('manifest.json', 'dist/manifest.json');
  await cp('src/injected.css', 'dist/injected.css').catch(() => {});
}

const buildOptions: esbuild.BuildOptions = {
  entryPoints: ['src/content.ts', 'src/background.ts', 'src/recipeContent.ts'],
  outdir: 'dist',
  bundle: true,
  format: 'esm',
  sourcemap: true,
  minify: false,
  target: ['chrome120'],
  loader: { '.ts': 'ts' },
  logLevel: 'info',
  plugins: [
    {
      name: 'copy-static',
      setup(build) {
        build.onEnd(async () => {
          await copyStatic();
        });
      },
    },
  ],
};

async function buildOnce() { await esbuild.build(buildOptions); }
async function buildWatch() { const ctx = await esbuild.context(buildOptions); await ctx.watch(); }
(async () => { if (isWatch) await buildWatch(); else await buildOnce(); })();
