#!/usr/bin/env bash

# backup-chatalog-auto.sh
#
# Usage:
#   MONGO_URI='mongodb+srv://...' 
#   ./backup-chatalog-auto.sh
#
# Creates snapshot directories:
#   /Users/tedshaffer/Documents/MongoDBBackups/chatorama/backup-<month>-<day>-<n>
# And maintains:
#   /Users/tedshaffer/Documents/MongoDBBackups/chatorama/latest -> backup-...

set -euo pipefail

BASE_DIR="/Users/tedshaffer/Documents/MongoDBBackups/chatorama"
mkdir -p "$BASE_DIR"

month="$(date +%-m)"
day="$(date +%-d)"
prefix="backup-${month}-${day}-"

max_index=-1
shopt -s nullglob
for path in "${BASE_DIR}/${prefix}"*; do
  [[ -d "$path" ]] || continue
  name="${path##*/}"
  suffix="${name#${prefix}}"
  if [[ "$suffix" =~ ^[0-9]+$ ]]; then
    if (( suffix > max_index )); then
      max_index="$suffix"
    fi
  fi
done
shopt -u nullglob

if (( max_index < 0 )); then
  index=0
else
  index=$((max_index + 1))
fi

TARGET_DIR="${BASE_DIR}/${prefix}${index}"
LATEST_LINK="${BASE_DIR}/latest"

echo "Computed snapshot directory: $TARGET_DIR"
echo

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKUP_SCRIPT="${SCRIPT_DIR}/backup-chatalog.sh"

if [[ ! -x "$BACKUP_SCRIPT" ]]; then
  echo "Error: backup script not found or not executable at: $BACKUP_SCRIPT"
  exit 1
fi

# Determine previous snapshot (if latest exists)
PREV_SNAPSHOT=""
if [[ -L "$LATEST_LINK" ]]; then
  PREV_SNAPSHOT="$(readlink "$LATEST_LINK")"
fi

# Temp directory for the fresh full export
TMP_DIR="${BASE_DIR}/.tmp-${prefix}${index}-$$"
mkdir -p "$TMP_DIR"

echo "Step 1: Create fresh export in temp dir:"
echo "  $TMP_DIR"
echo

"$BACKUP_SCRIPT" "$TMP_DIR"

echo
echo "Step 2: Create snapshot using rsync hard-linking unchanged files"
if [[ -n "$PREV_SNAPSHOT" && -d "$PREV_SNAPSHOT" ]]; then
  echo "  Using --link-dest=$PREV_SNAPSHOT"
  rsync -a --delete \
    --link-dest="$PREV_SNAPSHOT" \
    "$TMP_DIR/" "$TARGET_DIR/"
else
  echo "  No previous snapshot found; first snapshot will be a full copy"
  rsync -a --delete "$TMP_DIR/" "$TARGET_DIR/"
fi

# Remove temp dir
rm -rf "$TMP_DIR"

# Update latest symlink
ln -sfn "$TARGET_DIR" "$LATEST_LINK"

echo
echo "✔ Snapshot complete: $TARGET_DIR"
echo "latest -> $(readlink "$LATEST_LINK")"
