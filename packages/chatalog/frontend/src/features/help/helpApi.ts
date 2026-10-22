export interface HelpAskCitation {
  slug: string;
  title: string;
}

export interface HelpConversationTurn {
  question: string;
  answer: string;
  citedSlugs: string[];
  toolUseId: string;
}

export interface HelpAskResult {
  answer: string;
  citations: HelpAskCitation[];
  citedSlugs: string[];
  toolUseId: string;
}

export async function askHelpQuestion(
  question: string,
  history: HelpConversationTurn[] = [],
): Promise<HelpAskResult> {
  const response = await fetch('/api/v1/help/ask', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question, history }),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`HTTP ${response.status}: ${text}`);
  }
  return (await response.json()) as HelpAskResult;
}
