import { NoteModel } from '../models/Note';
import { extractPromptResponseTurns, hashPromptResponsePair } from '../utils/textHash';

function ensureMongoUri(): string {
  const uri = process.env.MONGO_URI;
  if (!uri) {
    console.error('MONGO_URI env var is required.');
    console.error("Example: MONGO_URI='mongodb+srv://...' npx ts-node ...");
    process.exit(1);
  }
  return uri;
}

async function main() {

  ensureMongoUri();

  // ✅ explicitly connect / disconnect like the audit script
  const db = await import('../db/mongoose');
  await db.connectToDatabase();

  try {
    const noteId = process.argv[2];
    const turnIndex = Number(process.argv[3] ?? '5');
    if (!noteId) throw new Error('Usage: debug-db-turn.ts <noteId> [turnIndex]');

    const note = await NoteModel.findById(noteId, { title: 1, markdown: 1 }).lean().exec();
    if (!note) throw new Error(`Note not found: ${noteId}`);

    const turns = extractPromptResponseTurns((note as any).markdown ?? '');
    const t = turns.find((x) => (x.turnIndex ?? -1) === turnIndex) ?? turns[turnIndex];

    console.log('NOTE title:', (note as any).title);
    console.log('DB turns length:', turns.length);
    console.log('DB turnIndex requested:', turnIndex);
    console.log('DB extracted turnIndex:', t?.turnIndex);
    console.log('DB prompt:', JSON.stringify(t?.prompt));
    console.log('DB response:', JSON.stringify(t?.response));
    console.log('DB pairHash:', t ? hashPromptResponsePair(t.prompt, t.response) : null);

    console.log('prompt length:', t?.prompt?.length);
    console.log('response length:', t?.response?.length);

  } finally {
    await db.disconnectFromDatabase();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
