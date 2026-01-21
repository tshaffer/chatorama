import { PDFParse } from 'pdf-parse';

function normalizePdfText(text: string): string {
  const normalizedLines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const paragraphs = normalizedLines
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.replace(/\s+/g, ' ').trim())
    .filter(Boolean);

  return paragraphs.join('\n\n').trim();
}

export async function extractPdfText(
  buffer: Buffer
): Promise<{ text: string; pageCount?: number }> {
  // Normalize whitespace while preserving paragraph breaks, then enforce 200+ chars.
  const parser = new PDFParse({ data: buffer });
  let result;
  try {
    result = await parser.getText();
  } finally {
    await parser.destroy();
  }

  const text = normalizePdfText(result.text ?? '');

  if (text.length < 200) {
    throw new Error('No extractable text found (scanned PDFs are not supported)');
  }

  return { text, pageCount: result.total };
}
