import Anthropic from '@anthropic-ai/sdk';

let _client: Anthropic | null = null;

export function getClaudeClient(): Anthropic {
  if (_client) return _client;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey?.trim()) throw new Error('Missing required environment variable: ANTHROPIC_API_KEY');
  _client = new Anthropic({ apiKey });
  return _client;
}
