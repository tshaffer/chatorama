import { normalizeText } from '@chatorama/chatalog-shared';
import * as crypto from 'crypto';

export type PairHashVersion = 1 | 2;

// Optional: leave this on temporarily while debugging module resolution.
// Remove once you’re confident.
console.log('[textHash] loaded from', __filename);

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

