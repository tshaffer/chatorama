// frontend/src/features/notes/askNotes.ts
// Streams an Ask Claude answer about a set of notes.
import type { AskNotesRequest } from '@chatorama/chatalog-shared';
import { parseJsonHeader, streamText } from './streamText';
import type { ConsolidateExcludedNote } from './consolidateDraft';

export type AskNotesSource = { id: string; title: string };

export type AskNotesMeta = {
  // In citation order: [1] is sources[0]
  sources: AskNotesSource[];
  excluded: ConsolidateExcludedNote[];
  inputChars: number;
};

export function streamAskNotes(args: {
  topicId: string;
  body: AskNotesRequest;
  signal: AbortSignal;
  onMeta?: (meta: AskNotesMeta) => void;
  onText: (fullTextSoFar: string) => void;
}): Promise<string> {
  const { topicId, body, signal, onMeta, onText } = args;
  return streamText({
    path: `/topics/${topicId}/ask-notes`,
    body,
    signal,
    onText,
    onResponse: (res) =>
      onMeta?.({
        sources: parseJsonHeader<AskNotesSource[]>(res, 'X-Ask-Notes', []),
        excluded: parseJsonHeader<ConsolidateExcludedNote[]>(res, 'X-Consolidate-Excluded', []),
        inputChars: Number(res.headers.get('X-Consolidate-Input-Chars') ?? 0),
      }),
  });
}

// Turn citations like [2] or [1][3] into links to the cited notes. Code blocks
// and existing Markdown links are left alone.
export function linkCitations(markdown: string, sources: AskNotesSource[]): string {
  return markdown
    .split(/(```[\s\S]*?```|`[^`\n]*`)/)
    .map((part, i) =>
      i % 2 === 1
        ? part
        : part.replace(/\[(\d{1,3})\](?![(:])/g, (match, num) => {
            const source = sources[Number(num) - 1];
            return source ? `[\\[${num}\\]](/n/${source.id} "${source.title.replace(/"/g, "'")}")` : match;
          }),
    )
    .join('');
}

// Note numbers cited in an answer, in first-cited order.
export function citedSources(markdown: string, sources: AskNotesSource[]): AskNotesSource[] {
  const seen = new Set<number>();
  for (const m of markdown.matchAll(/\[(\d{1,3})\]/g)) {
    const n = Number(m[1]);
    if (n >= 1 && n <= sources.length) seen.add(n);
  }
  return Array.from(seen).map((n) => sources[n - 1]);
}
