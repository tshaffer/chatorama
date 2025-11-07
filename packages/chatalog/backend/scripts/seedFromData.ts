// backend/scripts/seedFromData.ts
import 'dotenv/config';
import { connectToDatabase, disconnectFromDatabase } from '../src/db/mongoose';
import { SubjectModel } from '../src/models/Subject';
import { TopicModel } from '../src/models/Topic';
import { NoteModel } from '../src/models/Note';

// ⬇️ Adjust this import path if your repo layout differs.
// You said the file is at: server/src/data/chatalogData.ts
// If this script is at backend/scripts/seedFromData.ts, the relative path is likely:
import { subjects, topics, notes } from '../src/data/chatalogData';

function slugify(s: string) {
  return (s || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

async function run() {
  await connectToDatabase();

  // OPTIONAL: wipe existing—comment out if you prefer merging
  await SubjectModel.deleteMany({});
  await TopicModel.deleteMany({});
  await NoteModel.deleteMany({});

  // Maps from seed IDs (e.g., "s1", "t2") to real Mongo ObjectIds (as strings)
  const subjectIdMap = new Map<string, string>();
  const topicIdMap = new Map<string, string>();

  // ---- Insert Subjects ----
  for (const s of subjects) {
    const doc = await SubjectModel.create({
      name: s.name,
      slug: s.slug ?? slugify(s.name),
    });
    subjectIdMap.set(s._id, String(doc._id));
  }

  // ---- Insert Topics ----
  for (const t of topics) {
    const mongoSubjectId = subjectIdMap.get(t.subjectId);
    if (!mongoSubjectId) {
      console.warn(`[seed] Skipping topic "${t.name}" — unknown subjectId "${t.subjectId}"`);
      continue;
    }
    const doc = await TopicModel.create({
      subjectId: mongoSubjectId,
      name: t.name,
      slug: t.slug ?? slugify(t.name),
    });
    topicIdMap.set(t._id, String(doc._id));
  }

  // ---- Insert Notes ----
  for (const n of notes) {
    const mongoSubjectId = n.subjectId ? subjectIdMap.get(n.subjectId) : undefined;
    const mongoTopicId = n.topicId ? topicIdMap.get(n.topicId) : undefined;

    if (!mongoTopicId) {
      console.warn(
        `[seed] Skipping note "${n.title}" — unknown topicId "${n.topicId}". (subjectId=${n.subjectId})`
      );
      continue;
    }

    await NoteModel.create({
      subjectId: mongoSubjectId,
      topicId: mongoTopicId,
      title: n.title,
      slug: n.slug ?? slugify(n.title),
      markdown: n.markdown ?? '',
      summary: n.summary ?? '',
      tags: n.tags ?? [],
      links: n.links ?? [],
      backlinks: n.backlinks ?? [],
    });
  }

  await disconnectFromDatabase();
  console.log('✅ Seed complete');
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
