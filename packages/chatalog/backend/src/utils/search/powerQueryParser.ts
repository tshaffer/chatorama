export type ParsedPowerQuery = {
  raw: string;
  terms: string[];
  phrases: string[];
  mustTerms: string[];
  anyTerms: string[];
  notTerms: string[];
  hasExplicitOr: boolean;
};

function tokenize(input: string): string[] {
  const s = String(input ?? '').trim();
  if (!s) return [];
  const re = /"([^"\\]*(?:\\.[^"\\]*)*)"|(\S+)/g;
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) {
    const phrase = m[1];
    const word = m[2];
    if (phrase != null) out.push(`"${phrase}"`);
    else if (word != null) out.push(word);
  }
  return out;
}

function dedupeCaseInsensitive(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of values) {
    const key = v.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(v);
  }
  return out;
}

export function parsePowerQuery(input: string): ParsedPowerQuery {
  const raw = String(input ?? '').trim();
  const toks = tokenize(raw);

  const terms: string[] = [];
  const phrases: string[] = [];
  const mustTerms: string[] = [];
  const anyTerms: string[] = [];
  const notTerms: string[] = [];

  let inAnyGroup = false;

  const pushTerm = (rawToken: string) => {
    if (!rawToken) return;
    const isNeg = rawToken.startsWith('-') && rawToken.length > 1;
    const token = isNeg ? rawToken.slice(1) : rawToken;

    const isQuoted = token.startsWith('"') && token.endsWith('"') && token.length >= 2;
    const inner = isQuoted ? token.slice(1, -1).trim() : token.trim();
    if (!inner) return;

    const normalized = inner.toLowerCase();

    if (isNeg) {
      notTerms.push(normalized);
      return;
    }

    if (isQuoted) {
      phrases.push(normalized);
      return;
    }

    terms.push(normalized);
    if (inAnyGroup) anyTerms.push(normalized);
    else mustTerms.push(normalized);
  };

  for (const t of toks) {
    if (t === 'OR' || t === 'or' || t === '|') {
      inAnyGroup = true;
      continue;
    }
    pushTerm(t);
  }

  const dedupedTerms = dedupeCaseInsensitive(terms);
  const dedupedPhrases = dedupeCaseInsensitive(phrases);
  const dedupedMust = dedupeCaseInsensitive(mustTerms);
  const dedupedAny = dedupeCaseInsensitive(anyTerms);
  const dedupedNot = dedupeCaseInsensitive(notTerms);

  return {
    raw,
    terms: dedupedTerms,
    phrases: dedupedPhrases,
    mustTerms: dedupedMust,
    anyTerms: dedupedAny,
    notTerms: dedupedNot,
    hasExplicitOr: dedupedAny.length > 0,
  };
}
