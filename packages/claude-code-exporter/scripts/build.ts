import * as esbuild from 'esbuild';
import { cp, mkdir } from 'node:fs/promises';

const isWatch = process.argv.includes('--watch');

async function copyStatic() {
  await mkdir('dist/client', { recursive: true });
  await cp('src/client/index.html', 'dist/client/index.html');
  await cp('src/client/styles.css', 'dist/client/styles.css');
}

const clientOptions: esbuild.BuildOptions = {
  entryPoints: ['src/client/app.tsx'],
  outfile: 'dist/client/bundle.js',
  bundle: true,
  format: 'esm',
  sourcemap: true,
  minify: false,
  target: ['chrome120'],
  jsx: 'automatic',
  logLevel: 'info',
  plugins: [
    {
      name: 'copy-static',
      setup(build) {
        build.onEnd(async () => { await copyStatic(); });
      },
    },
  ],
};

async function buildOnce() {
  await esbuild.build(clientOptions);
}

async function buildWatch() {
  const ctx = await esbuild.context(clientOptions);
  await ctx.watch();
  console.log('Watching for client changes…');
}

(async () => {
  if (isWatch) await buildWatch();
  else await buildOnce();
})();
