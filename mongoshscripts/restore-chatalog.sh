#!/usr/bin/env bash

# restore-chatalog.sh
#
# Usage:
#   MONGO_URI='mongodb+srv://...' ./restore-chatalog.sh /path/to/backup/dir
#
# Supports:
#   - subjects.json, topics.json, quicknotes.json, turnfingerprints.json (single-file)
#   - notes either as:
#       A) notes/notes-*.json (preferred, chunked NDJSON)
#       B) notes.json (legacy, single file)

set -euo pipefail

if [ "$#" -ne 1 ]; then
  echo "Usage: $0 <backup-directory>"
  exit 1
fi

if [ -z "${MONGO_URI:-}" ]; then
  echo "Error: MONGO_URI environment variable is not set."
  echo "Example:"
  echo "  export MONGO_URI='mongodb+srv://pizza:password@cluster0.ihsik.mongodb.net/chatalog_dev?retryWrites=true&w=majority'"
  echo "  $0 /path/to/backup/dir"
  exit 1
fi

BACKUP_DIR="$1"

if [ ! -d "$BACKUP_DIR" ]; then
  echo "Error: backup directory does not exist: $BACKUP_DIR"
  exit 1
fi

echo "Using MONGO_URI: $MONGO_URI"
echo "Restoring from backup directory: $BACKUP_DIR"
echo

# 1) Restore non-notes collections (single-file)
collections=("subjects" "topics" "quicknotes" "turnfingerprints")

for coll in "${collections[@]}"; do
  file_path="$BACKUP_DIR/${coll}.json"

  if [ ! -f "$file_path" ]; then
    echo "⚠️  Skipping collection '$coll': file not found at $file_path"
    echo
    continue
  fi

  echo "Restoring collection '$coll' from '$file_path'..."

  mongoimport \
    --uri="$MONGO_URI" \
    --collection="$coll" \
    --drop \
    --file="$file_path"

  echo "✔ Restored collection '$coll'"
  echo
done

# 2) Restore notes (chunked preferred)
NOTES_CHUNKS_DIR="$BACKUP_DIR/notes"
LEGACY_NOTES_FILE="$BACKUP_DIR/notes.json"

if [ -d "$NOTES_CHUNKS_DIR" ]; then
  shopt -s nullglob
  chunk_files=("$NOTES_CHUNKS_DIR"/notes-*.json)
  shopt -u nullglob

  if [ "${#chunk_files[@]}" -gt 0 ]; then
    echo "Restoring collection 'notes' from chunk files in '$NOTES_CHUNKS_DIR'..."
    echo "  Found ${#chunk_files[@]} chunk file(s)."

    # Drop notes once up front (more efficient + avoids per-chunk dropping)
    echo "  Dropping 'notes' collection..."
    mongosh "$MONGO_URI" --quiet --eval 'db.notes.drop()' >/dev/null || true

    # Import each chunk
    for f in "${chunk_files[@]}"; do
      echo "  Importing: $(basename "$f")"
      mongoimport \
        --uri="$MONGO_URI" \
        --collection="notes" \
        --file="$f"
    done

    echo "✔ Restored collection 'notes' from chunks"
    echo
  else
    echo "⚠️  Notes chunks directory exists but no notes-*.json files were found."
    echo
  fi

elif [ -f "$LEGACY_NOTES_FILE" ]; then
  echo "Restoring collection 'notes' from legacy file '$LEGACY_NOTES_FILE'..."

  mongoimport \
    --uri="$MONGO_URI" \
    --collection="notes" \
    --drop \
    --file="$LEGACY_NOTES_FILE"

  echo "✔ Restored collection 'notes' from legacy notes.json"
  echo

else
  echo "⚠️  Skipping collection 'notes': no chunked notes/ directory and no notes.json found."
  echo
fi

echo "All requested collections processed for restore!"
