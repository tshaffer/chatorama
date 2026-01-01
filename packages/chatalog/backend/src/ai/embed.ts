import { getOpenAIClient } from './openaiClient';

export type EmbedOptions = {
  model?: string; // default "text-embedding-3-small"
  dimensions?: number; // optional: only supported by some embedding models
  /**
   * If true, throw if the embedding is not the expected length.
   * If you pass expectedDimensions, you can enforce it.
   */
  expectedDimensions?: number;
};

/**
 * Generate a single embedding vector for a given text.
 * Returns a plain number[] suitable for storing in MongoDB.
 */
export async function embedText(
  text: string,
  opts: EmbedOptions = {},
): Promise<{ vector: number[]; model: string }> {
  const client = getOpenAIClient();

  const model = opts.model ?? 'text-embedding-3-small';

  // Keep text non-empty; upstream callers should handle "skip" logic if needed.
  const input = (text ?? '').trim();
  if (!input) throw new Error('embedText: input text is empty');

  // The OpenAI SDK supports optional dimensions for certain embedding models.
  // We only include it if provided to avoid API errors on unsupported models.
  const response = await client.embeddings.create({
    model,
    input,
    ...(typeof opts.dimensions === 'number' ? { dimensions: opts.dimensions } : {}),
  });

  const vector = response.data?.[0]?.embedding as number[] | undefined;
  if (!vector || !Array.isArray(vector) || vector.length === 0) {
    throw new Error('embedText: OpenAI returned no embedding');
  }

  if (typeof opts.expectedDimensions === 'number' && vector.length !== opts.expectedDimensions) {
    throw new Error(
      `embedText: unexpected embedding length ${vector.length}; expected ${opts.expectedDimensions}`,
    );
  }

  return { vector, model };
}
