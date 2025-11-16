// scripts/apply-ai-classification-batch.ts
//
// Incrementally apply an AI classification batch on TOP of an existing DB.
//
// Supports TWO classification shapes:
//
// 1) "Full" ai-classification-v1 style:
//    {
//      "version": 1,
//      "subjects": [{ "id": "S-...", "name": "..." }, ...],
//      "topics":   [{ "id": "T-...", "subjectId": "S-...", "name": "..." }, ...],
//      "notes": [
//        {
//          "aiNoteKey": "...",
//          "chatworthyNoteId": "...",
//          "fileName": "...",
//          "subjectId": "S-...",
//          "topicId": "T-...",
//          "suggestedTitle": "..."
//        },
//        ...
//      ]
//    }
//
// 2) "Minimal batch" style (what you used for batch-2):
//    {
//      "version": 1,
//      "generatedAt": "...",
//      "notes": [
//        {
//          "aiNoteKey": "...",
//          "subjectName": "Personal Health & Nutrition",
//          "topicName": "Balloon Angioplasty and Coronary Artery Disease",
//          "suggestedTitle": "What Is Balloon Angioplasty?"
//        },
//        ...
//      ]
//    }
//
// In all cases, this script:
//  - Reads the classification JSON
//  - Reads the ai-seed JSON (notes with aiNoteKey + markdown)
//  - Ensures Subjects and Topics exist (by name), creating them if needed
//  - Inserts new Notes with AI-suggested titles and markdown from the seed
//
// IMPORTANT: This script does NOT delete anything. It only adds.
//
// Usage (from packages/chatalog/backend):
//
//   MONGO_URI="mongodb://localhost:27017/chatalog" \
//   npx ts-node scripts/apply-ai-classification-batch.ts \
//     ./local-data/ai-classification-batch-2.json \
//     ./local-data/ai-seed-batch-2.json
//

import fs from 'fs';
import path from 'path';
import mongoose from 'mongoose';

import { SubjectModel } from '../src/models/Subject';
import { TopicModel } from '../src/models/Topic';
import { NoteModel } from '../src/models/Note';

// ---------- Types for "full" classification schema ----------

type FullClassificationSubject = {
  id: string;   // AI-level id, e.g. "S-personal-health-nutrition"
  name: string;
};

type FullClassificationTopic = {
  id: string;        // AI-level id, e.g. "T-on-ride-fuel-bars-vs-fruit"
  subjectId: string; // AI-level subject id
  name: string;
};

type FullClassificationNote = {
  aiNoteKey: string;
  chatworthyNoteId?: string;
  fileName?: string;
  subjectId?: string;     // AI-level subject id
  topicId?: string;       // AI-level topic id
  subjectName?: string;   // optional, for robustness
  topicName?: string;     // optional, for robustness
  suggestedTitle: string;
};

// ---------- Types for "minimal" classification schema ----------

type MinimalClassificationNote = {
  aiNoteKey: string;
  subjectName?: string;
  topicName?: string;
  suggestedTitle: string;
};

// ---------- Unified classification root ----------

type ClassificationRoot = {
  version: number;
  generatedAt?: string;
  subjects?: FullClassificationSubject[];
  topics?: FullClassificationTopic[];
  notes: (FullClassificationNote | MinimalClassificationNote)[];
};

// ---------- Types for ai-seed-*.json ----------

type AiSeedNote = {
  aiNoteKey: string;         // must match ClassificationNote.aiNoteKey
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
 * Cache-aware ensureSubjectByName: avoids repeated DB lookups.
 */
const subjectCache = new Map<string, string>(); // name -> mongoId

async function ensureSubjectByName(name: string): Promise<string> {
  const trimmed = name.trim();
  if (!trimmed) {
    throw new Error('ensureSubjectByName called with empty name');
  }

  const cached = subjectCache.get(trimmed);
  if (cached) return cached;

  let subject = await SubjectModel.findOne({ name: trimmed }).exec();
  if (!subject) {
    subject = await SubjectModel.create({
      name: trimmed,
      slug: slugify(trimmed),
    });
    console.log(`  Created Subject: "${trimmed}" (id=${subject.id})`);
  } else {
    console.log(`  Reusing existing Subject: "${trimmed}" (id=${subject.id})`);
  }

  subjectCache.set(trimmed, subject.id);
  return subject.id;
}

/**
 * Cache-aware ensureTopicByName: avoids repeated DB lookups.
 */
const topicCache = new Map<string, string>(); // subjectId::name -> mongoId

async function ensureTopicByName(subjectId: string, name: string): Promise<string> {
  const trimmed = name.trim();
  if (!trimmed) {
    throw new Error('ensureTopicByName called with empty name');
  }
  const key = `${subjectId}::${trimmed}`;

  const cached = topicCache.get(key);
  if (cached) return cached;

  let topic = await TopicModel.findOne({ subjectId, name: trimmed }).exec();
  if (!topic) {
    topic = await TopicModel.create({
      subjectId,
      name: trimmed,
      slug: slugify(trimmed),
    });
    console.log(
      `  Created Topic: "${trimmed}" (subjectId=${subjectId}, id=${topic.id})`
    );
  } else {
    console.log(
      `  Reusing existing Topic: "${trimmed}" (subjectId=${subjectId}, id=${topic.id})`
    );
  }

  topicCache.set(key, topic.id);
  return topic.id;
}

/**
 * Get a unique slug for a note within a topic, checking the DB.
 * This avoids violating the { topicId, slug } unique index if titles repeat.
 */
async function getUniqueNoteSlug(topicId: string, base: string): Promise<string> {
  const seed = base || 'untitled';
  let slug = seed;
  let i = 2;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    // eslint-disable-next-line no-await-in-loop
    const exists = await NoteModel.exists({ topicId, slug }).lean().exec();
    if (!exists) return slug;
    slug = `${seed}-${i++}`;
  }
}

/**
 * Maintain per-topic running "order" for new notes.
 * For each topic, on first use we query the current max(order) and start from there.
 */
const topicNextOrder = new Map<string, number>();

async function getNextOrder(topicId: string): Promise<number> {
  if (!topicNextOrder.has(topicId)) {
    const last = await NoteModel.findOne({ topicId })
      .sort({ order: -1 })
      .lean()
      .exec();
    const start = (last?.order ?? -1) + 1;
    topicNextOrder.set(topicId, start);
  }

  const next = topicNextOrder.get(topicId)!;
  topicNextOrder.set(topicId, next + 1);
  return next;
}

// ---------- Normalization: get subjectName/topicName for every note ----------

type NormalizedClassificationNote = {
  aiNoteKey: string;
  subjectName: string;
  topicName: string;
  suggestedTitle: string;
  // optional extras we might want to log later:
  chatworthyNoteId?: string;
  fileName?: string;
};

/**
 * Normalize various classification shapes so that each note has subjectName + topicName.
 */
function normalizeClassification(
  classification: ClassificationRoot
): NormalizedClassificationNote[] {
  if (!classification.notes || !Array.isArray(classification.notes)) {
    throw new Error('Classification JSON must have a "notes" array');
  }

  const subjById = new Map<string, FullClassificationSubject>();
  const topicById = new Map<string, FullClassificationTopic>();

  if (Array.isArray(classification.subjects)) {
    for (const s of classification.subjects) {
      subjById.set(s.id, s);
    }
  }

  if (Array.isArray(classification.topics)) {
    for (const t of classification.topics) {
      topicById.set(t.id, t);
    }
  }

  const normalized: NormalizedClassificationNote[] = [];

  for (const raw of classification.notes) {
    const n = raw as FullClassificationNote & MinimalClassificationNote;

    let subjectName = n.subjectName;
    let topicName = n.topicName;

    // If we don't have subjectName/topicName but we *do* have ids, resolve via subjects/topics arrays
    if (!subjectName && n.subjectId && subjById.size > 0) {
      const s = subjById.get(n.subjectId);
      if (s) subjectName = s.name;
    }

    if (!topicName && n.topicId && topicById.size > 0) {
      const t = topicById.get(n.topicId);
      if (t) topicName = t.name;
    }

    // If we still don't have names, fall back to generic buckets (but log)
    if (!subjectName) {
      console.warn(
        `  WARNING: note aiNoteKey="${n.aiNoteKey}" has no subjectName/subjectId. Using "Uncategorized".`
      );
      subjectName = 'Uncategorized';
    }
    if (!topicName) {
      console.warn(
        `  WARNING: note aiNoteKey="${n.aiNoteKey}" has no topicName/topicId. Using "Miscellaneous".`
      );
      topicName = 'Miscellaneous';
    }

    normalized.push({
      aiNoteKey: n.aiNoteKey,
      subjectName,
      topicName,
      suggestedTitle: n.suggestedTitle,
      chatworthyNoteId: (n as any).chatworthyNoteId,
      fileName: (n as any).fileName,
    });
  }

  return normalized;
}

// ---------- Main ----------

async function main() {
  const classificationPath = process.argv[2];
  const seedPath = process.argv[3];

  if (!classificationPath || !seedPath) {
    console.error(
      'Usage: ts-node scripts/apply-ai-classification-batch.ts <classification.json> <ai-seed.json>'
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

  // Build lookup: aiNoteKey -> seed note
  const seedByKey = new Map<string, AiSeedNote>();
  for (const n of seed.notes) {
    seedByKey.set(n.aiNoteKey, n);
  }
  console.log(`Loaded ${seed.notes.length} seed note(s).`);

  // Normalize classification notes to subjectName + topicName
  const normalizedNotes = normalizeClassification(classification);
  console.log(`Applying classification for ${normalizedNotes.length} note(s)...`);

  let createdCount = 0;
  let skippedCount = 0;

  for (const n of normalizedNotes) {
    const seedNote = seedByKey.get(n.aiNoteKey);
    if (!seedNote) {
      console.warn(
        `  WARNING: No seed note found for aiNoteKey="${n.aiNoteKey}". Skipping.`
      );
      skippedCount++;
      continue;
    }

    // Ensure subject/topic exist (by name), creating if needed.
    const subjectMongoId = await ensureSubjectByName(n.subjectName);
    const topicMongoId = await ensureTopicByName(subjectMongoId, n.topicName);

    const title =
      (n.suggestedTitle && n.suggestedTitle.trim()) ||
      seedNote.chatTitle ||
      'Untitled';

    const baseSlug = slugify(title);
    const slug = await getUniqueNoteSlug(topicMongoId, baseSlug);
    const order = await getNextOrder(topicMongoId);

    await NoteModel.create({
      subjectId: subjectMongoId,
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
          url: undefined, // later you could store pageUrl or fileName if you want
        },
      ],
      order,
    } as any);

    createdCount++;
  }

  console.log(`Done. Created ${createdCount} note(s), skipped ${skippedCount} note(s).`);

  await mongoose.disconnect();
  console.log('Disconnected from Mongo.');
}

main().catch((err) => {
  console.error('Unhandled error in apply-ai-classification-batch:', err);
  process.exit(1);
});
