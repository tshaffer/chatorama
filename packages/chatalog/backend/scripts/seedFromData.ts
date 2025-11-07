import 'dotenv/config';
import mongoose from 'mongoose';

// --- quick inline models just for seed (use your real ones if you prefer)
const SubjectSchema = new mongoose.Schema({ name: String, slug: String });
const TopicSchema = new mongoose.Schema({ subjectId: String, name: String, slug: String });
const NoteSchema = new mongoose.Schema({
  subjectId: String,
  topicId: String,
  title: String,
  markdown: String,
});

const Subject = mongoose.model('Subject', SubjectSchema);
const Topic = mongoose.model('Topic', TopicSchema);
const Note = mongoose.model('Note', NoteSchema);

async function clearAllCollections() {
  const db = mongoose.connection.db;
  if (!db) throw new Error('No db connection');
  const cols = await db.listCollections().toArray();
  for (const c of cols) {
    // drop one by one to remove empty collections too
    await db.collection(c.name).drop().catch(async (err: any) => {
      // If drop fails (cap or system), fall back to deleteMany
      if (err?.codeName !== 'NamespaceNotFound') {
        await db.collection(c.name).deleteMany({});
      }
    });
  }
  console.log('✅ Cleared all collections');
}

async function main() {
  const uri = process.env.MONGO_URI;
  if (!uri) throw new Error('MONGO_URI missing. Create backend/.env');

  await mongoose.connect(uri);

  if (process.env.RESET_DB === '1') {
    try {
      await mongoose.connection.dropDatabase();
      console.log('✅ Dropped database');
    } catch (err) {
      console.warn('⚠️  dropDatabase not permitted on this user — falling back to per-collection clear');
      await clearAllCollections();
    }
  }

  // seed a tiny sample so the UI has something
  const subj = await Subject.create({ name: 'Samples', slug: 'samples' });
  const topic = await Topic.create({ subjectId: subj.id, name: 'Getting Started', slug: 'getting-started' });
  await Note.create({
    subjectId: subj.id,
    topicId: topic.id,
    title: 'Hello Chatalog',
    markdown:
      '# Hello Chatalog\n\nThis is a seeded note. If you can read this in the app, your DB wiring works. 🎉',
  });

  await mongoose.disconnect();
  console.log('✅ Seed complete');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
