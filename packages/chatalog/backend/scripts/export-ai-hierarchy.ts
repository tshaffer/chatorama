// scripts/export-ai-hierarchy.ts
//
// Export a lightweight Subject/Topic hierarchy for AI classification.
//
// Usage (from packages/chatalog/backend):
//
//   MONGO_URI="mongodb://localhost:27017/chatalog" \
//   npx ts-node scripts/export-ai-hierarchy.ts > ./local-data/ai-hierarchy-for-ai.json
//

import mongoose from 'mongoose';
import { SubjectModel } from '../src/models/Subject';
import { TopicModel } from '../src/models/Topic';

type AiHierarchySubject = {
  id: string;        // Mongo id as string
  name: string;
  slug: string;
};

type AiHierarchyTopic = {
  id: string;        // Mongo id as string
  subjectId: string; // Mongo subject id
  subjectName: string;
  name: string;
  slug: string;
};

type AiHierarchyExport = {
  version: number;
  generatedAt: string;
  subjects: AiHierarchySubject[];
  topics: AiHierarchyTopic[];
};

async function main() {
  const mongoUri = process.env.MONGO_URI;
  if (!mongoUri) {
    console.error('MONGO_URI env var is required');
    process.exit(1);
  }

  console.error('Connecting to Mongo:', mongoUri);
  await mongoose.connect(mongoUri);

  // Load all subjects
  const subjectDocs = await SubjectModel.find({}).lean().exec();
  const subjects: AiHierarchySubject[] = subjectDocs.map((s: any) => ({
    id: String(s._id),
    name: s.name,
    slug: s.slug,
  }));

  // Build a lookup: subjectId -> subjectName
  const subjectNameById = new Map<string, string>();
  for (const s of subjects) {
    subjectNameById.set(s.id, s.name);
  }

  // Load all topics
  const topicDocs = await TopicModel.find({}).lean().exec();
  const topics: AiHierarchyTopic[] = topicDocs.map((t: any) => {
    const subjectId = String(t.subjectId);
    const subjectName = subjectNameById.get(subjectId) ?? '';
    return {
      id: String(t._id),
      subjectId,
      subjectName,
      name: t.name,
      slug: t.slug,
    };
  });

  const out: AiHierarchyExport = {
    version: 1,
    generatedAt: new Date().toISOString(),
    subjects,
    topics,
  };

  // Print JSON to stdout so you can redirect it to a file.
  console.log(JSON.stringify(out, null, 2));

  await mongoose.disconnect();
  console.error('Disconnected from Mongo.');
}

main().catch((err) => {
  console.error('Unhandled error in export-ai-hierarchy:', err);
  process.exit(1);
});
