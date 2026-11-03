// frontend/src/features/notes/askNotes.ts
// Streams an Ask Claude answer about a set of notes.
import type { AskAllEvent, AskAllRequest, AskNotesRequest, AskSource } from '@chatorama/chatalog-shared';
import { apiUrl } from '../../lib/apiBase';
import { parseJsonHeader, streamText } from './streamText';
import type { ConsolidateExcludedNote } from './consolidateDraft';

export type AskNotesSource = AskSource;

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

// Streams an answer across all notes. Claude searches as it goes: onActivity
// reports each search, onSource each note it reads (numbered in order), and
// onText the answer so far.
export async function streamAskAll(args: {
  body: AskAllRequest;
  signal: AbortSignal;
  onActivity: (text: string) => void;
  onSource: (source: AskSource) => void;
  onText: (fullTextSoFar: string) => void;
}): Promise<string> {
  const { body, signal, onActivity, onSource, onText } = args;
  const res = await fetch(apiUrl('/ask/stream'), {
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
  if (!res.body) throw new Error('The server returned nothing.');

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffered = '';
  let text = '';
  const handle = (line: string) => {
    if (!line.trim()) return;
    const event = JSON.parse(line) as AskAllEvent;
    if (event.type === 'activity') onActivity(event.text);
    else if (event.type === 'source') onSource(event.source);
    else if (event.type === 'restart') {
      text = '';
      onText(text);
    } else if (event.type === 'text') {
      text += event.text;
      onText(text);
    } else if (event.type === 'error') throw new Error(event.message || 'Request failed');
  };
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffered += decoder.decode(value, { stream: true });
    const lines = buffered.split('\n');
    buffered = lines.pop() ?? '';
    lines.forEach(handle);
  }
  handle(buffered + decoder.decode());
  return text;
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
