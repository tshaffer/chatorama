import OpenAI from 'openai';

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v || !v.trim()) throw new Error(`Missing required environment variable: ${name}`);
  return v.trim();
}

let _client: OpenAI | null = null;

/**
 * Singleton OpenAI client for backend use.
 */
export function getOpenAIClient(): OpenAI {
  if (_client) return _client;

  const apiKey = requireEnv('OPENAI_API_KEY');
  _client = new OpenAI({ apiKey });
  return _client;
}
