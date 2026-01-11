// vectorNotesScopeTest.js

function runVector(label, extraVectorSearch) {
  const pipeline = [
    {
      $vectorSearch: Object.assign(
        {
          index: "notes_vector_index",
          path: "embedding",
          queryVector,
          numCandidates: 200,
          limit: 20,
        },
        extraVectorSearch || {}
      ),
    },
    {
      $project: {
        title: 1,
        docKind: 1,
        hasRecipe: { $ne: ["$recipe", null] },
        hasEmbedding: { $ne: [{ $ifNull: ["$embedding", null] }, null] },
        hasRecipeEmbedding: { $ne: [{ $ifNull: ["$recipeEmbedding", null] }, null] },
        score: { $meta: "vectorSearchScore" },
      },
    },
  ];

  const results = db.notes.aggregate(pipeline).toArray();
  print(`\n=== ${label} ===`);
  print(`count=${results.length}`);
  printjson(results.slice(0, 8));

  const counts = results.reduce(
    (acc, r) => {
      acc.total++;
      acc.byKind[r.docKind || "MISSING"] = (acc.byKind[r.docKind || "MISSING"] || 0) + 1;
      if (r.hasRecipe) acc.hasRecipe++;
      if (r.hasEmbedding) acc.hasEmbedding++;
      if (r.hasRecipeEmbedding) acc.hasRecipeEmbedding++;
      return acc;
    },
    { total: 0, byKind: {}, hasRecipe: 0, hasEmbedding: 0, hasRecipeEmbedding: 0 }
  );

  print("summary:");
  printjson(counts);

  return results;
}

// 1) NOTES scope behavior (what you're currently doing)
const notes = runVector("NOTES (filter docKind=note)", { filter: { docKind: "note" } });

// 2) ALL behavior *as currently implemented* if it still uses path:"embedding":
//    (no filter)
const all = runVector("ALL (no filter, still path=embedding)", {});

// Compare IDs to see if they’re identical
const notesIds = notes.map(r => String(r._id)).join(",");
const allIds = all.map(r => String(r._id)).join(",");
print(`\nIDs identical? ${notesIds === allIds}`);

// 3) Eligibility check: do recipes even have `embedding`?
print("\n=== DB sanity checks ===");
print("recipes with embedding present:");
print(db.notes.countDocuments({ docKind: "recipe", embedding: { $exists: true, $ne: [] } }));
print("recipes with recipeEmbedding present:");
print(db.notes.countDocuments({ docKind: "recipe", recipeEmbedding: { $exists: true, $ne: [] } }));
print("notes with embedding present:");
print(db.notes.countDocuments({ docKind: "note", embedding: { $exists: true, $ne: [] } }));
print("notes with recipeEmbedding present:");
print(db.notes.countDocuments({ docKind: "note", recipeEmbedding: { $exists: true, $ne: [] } }));
