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
  if (!markdown || typeof markdown !== 'string') return [];

  const text = markdown.replace(/\r\n/g, '\n');
  const promptRe = /\*\*Prompt\*\*/gi;
  const responseRe = /\*\*Response\*\*/gi;

  const turns: LogicalTurn[] = [];
  let promptMatch: RegExpExecArray | null;
  let turnIndex = 0;

  while ((promptMatch = promptRe.exec(text)) !== null) {
    const promptStart = promptMatch.index + promptMatch[0].length;

    responseRe.lastIndex = promptStart;
    const responseMatch = responseRe.exec(text);
    if (!responseMatch) {
      break; // no response after this prompt; stop parsing
    }

    const responseStart = responseMatch.index + responseMatch[0].length;

    // find next prompt to bound the response
    promptRe.lastIndex = responseStart;
    const nextPromptMatch = promptRe.exec(text);
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

    if (!nextPromptMatch) break;
  }

  if (!turns.length) {
    return [{ prompt: '', response: normalizeText(text), turnIndex: 0 }];
  }

  return turns;
}
