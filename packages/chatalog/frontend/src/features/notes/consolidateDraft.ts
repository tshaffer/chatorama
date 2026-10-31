// frontend/src/features/notes/consolidateDraft.ts
// Streams a Consolidate draft from the backend.
import type { ConsolidateDraftRequest } from '@chatorama/chatalog-shared';
import { parseJsonHeader, streamText } from './streamText';

export type ConsolidateExcludedNote = { id: string; title: string; reason: string };

export type ConsolidateDraftMeta = {
  excluded: ConsolidateExcludedNote[];
  inputChars: number;
};

export function streamConsolidateDraft(args: {
  topicId: string;
  body: ConsolidateDraftRequest;
  signal: AbortSignal;
  onMeta?: (meta: ConsolidateDraftMeta) => void;
  onText: (fullTextSoFar: string) => void;
}): Promise<string> {
  const { topicId, body, signal, onMeta, onText } = args;
  return streamText({
    path: `/topics/${topicId}/consolidate/draft`,
    body,
    signal,
    onText,
    onResponse: (res) =>
      onMeta?.({
        excluded: parseJsonHeader<ConsolidateExcludedNote[]>(res, 'X-Consolidate-Excluded', []),
        inputChars: Number(res.headers.get('X-Consolidate-Input-Chars') ?? 0),
      }),
  });
}
