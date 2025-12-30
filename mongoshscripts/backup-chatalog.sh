#!/usr/bin/env bash

# backup-chatalog.sh
#
# Usage:
#   MONGO_URI='mongodb+srv://...' 
#   ./backup-chatalog.sh /path/to/backup/dir
#
# Outputs:
#   subjects.json, topics.json, quicknotes.json, turnfingerprints.json
#   notes/manifest.json + notes/notes-*.json (chunks of 10)

set -euo pipefail

if [ "$#" -ne 1 ]; then
  echo "Usage: $0 <output-directory>"
  exit 1
fi

if [ -z "${MONGO_URI:-}" ]; then
  echo "Error: MONGO_URI environment variable is not set."
  exit 1
fi

OUTPUT_DIR="$1"
mkdir -p "$OUTPUT_DIR"

echo "Using MONGO_URI: $MONGO_URI"
echo "Writing backups to: $OUTPUT_DIR"
echo

# Export these collections as single files (as before)
collections=("assets" "importbatches" "noteassets" "quicknoteassets" "subjects" "topics" "quicknotes" "turnfingerprints")

for coll in "${collections[@]}"; do
  out_file="$OUTPUT_DIR/${coll}.json"
  echo "Exporting collection '$coll' to '$out_file'..."
  mongoexport \
    --uri="$MONGO_URI" \
    --collection="$coll" \
    --out="$out_file" \
    --jsonFormat=canonical
  echo "✔ Done: $out_file"
  echo
done

# NOTES: export in chunks of 10 docs, sorted by _id
CHUNK_SIZE="${NOTES_CHUNK_SIZE:-10}"
NOTES_DIR="$OUTPUT_DIR/notes"
mkdir -p "$NOTES_DIR"

echo "Exporting collection 'notes' in chunks of ${CHUNK_SIZE} docs to '$NOTES_DIR/'..."

# Get total count
NOTES_COUNT="$(
  mongosh "$MONGO_URI" --quiet --eval 'print(db.notes.countDocuments({}))'
)"
# trim whitespace (mongosh output can include newlines)
NOTES_COUNT="$(echo "$NOTES_COUNT" | tr -d '[:space:]')"

if ! [[ "$NOTES_COUNT" =~ ^[0-9]+$ ]]; then
  echo "Error: unexpected notes count output: '$NOTES_COUNT'"
  exit 1
fi

# Manifest (handy for sanity checks)
cat > "$NOTES_DIR/manifest.json" <<EOF
{
  "collection": "notes",
  "chunkSize": $CHUNK_SIZE,
  "notesCount": $NOTES_COUNT,
  "exportedAt": "$(date -Iseconds)"
}
EOF

echo "Notes count: $NOTES_COUNT"
echo "Writing manifest: $NOTES_DIR/manifest.json"
echo

# Chunk loop
chunk_index=1
skip=0

while [ "$skip" -lt "$NOTES_COUNT" ]; do
  chunk_file="$NOTES_DIR/notes-$(printf "%06d" "$chunk_index").json"
  echo "  -> Chunk $chunk_index (skip=$skip, limit=$CHUNK_SIZE) => $chunk_file"

  # Write newline-delimited EJSON, one doc per line
  mongosh "$MONGO_URI" --quiet --eval "
    const skip = $skip;
    const limit = $CHUNK_SIZE;
    db.notes.find({}, {}).sort({_id: 1}).skip(skip).limit(limit).forEach(doc => {
      print(EJSON.stringify(doc));
    });
  " > "$chunk_file"

  # If for some reason it wrote nothing, still keep the file (it’s fine)
  skip=$((skip + CHUNK_SIZE))
  chunk_index=$((chunk_index + 1))
done

echo
echo "✔ Done exporting notes chunks."
echo
echo "All collections exported successfully!"
