// packages/chatworthy/src/recipeExtractor.ts
// Shared JSON-LD recipe extractor for Chatworthy recipe capture/importers.

function safeJsonParse(text: string): unknown | null {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function asArray(x: unknown): unknown[] {
  return Array.isArray(x) ? x : [x];
}

function isRecipeNode(node: any): boolean {
  if (!node || typeof node !== 'object') return false;
  const t = (node['@type'] ?? node['type']) as any;
  if (!t) return false;

  if (typeof t === 'string') return t.toLowerCase() === 'recipe';
  if (Array.isArray(t)) return t.some((v) => typeof v === 'string' && v.toLowerCase() === 'recipe');

  return false;
}

/**
 * Scan all ld+json blocks. NYT typically has a single JSON object with @type Recipe,
 * but we handle arrays and @graph as well.
 */
export function extractRecipeJsonLdFromDocument(doc: Document): unknown | null {
  const scripts = Array.from(
    doc.querySelectorAll<HTMLScriptElement>('script[type="application/ld+json"]'),
  );

  for (const s of scripts) {
    const raw = (s.textContent || '').trim();
    if (!raw) continue;

    const parsed = safeJsonParse(raw);
    if (!parsed) continue;

    const candidates: unknown[] = [];

    const pushCandidate = (x: unknown) => {
      if (!x) return;
      candidates.push(x);
    };

    if (Array.isArray(parsed)) {
      for (const item of parsed) pushCandidate(item);
    } else if (typeof parsed === 'object' && parsed) {
      const obj: any = parsed;
      pushCandidate(obj);
      if (obj['@graph']) {
        for (const g of asArray(obj['@graph'])) pushCandidate(g);
      }
      if (obj['mainEntity']) pushCandidate(obj['mainEntity']);
    }

    const flattened: unknown[] = [];
    for (const c of candidates) {
      if (Array.isArray(c)) flattened.push(...c);
      else flattened.push(c);
    }

    for (const node of flattened) {
      if (isRecipeNode(node)) return node;
    }
  }

  return null;
}
