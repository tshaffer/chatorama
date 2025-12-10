#!/usr/bin/env bash

# restore-chatalog.sh
#
# Usage:
#   MONGO_URI='mongodb+srv://pizza:password@cluster0.ihsik.mongodb.net/chatalog_dev?retryWrites=true&w=majority' \
#     ./restore-chatalog.sh /path/to/backup/dir
#
# Expects these files to exist in the given directory:
#   subjects.json
#   topics.json
#   notes.json
#
# Each collection will be dropped and restored from the corresponding file.

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

collections=("subjects" "topics" "notes" "quicknotes" "turnfingerprints")

for coll in "${collections[@]}"; do
  file_path="$BACKUP_DIR/${coll}.json"

  if [ ! -f "$file_path" ]; then
    echo "⚠️  Skipping collection '$coll': file not found at $file_path"
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

echo "All requested collections processed for restore!"
