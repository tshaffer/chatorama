// load('/Users/tedshaffer/Documents/Projects/chatorama/packages/chatalog/backend/scripts/backfill-note-order.js')
// // backfill-note-order.mongo.js
// Backfill per-topic note.order compactly (newest first -> order 0,1,2...)
// Adjust DB/COLLECTION names if yours differ.
const DB_NAME = 'chatalog';
const COLL_NAME = 'notes';

const dbx = db.getSiblingDB(DB_NAME);
const coll = dbx.getCollection(COLL_NAME);

print(`Working on ${DB_NAME}.${COLL_NAME} ...`);
coll.createIndex({ topicId: 1, order: 1, _id: 1 });

const BATCH = 1000;
let ops = [];
let currentTopic = null;
let idx = 0;

const cursor = coll.find(
  {},
  { _id: 1, topicId: 1, createdAt: 1 }
).sort({ topicId: 1, createdAt: -1, _id: 1 });

cursor.forEach(doc => {
  if (doc.topicId !== currentTopic) {
    currentTopic = doc.topicId;
    idx = 0;
  }
  ops.push({
    updateOne: {
      filter: { _id: doc._id },
      update: { $set: { order: idx++ } }
    }
  });
  if (ops.length >= BATCH) {
    const res = coll.bulkWrite(ops);
    print(`Wrote batch: ${res.modifiedCount} mods`);
    ops = [];
  }
});

if (ops.length) {
  const res = coll.bulkWrite(ops);
  print(`Wrote final batch: ${res.modifiedCount} mods`);
}

print('Done backfilling note.order');
