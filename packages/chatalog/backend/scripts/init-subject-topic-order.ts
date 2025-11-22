#!/usr/bin/env ts-node

/**
 * One-off script to initialize `order` for all Subjects and Topics.
 *
 * - Subjects: ordered globally by `name` ascending.
 * - Topics: ordered by `name` ascending within each `subjectId`.
 *
 * Run with:
 *   cd packages/chatalog/backend
 *   MONGO_URI="mongodb+srv://..." npx ts-node scripts/init-subject-topic-order.ts
 *
 * Make sure your .env (or shell) provides the same Mongo URI
 * that your backend uses.
 */

import 'dotenv/config';
import mongoose from 'mongoose';
import { SubjectModel } from '../src/models/Subject';
import { TopicModel } from '../src/models/Topic';

async function main() {
  const uri =
    process.env.MONGO_URI ||
    process.env.CHATALOG_MONGO_URI ||
    process.env.DATABASE_URI;

  if (!uri) {
    console.error(
      'ERROR: No Mongo URI found. Set MONGO_URI (or adjust script to your env var).',
    );
    process.exit(1);
  }

  console.log('Connecting to MongoDB…');
  await mongoose.connect(uri);

  try {
    // 1) Initialize Subject.order based on name
    console.log('Fetching subjects ordered by name…');
    const subjects = await SubjectModel.find().sort({ name: 1 }).exec();

    if (!subjects.length) {
      console.log('No subjects found; nothing to do for subjects.');
    } else {
      console.log(`Found ${subjects.length} subjects. Setting order…`);

      const subjectOps = subjects.map((s, index) => ({
        updateOne: {
          filter: { _id: s._id },
          update: { $set: { order: index } },
        },
      }));

      if (subjectOps.length) {
        const res = await SubjectModel.bulkWrite(subjectOps);
        console.log('Subject order initialized.', {
          matchedCount: res.matchedCount,
          modifiedCount: res.modifiedCount,
          upsertedCount: res.upsertedCount,
        });
      }
    }

    // 2) Initialize Topic.order based on (subjectId, name)
    console.log('Fetching topics ordered by subjectId, name…');
    const topics = await TopicModel.find()
      .sort({ subjectId: 1, name: 1 })
      .exec();

    if (!topics.length) {
      console.log('No topics found; nothing to do for topics.');
    } else {
      console.log(`Found ${topics.length} topics. Setting order within each subject…`);

      const topicOps: any[] = [];

      let currentSubjectId: string | undefined = undefined;
      let index = 0;

      for (const t of topics) {
        const sid = (t.subjectId as unknown as string) ?? '';

        if (sid !== currentSubjectId) {
          currentSubjectId = sid;
          index = 0;
        }

        topicOps.push({
          updateOne: {
            filter: { _id: t._id },
            update: { $set: { order: index } },
          },
        });

        index += 1;
      }

      if (topicOps.length) {
        const res = await TopicModel.bulkWrite(topicOps);
        console.log('Topic order initialized.', {
          matchedCount: res.matchedCount,
          modifiedCount: res.modifiedCount,
          upsertedCount: res.upsertedCount,
        });
      }
    }

    console.log('Done initializing subject/topic order.');
  } catch (err) {
    console.error('Error while initializing subject/topic order:', err);
    process.exitCode = 1;
  } finally {
    console.log('Disconnecting from MongoDB…');
    await mongoose.disconnect();
  }
}

main().catch((err) => {
  console.error('Fatal error in script:', err);
  process.exit(1);
});
