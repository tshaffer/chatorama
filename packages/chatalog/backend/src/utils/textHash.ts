import * as crypto from 'crypto';

export type PairHashVersion = 1 | 2;

// Optional: leave this on temporarily while debugging module resolution.
// Remove once you’re confident.
console.log('[textHash] loaded from', __filename);

/**
 * Legacy normalization (v1 behavior).
 * Keep this stable to avoid changing existing parsing/UX behavior.
 */
export function normalizeText(text: string): string {
  if (!text) return '';
  return text
    .replace(/\r\n/g, '\n')      // CRLF -> LF
    .replace(/[ \t]+\n/g, '\n')  // trim trailing spaces/tabs per line
    .trim();
}

/**
 * Canonicalization for v2 pair hashing.
 * Goal: fix hash drift caused by:
 * - extra blank lines (e.g. \n\n\n vs \n\n)
 * - unicode normalization differences
 *
 * IMPORTANT: keep conservative; do not change semantic content.
 */
function canonicalizeForPairHashV2(s: string): string {
  // Start from the trusted legacy normalization.
  let t = normalizeText(s ?? '');

  // Collapse excessive blank lines: \n\n\n... -> \n\n
  t = t.replace(/\n{3,}/g, '\n\n');

  // Normalize Unicode (conservative for prose).
  // NFC avoids “looks same, hashes different”.
  if (typeof (t as any).normalize === 'function') {
    t = t.normalize('NFC');
  }

  return t;
}

function canonicalizeForPairHashV1(s: string): string {
  // Must remain exactly legacy behavior
  return normalizeText(s ?? '');
}

/**
 * Stable prompt/response pair hash.
 *
 * v1: legacy behavior
 * v2: canonicalized to reduce hash drift
 */
export function hashPromptResponsePair(
  prompt: string,
  response: string,
  version: PairHashVersion = 2,
): string {
  const normalizedPrompt =
    version === 2 ? canonicalizeForPairHashV2(prompt) : canonicalizeForPairHashV1(prompt);

  const normalizedResponse =
    version === 2 ? canonicalizeForPairHashV2(response) : canonicalizeForPairHashV1(response);

  const combined = `${normalizedPrompt}\n\n---\n\n${normalizedResponse}`;
  return crypto.createHash('sha256').update(combined, 'utf8').digest('hex');
}

export type LogicalTurn = {
  prompt: string;
  response: string;
  turnIndex: number;
};

/**
 * Extract logical prompt/response turns from markdown that uses
 * repeated "**Prompt**" / "**Response**" markers.
 *
 * - Returns [] only if markdown is empty or non-string.
 * - If no turns are detected, returns a single turn with empty prompt
 *   and the whole body as response.
 */
export function extractPromptResponseTurns(markdown: string): LogicalTurn[] {
  if (!markdown || typeof markdown !== 'string') return [];

  // Normalize line endings once for parsing consistency
  const text = markdown.replace(/\r\n/g, '\n');

  const promptRe = /\*\*Prompt\*\*/gi;
  const responseRe = /\*\*Response\*\*/gi;

  const turns: LogicalTurn[] = [];
  let promptMatch: RegExpExecArray | null;
  let turnIndex = 0;

  while ((promptMatch = promptRe.exec(text)) !== null) {
    const promptStart = promptMatch.index + promptMatch[0].length;

    // Find the Response after this Prompt
    responseRe.lastIndex = promptStart;
    const responseMatch = responseRe.exec(text);
    if (!responseMatch) break;

    const responseStart = responseMatch.index + responseMatch[0].length;

    // Find the next Prompt after this Response (use a separate regex instance)
    const nextPromptRe = /\*\*Prompt\*\*/gi;
    nextPromptRe.lastIndex = responseStart;
    const nextPromptMatch = nextPromptRe.exec(text);
    const responseEnd = nextPromptMatch ? nextPromptMatch.index : text.length;

    const rawPrompt = text.slice(promptStart, responseMatch.index);
    const rawResponse = text.slice(responseStart, responseEnd);

    const prompt = normalizeText(
      rawPrompt
        .split('\n')
        .map((line) => line.replace(/^\s*>\s?/, '')) // strip leading blockquote markers
        .join('\n'),
    );

    const response = normalizeText(rawResponse);

    if (prompt || response) {
      turns.push({ prompt, response, turnIndex });
      turnIndex += 1;
    }
  }

  if (!turns.length) {
    return [{ prompt: '', response: normalizeText(text), turnIndex: 0 }];
  }

  return turns;
}
