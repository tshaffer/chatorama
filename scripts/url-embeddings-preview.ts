/**
 * URL -> extracted readable text -> chunked embeddings preview.
 *
 * Usage:
 *   OPENAI_API_KEY=... npx tsx scripts/url-embeddings-preview.ts "https://example.com/article"
 *
 * Output:
 *   - prints a summary to stdout
 *   - writes ./tmp/url-embeddings-preview.json
 */

import fs from "node:fs";
import path from "node:path";
import { JSDOM } from "jsdom";
import { Readability } from "@mozilla/readability";
import OpenAI from "openai";

type ChunkEmbedding = {
  chunkIndex: number;
  text: string;
  embedding: number[];
};

type UrlEmbeddingsPreview = {
  url: string;
  fetchedAt: string;
  title?: string;
  byline?: string;
  excerpt?: string;
  contentTextChars: number;
  chunks: Array<{
    chunkIndex: number;
    textChars: number;
    embeddingDims: number;
  }>;
  chunkEmbeddings: ChunkEmbedding[];
};

function assertHttpUrl(raw: string): URL {
  const u = new URL(raw);
  if (u.protocol !== "http:" && u.protocol !== "https:") {
    throw new Error(`Only http/https URLs are allowed. Got: ${u.protocol}`);
  }
  return u;
}

/**
 * Very basic guardrails to avoid obvious SSRF footguns.
 * (For the experiment this is probably enough; for production you'd do more.)
 */
function disallowLocalhost(u: URL) {
  const host = u.hostname.toLowerCase();
  const blocked = new Set(["localhost", "127.0.0.1", "::1"]);
  if (blocked.has(host)) {
    throw new Error(`Refusing to fetch localhost URL: ${u.toString()}`);
  }
}

async function fetchHtml(url: string): Promise<string> {
  const res = await fetch(url, {
    redirect: "follow",
    headers: {
      "User-Agent":
        "Mozilla/5.0 (compatible; ChatalogUrlEmbeddingsPreview/1.0; +https://example.invalid)",
      Accept: "text/html,application/xhtml+xml",
    },
  });

  if (!res.ok) {
    throw new Error(`Fetch failed: ${res.status} ${res.statusText}`);
  }
  const ct = res.headers.get("content-type") ?? "";
  if (!ct.includes("text/html")) {
    throw new Error(`Expected text/html, got content-type: ${ct}`);
  }
  return await res.text();
}

function extractReadableText(url: string, html: string) {
  const dom = new JSDOM(html, { url });
  const reader = new Readability(dom.window.document);
  const article = reader.parse();
  if (!article) {
    const fallbackText = dom.window.document.body?.textContent ?? "";
    const text = fallbackText
      .replace(/\r/g, "")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();

    if (!text) {
      throw new Error("Readability could not parse article content.");
    }

    return {
      title: dom.window.document.title || undefined,
      byline: undefined,
      excerpt: undefined,
      text,
    };
  }

  const text = article.textContent
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return {
    title: article.title,
    byline: article.byline,
    excerpt: article.excerpt,
    text,
  };
}

/**
 * Chunker: tries to keep chunks under a rough character cap.
 * This is not token-accurate, but good enough for an experiment.
 */
function chunkText(text: string, maxCharsPerChunk = 6000): string[] {
  if (text.length <= maxCharsPerChunk) return [text];

  const paras = text.split(/\n{2,}/g);
  const chunks: string[] = [];
  let cur = "";

  for (const p of paras) {
    const candidate = cur ? `${cur}\n\n${p}` : p;
    if (candidate.length <= maxCharsPerChunk) {
      cur = candidate;
    } else {
      if (cur) chunks.push(cur);
      if (p.length > maxCharsPerChunk) {
        for (let i = 0; i < p.length; i += maxCharsPerChunk) {
          chunks.push(p.slice(i, i + maxCharsPerChunk));
        }
        cur = "";
      } else {
        cur = p;
      }
    }
  }
  if (cur) chunks.push(cur);

  return chunks;
}

async function embedChunks(chunks: string[], model = "text-embedding-3-small") {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("Missing OPENAI_API_KEY env var.");
  }
  const client = new OpenAI({ apiKey });

  const out: ChunkEmbedding[] = [];

  for (let i = 0; i < chunks.length; i++) {
    const input = chunks[i];
    const resp = await client.embeddings.create({
      model,
      input,
    });

    const emb = resp.data?.[0]?.embedding;
    if (!emb || !Array.isArray(emb)) {
      throw new Error(`No embedding returned for chunk ${i}.`);
    }

    out.push({ chunkIndex: i, text: input, embedding: emb });
  }

  return out;
}

async function main() {
  const rawUrl = process.argv[2];
  if (!rawUrl) {
    console.error("Usage: npx tsx scripts/url-embeddings-preview.ts \"https://...\"");
    process.exit(1);
  }

  const u = assertHttpUrl(rawUrl);
  disallowLocalhost(u);

  const html = await fetchHtml(u.toString());
  const { title, byline, excerpt, text } = extractReadableText(u.toString(), html);

  const chunks = chunkText(text, 6000);
  const chunkEmbeddings = await embedChunks(chunks, "text-embedding-3-small");

  const preview: UrlEmbeddingsPreview = {
    url: u.toString(),
    fetchedAt: new Date().toISOString(),
    title,
    byline,
    excerpt,
    contentTextChars: text.length,
    chunks: chunkEmbeddings.map((c) => ({
      chunkIndex: c.chunkIndex,
      textChars: c.text.length,
      embeddingDims: c.embedding.length,
    })),
    chunkEmbeddings,
  };

  console.log("URL:", preview.url);
  console.log("Title:", preview.title ?? "(none)");
  console.log("Extracted chars:", preview.contentTextChars);
  console.log("Chunks:", preview.chunks.length);
  console.log(
    "Embedding dims (first chunk):",
    preview.chunks[0]?.embeddingDims ?? "(none)"
  );

  const outDir = path.join(process.cwd(), "tmp");
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, "url-embeddings-preview.json");
  fs.writeFileSync(outPath, JSON.stringify(preview, null, 2), "utf8");
  console.log("Wrote:", outPath);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
