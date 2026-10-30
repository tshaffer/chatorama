// frontend/src/features/notes/consolidateDraft.ts
// Streams a Consolidate draft from the backend. RTK Query doesn't stream, so this
// is a plain fetch that reads the text/plain response body as it arrives.
import type { ConsolidateDraftRequest } from '@chatorama/chatalog-shared';
import { apiUrl } from '../../lib/apiBase';

export type ConsolidateExcludedNote = { id: string; title: string; reason: string };

export type ConsolidateDraftMeta = {
  excluded: ConsolidateExcludedNote[];
  inputChars: number;
};

const ERROR_MARKER = '[[CONSOLIDATE_ERROR]]';

export async function streamConsolidateDraft(args: {
  topicId: string;
  body: ConsolidateDraftRequest;
  signal: AbortSignal;
  onMeta?: (meta: ConsolidateDraftMeta) => void;
  onText: (fullTextSoFar: string) => void;
}): Promise<string> {
  const { topicId, body, signal, onMeta, onText } = args;

  const res = await fetch(apiUrl(`/topics/${topicId}/consolidate/draft`), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });

  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const data = await res.json();
      if (data?.message) message = data.message;
    } catch {
      // not JSON
    }
    throw new Error(message);
  }

  let excluded: ConsolidateExcludedNote[] = [];
  try {
    excluded = JSON.parse(decodeURIComponent(res.headers.get('X-Consolidate-Excluded') ?? '%5B%5D'));
  } catch {
    excluded = [];
  }
  onMeta?.({ excluded, inputChars: Number(res.headers.get('X-Consolidate-Input-Chars') ?? 0) });

  if (!res.body) throw new Error('The server returned no draft.');

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let text = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    text += decoder.decode(value, { stream: true });
    const markerAt = text.indexOf(ERROR_MARKER);
    if (markerAt >= 0) {
      throw new Error(text.slice(markerAt + ERROR_MARKER.length).trim() || 'Draft failed');
    }
    onText(text);
  }
  text += decoder.decode();
  onText(text);
  return text;
}
