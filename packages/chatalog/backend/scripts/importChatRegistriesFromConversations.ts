import { connectToDatabase, disconnectFromDatabase } from '../src/db/mongoose';
import { importChatRegistriesFromFile } from '../src/routes/imports.baseline';

async function main() {
  const filePath = process.argv[2] ?? null;
  const dryRun = process.argv.includes('--dry-run');

  await connectToDatabase();
  try {
    const result = await importChatRegistriesFromFile({ filePath, dryRun });
    console.log(JSON.stringify(result, null, 2));
  } finally {
    await disconnectFromDatabase();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
