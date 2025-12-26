export function slugifyStandard(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

export function slugifyAscentStripping(s: string): string {
  return (s || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')     // strip accents
    .replace(/[^a-z0-9]+/g, '-')         // non-alnum -> dashes
    .replace(/(^-|-$)/g, '')             // trim dashes
    .slice(0, 80) || 'note';
}

export type LogicalTurn = {
  prompt: string;
  response: string;
  turnIndex: number;
};


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
