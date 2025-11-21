// scripts/restore-chatalog-backup.js
//
// Usage (from shell):
//   mongosh "mongodb://localhost:27017/chatalog_dev" scripts/restore-chatalog-backup.js
//
// Assumes each collection was exported as <collectionName>.json
// containing an array of documents.

// use chatalog_dev;

const collections = [
  "notes",
  "topics",
  "subjects",
];

// Update this to point at the backup you want to restore FROM
const inputDir = "/Users/tedshaffer/Documents/MongoDBBackups/chatorama/backup-11-20-1";

const fs = require("fs");
const path = require("path");

collections.forEach((collectionName) => {
  const filePath = path.join(inputDir, `${collectionName}.json`);

  if (!fs.existsSync(filePath)) {
    print(`❌ Skipping ${collectionName}: file not found at ${filePath}`);
    return;
  }

  print(`\nRestoring collection: ${collectionName}`);
  print(`Reading from: ${filePath}`);

  const fileContents = fs.readFileSync(filePath, "utf8");

  let docs;
  try {
    docs = JSON.parse(fileContents);
  } catch (err) {
    print(`❌ Failed to parse JSON for ${collectionName}: ${err.message}`);
    return;
  }

  if (!Array.isArray(docs)) {
    print(`❌ Expected an array in ${filePath}, got ${typeof docs}. Skipping.`);
    return;
  }

  const coll = db.getCollection(collectionName);

  // Clear existing data first so _id collisions don't occur.
  // Comment this out if you want to merge instead of overwrite.
  const deleteResult = coll.deleteMany({});
  print(`Cleared existing documents from ${collectionName}: ${deleteResult.deletedCount} removed.`);

  if (docs.length === 0) {
    print(`No documents to insert for ${collectionName}.`);
    return;
  }

  try {
    const insertResult = coll.insertMany(docs);
    print(`✅ Inserted ${insertResult.insertedCount} documents into ${collectionName}.`);
  } catch (err) {
    print(`❌ Error inserting into ${collectionName}: ${err.message}`);
  }
});

print("\nAll requested collections processed for restore!");
