// scripts/probe.ts
import { glob } from 'glob';
import fs from 'node:fs/promises';

async function grep(pattern: RegExp, files: string[]) {
  const hits: { file: string; lines: number[] }[] = [];
  for (const file of files) {
    const text = await fs.readFile(file, 'utf8');
    const lines = text.split(/\r?\n/);
    const idxs: number[] = [];
    lines.forEach((ln, i) => { if (pattern.test(ln)) idxs.push(i + 1); });
    if (idxs.length) hits.push({ file, lines: idxs });
  }
  return hits;
}

(async () => {
  const serverFiles = await glob(['backend/**/*.{ts,tsx,js}'], { ignore: '**/node_modules/**' });
  const clientFiles = await glob(['frontend/**/*.{ts,tsx,js}'], { ignore: '**/node_modules/**' });

  const routes = await grep(/router\.(get|post|put|patch|delete)\(/, serverFiles);
  const models = await grep(/Schema\(|model<|export interface .*Doc/, serverFiles);
  const rtkEndpoints = await grep(/injectEndpoints\(|createApi\(/, clientFiles);
  const apiBase = await grep(/API_BASE|baseQuery\(|fetchBaseQuery\(/, clientFiles);

  const lines = [
    '# Probe Results',
    '## Routes', JSON.stringify(routes, null, 2),
    '## Models', JSON.stringify(models, null, 2),
    '## RTK Endpoints', JSON.stringify(rtkEndpoints, null, 2),
    '## API Base Mentions', JSON.stringify(apiBase, null, 2),
  ];
  await fs.writeFile('PROBE_RESULTS.md', lines.join('\n\n'));
  console.log('Wrote PROBE_RESULTS.md');
})();
