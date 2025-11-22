#!/usr/bin/env bash

# backup-chatalog.sh
#
# Usage:
#   MONGO_URI='mongodb+srv://pizza:password@cluster0.ihsik.mongodb.net/chatalog_dev?retryWrites=true&w=majority' \
#     ./backup-chatalog.sh /path/to/backup/dir
#
# The script will write:
#   /path/to/backup/dir/subjects.json
#   /path/to/backup/dir/topics.json
#   /path/to/backup/dir/notes.json

set -euo pipefail

if [ "$#" -ne 1 ]; then
  echo "Usage: $0 <output-directory>"
  exit 1
fi

if [ -z "${MONGO_URI:-}" ]; then
  echo "Error: MONGO_URI environment variable is not set."
  echo "Example:"
  echo "  export MONGO_URI='mongodb+srv://pizza:password@cluster0.ihsik.mongodb.net/chatalog_dev?retryWrites=true&w=majority'"
  echo "  $0 /path/to/backup/dir"
  exit 1
fi

OUTPUT_DIR="$1"

# Create directory if it doesn't exist
mkdir -p "$OUTPUT_DIR"

echo "Using MONGO_URI: $MONGO_URI"
echo "Writing backups to: $OUTPUT_DIR"
echo

collections=("subjects" "topics" "notes")

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

echo "All collections exported successfully!"
