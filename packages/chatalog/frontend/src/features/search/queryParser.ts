export type ParsedSearch = {
  q: string;
  params: Record<string, string>;
};

/**
 * Very small query language parser.
 *
 * Supported operators (case-insensitive):
 * - tag:foo or tag:foo,bar   -> params.tags="foo,bar"
 * - status:UNREVIEWED       -> params.status="UNREVIEWED"
 * - after:YYYY-MM-DD        -> params.updatedFrom="YYYY-MM-DD"
 * - before:YYYY-MM-DD       -> params.updatedTo="YYYY-MM-DD"
 *
 * Quoted phrases are preserved as part of q:
 *   "rsync backup" tag:backup
 */
export function parseSearchInput(input: string): ParsedSearch {
  const text = (input ?? '').trim();
  if (!text) return { q: '', params: {} };

  const tokens: string[] = [];
  const re = /"([^"]+)"|'([^']+)'|(\S+)/g;
  let m: RegExpExecArray | null;

  while ((m = re.exec(text)) !== null) {
    tokens.push(m[1] ?? m[2] ?? m[3]);
  }

  const params: Record<string, string> = {};
  const qTokens: string[] = [];

  const tagVals: string[] = [];

  for (const raw of tokens) {
    const token = raw.trim();
    if (!token) continue;

    const lower = token.toLowerCase();

    if (lower.startsWith('tag:')) {
      const rest = token.slice(4).trim();
      if (rest) {
        rest
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
          .forEach((t) => tagVals.push(t));
      }
      continue;
    }

    if (lower.startsWith('status:')) {
      const rest = token.slice(7).trim();
      if (rest) params.status = rest;
      continue;
    }

    if (lower.startsWith('after:')) {
      const rest = token.slice(6).trim();
      if (rest) params.updatedFrom = rest;
      continue;
    }

    if (lower.startsWith('before:')) {
      const rest = token.slice(7).trim();
      if (rest) params.updatedTo = rest;
      continue;
    }

    qTokens.push(token);
  }

  if (tagVals.length) {
    const seen = new Set<string>();
    const uniq = tagVals.filter((t) => {
      const k = t.toLowerCase();
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
    params.tags = uniq.join(',');
  }

  return { q: qTokens.join(' ').trim(), params };
}
