import crypto from 'crypto';

/** Normalize text for stable hashing. */
export function normalizeText(text: string): string {
  if (!text) return '';
  return text
    .replace(/\r\n/g, '\n') // CRLF -> LF
    .replace(/[ \t]+\n/g, '\n') // trim trailing spaces/tabs per line
    .trim();
}

/**
 * Compute a SHA-256 hash for a prompt/response pair after normalization.
 */
export function hashPromptResponsePair(prompt: string, response: string): string {
  const normalizedPrompt = normalizeText(prompt);
  const normalizedResponse = normalizeText(response);
  const combined = `${normalizedPrompt}\n\n---\n\n${normalizedResponse}`;
  return crypto.createHash('sha256').update(combined, 'utf8').digest('hex');
}

export type LogicalTurn = {
  prompt: string;
  response: string;
  turnIndex: number;
};

/**
 * Attempt to extract logical prompt/response pairs from markdown that uses
 * repeated "## Prompt" / "## Response" headings. Falls back to a single
 * pair with the whole body as the response when no pairs are detected.
 */
export function extractPromptResponseTurns(markdown: string): LogicalTurn[] {
  const normalized = normalizeText(markdown);
  if (!normalized) return [];

  type Section = { type: 'prompt' | 'response'; start: number; end: number; headingStart: number };

  const headingRe = /^##\s*(Prompt|Response)\b.*$/gim;
  const sections: Section[] = [];
  let match: RegExpExecArray | null;
  while ((match = headingRe.exec(normalized))) {
    const type = match[1].toLowerCase() === 'prompt' ? 'prompt' : 'response';
    const headingStart = match.index ?? 0;
    const start = headingStart + match[0].length;
    sections.push({ type, start, end: normalized.length, headingStart });
  }

  // determine end offsets
  for (let i = 0; i < sections.length; i++) {
    const nextHeadingStart = i + 1 < sections.length ? sections[i + 1].headingStart : normalized.length;
    sections[i].end = nextHeadingStart;
  }

  const turns: LogicalTurn[] = [];
  let currentPrompt = '';
  let promptIdx = 0;

  for (const sec of sections) {
    const content = normalizeText(normalized.slice(sec.start, sec.end));
    if (sec.type === 'prompt') {
      currentPrompt = content;
      promptIdx = turns.length; // tentative index
    } else {
      // response
      const turnIndex = turns.length;
      turns.push({ prompt: currentPrompt, response: content, turnIndex });
      currentPrompt = '';
    }
  }

  if (!turns.length) {
    return [{ prompt: '', response: normalized, turnIndex: 0 }];
  }

  return turns.map((t, idx) => ({ ...t, turnIndex: idx }));
}
