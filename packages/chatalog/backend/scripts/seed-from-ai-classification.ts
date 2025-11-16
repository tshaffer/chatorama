// scripts/seed-from-ai-classification.ts
//
// Seed Chatalog from:
//   1) ai-classification JSON (LLM output)
//   2) ai-seed JSON (Chatworthy-derived markdown + aiNoteKey)
//
// Usage (from packages/chatalog/backend):
//   MONGO_URI="mongodb://localhost:27017/chatalog" \
//   npx ts-node scripts/seed-from-ai-classification.ts \
//     ./data/ai-classification-v1.json \
//     ./data/ai-seed.json
//

import fs from 'fs';
import path from 'path';
import mongoose from 'mongoose';
import { SubjectModel } from '../src/models/Subject';
import { TopicModel } from '../src/models/Topic';
import { NoteModel } from '../src/models/Note';

// ---------- Types matching our JSONs ----------

type ClassificationSubject = {
  id: string;
  name: string;
};

type ClassificationTopic = {
  id: string;
  subjectId: string;
  name: string;
};

type ClassificationTopicRelation = {
  sourceTopicId: string;
  targetTopicId: string;
  kind: string;
};

type ClassificationNote = {
  aiNoteKey: string;
  chatworthyNoteId: string;
  fileName: string;
  subjectId: string;
  topicId: string;
  suggestedTitle: string;
};

type ClassificationRoot = {
  version: number;
  subjects: ClassificationSubject[];
  topics: ClassificationTopic[];
  topicRelations?: ClassificationTopicRelation[];
  notes: ClassificationNote[];
};

type AiSeedNote = {
  aiNoteKey: string;
  chatworthyNoteId: string;
  fileName: string;
  turnIndex: number;
  chatTitle?: string;
  subjectHint?: string;
  topicHint?: string;
  markdown: string;
};

type AiSeedRoot = {
  version: number;
  generatedAt: string;
  notes: AiSeedNote[];
};

// ---------- Helpers ----------

function slugify(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

/**
 * Ensure unique slugs per topic within this seed run.
 * DB is assumed empty, so we only need in-memory uniqueness.
 */
class SlugRegistry {
  private used = new Map<string, Set<string>>(); // topicIdMongo -> slugs

  getUniqueSlug(topicId: string, base: string): string {
    const seed = base || 'untitled';
    if (!this.used.has(topicId)) this.used.set(topicId, new Set());
    const set = this.used.get(topicId)!;

    let slug = seed;
    let i = 2;
    while (set.has(slug)) {
      slug = `${seed}-${i++}`;
    }
    set.add(slug);
    return slug;
  }
}

// ---------- Main ----------

async function main() {
  const classificationPath = process.argv[2];
  const seedPath = process.argv[3];

  if (!classificationPath || !seedPath) {
    console.error(
      'Usage: ts-node scripts/seed-from-ai-classification.ts <classification.json> <ai-seed.json>'
    );
    process.exit(1);
  }

  const mongoUri = process.env.MONGO_URI;
  if (!mongoUri) {
    console.error('MONGO_URI env var is required');
    process.exit(1);
  }

  console.log('Connecting to Mongo:', mongoUri);
  await mongoose.connect(mongoUri);

  const absClassification = path.resolve(process.cwd(), classificationPath);
  const absSeed = path.resolve(process.cwd(), seedPath);

  console.log('Reading classification from:', absClassification);
  const classificationRaw = fs.readFileSync(absClassification, 'utf8');
  const classification: ClassificationRoot = JSON.parse(classificationRaw);

  console.log('Reading AI seed from:', absSeed);
  const seedRaw = fs.readFileSync(absSeed, 'utf8');
  const seed: AiSeedRoot = JSON.parse(seedRaw);

  // Build quick lookup: aiNoteKey -> seed note
  const seedByKey = new Map<string, AiSeedNote>();
  for (const n of seed.notes) {
    seedByKey.set(n.aiNoteKey, n);
  }

  // --- Clear existing collections (since you're starting from empty) ---
  console.log('Clearing existing Subjects, Topics, Notes...');
  await NoteModel.deleteMany({});
  await TopicModel.deleteMany({});
  await SubjectModel.deleteMany({});

  // --- Create Subjects ---
  console.log(`Creating ${classification.subjects.length} subject(s)...`);
  const subjectIdMap = new Map<string, string>(); // classification.id -> mongoId

  for (const subj of classification.subjects) {
    const doc = await SubjectModel.create({
      name: subj.name,
      slug: slugify(subj.name),
    });
    subjectIdMap.set(subj.id, doc.id);
  }

  // --- Create Topics ---
  console.log(`Creating ${classification.topics.length} topic(s)...`);
  const topicIdMap = new Map<string, string>(); // classification.id -> mongoId

  for (const topic of classification.topics) {
    const subjectMongoId = subjectIdMap.get(topic.subjectId);
    if (!subjectMongoId) {
      console.warn(
        `Topic ${topic.id} refers to unknown subjectId ${topic.subjectId}; skipping`
      );
      continue;
    }

    const doc = await TopicModel.create({
      subjectId: subjectMongoId,
      name: topic.name,
      slug: slugify(topic.name),
    });

    topicIdMap.set(topic.id, doc.id);
  }

  // --- Create Notes ---
  console.log(`Creating ${classification.notes.length} note(s)...`);
  const slugRegistry = new SlugRegistry();
  const topicOrderCounter = new Map<string, number>(); // topicMongoId -> next order

  function nextOrder(topicMongoId: string): number {
    const cur = topicOrderCounter.get(topicMongoId) ?? 0;
    topicOrderCounter.set(topicMongoId, cur + 1);
    return cur;
  }

  let createdCount = 0;
  let skippedCount = 0;

  for (const n of classification.notes) {
    const seedNote = seedByKey.get(n.aiNoteKey);
    if (!seedNote) {
      console.warn(`No seed note found for aiNoteKey=${n.aiNoteKey}; skipping`);
      skippedCount++;
      continue;
    }

    const subjectMongoId = subjectIdMap.get(n.subjectId);
    const topicMongoId = topicIdMap.get(n.topicId);

    if (!topicMongoId) {
      console.warn(
        `No topic mongoId for classification topicId=${n.topicId}; skipping note aiNoteKey=${n.aiNoteKey}`
      );
      skippedCount++;
      continue;
    }

    const title = n.suggestedTitle || seedNote.chatTitle || 'Untitled';
    const baseSlug = slugify(title);
    const slug = slugRegistry.getUniqueSlug(topicMongoId, baseSlug);
    const order = nextOrder(topicMongoId);

    await NoteModel.create({
      subjectId: subjectMongoId ?? '',
      topicId: topicMongoId,
      title,
      slug,
      markdown: seedNote.markdown,
      summary: undefined,
      tags: [],
      links: [],
      backlinks: [],
      relations: [],
      sources: [
        {
          type: 'chatworthy',
          url: undefined, // could eventually store seedNote.fileName or pageUrl if present
        },
      ],
      order,
      // If you added these fields to NoteDoc earlier, you can include them:
      // chatworthyNoteId: seedNote.chatworthyNoteId,
      // chatworthyTurnIndex: seedNote.turnIndex,
      // aiNoteKey: seedNote.aiNoteKey,
    } as any);

    createdCount++;
  }

  console.log(`Done. Created ${createdCount} notes, skipped ${skippedCount}.`);

  await mongoose.disconnect();
  console.log('Disconnected from Mongo.');
}

main().catch((err) => {
  console.error('Unhandled error in seed-from-ai-classification:', err);
  process.exit(1);
});
