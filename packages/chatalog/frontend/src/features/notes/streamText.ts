// frontend/src/features/notes/streamText.ts
// POSTs JSON and reads a text/plain response body as it arrives. RTK Query
// doesn't stream, so Claude-backed endpoints (Consolidate, Ask Claude) use this.
import { apiUrl } from '../../lib/apiBase';

// Must match STREAM_ERROR_MARKER in the backend's consolidateController.
const ERROR_MARKER = '[[CONSOLIDATE_ERROR]]';

export async function streamText(args: {
  path: string;
  body: unknown;
  signal: AbortSignal;
  onResponse?: (res: Response) => void;
  onText: (fullTextSoFar: string) => void;
}): Promise<string> {
  const { path, body, signal, onResponse, onText } = args;

  const res = await fetch(apiUrl(path), {
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

  onResponse?.(res);

  if (!res.body) throw new Error('The server returned no text.');

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let text = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    text += decoder.decode(value, { stream: true });
    const markerAt = text.indexOf(ERROR_MARKER);
    if (markerAt >= 0) {
      throw new Error(text.slice(markerAt + ERROR_MARKER.length).trim() || 'Request failed');
    }
    onText(text);
  }
  text += decoder.decode();
  onText(text);
  return text;
}

export function parseJsonHeader<T>(res: Response, name: string, fallback: T): T {
  try {
    const raw = res.headers.get(name);
    return raw ? (JSON.parse(decodeURIComponent(raw)) as T) : fallback;
  } catch {
    return fallback;
  }
}
