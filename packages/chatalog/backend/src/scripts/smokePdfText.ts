import fs from 'fs/promises';
import { extractPdfText } from '../services/pdfText';

async function run() {
  const pdfPath = process.argv[2];
  if (!pdfPath) {
    throw new Error('Usage: tsx src/scripts/smokePdfText.ts <pdf-path>');
  }

  const buffer = await fs.readFile(pdfPath);
  const result = await extractPdfText(buffer);

  console.log(
    JSON.stringify(
      { textLength: result.text.length, pageCount: result.pageCount },
      null,
      2
    )
  );
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
