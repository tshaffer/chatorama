import { TurnFingerprintModel } from '../models/TurnFingerprintModel';

function ensureMongoUri(): string {
  const uri = process.env.MONGO_URI;
  if (!uri) {
    console.error('MONGO_URI env var is required.');
    process.exit(1);
  }
  return uri;
}

async function main() {
  ensureMongoUri();
  const db = await import('../db/mongoose');
  await db.connectToDatabase();

  try {
    // Create indexes declared in schema.
    // If the UNIQUE index fails, you’ll see an error — and we’ll handle it in Step 2.
    await TurnFingerprintModel.createIndexes();
    console.log('TurnFingerprint indexes ensured via createIndexes().');
  } finally {
    await db.disconnectFromDatabase();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
