export interface AskSource {
  id: string;
  title: string;
  docKind: 'note' | 'recipe';
}

export interface AskConversationTurn {
  question: string;
  answer: string;
}

export interface AskResult {
  answer: string;
  sources: AskSource[];
}

export async function askQuestion(
  question: string,
  history: AskConversationTurn[] = [],
): Promise<AskResult> {
  const response = await fetch('/api/v1/ask', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question, history }),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`HTTP ${response.status}: ${text}`);
  }
  return (await response.json()) as AskResult;
}
