#!/usr/bin/env bash

# backup-chatalog-auto.sh
#
# Usage:
#   MONGO_URI='mongodb+srv://pizza:password@cluster0.ihsik.mongodb.net/chatalog_dev?retryWrites=true&w=majority' \
#     ./backup-chatalog-auto.sh
#
# This script:
#   - Computes a backup directory of the form:
#       /Users/tedshaffer/Documents/MongoDBBackups/chatorama/backup-<month>-<day>-<n>
#   - Where:
#       <month> is 1-based (1..12, no leading zero)
#       <day>   is day of month (1..31, no leading zero)
#       <n>     is 0 for the first backup today, or (last backup index + 1)
#   - Then calls backup-chatalog.sh with that directory.

set -euo pipefail

# Base directory where all backups live
BASE_DIR="/Users/tedshaffer/Documents/MongoDBBackups/chatorama"

# Make sure base dir exists
mkdir -p "$BASE_DIR"

# Get month/day as 1-based, no leading zeros
month="$(date +%-m)"  # e.g. 11
day="$(date +%-d)"    # e.g. 22

# Pattern prefix for today's backups
prefix="backup-${month}-${day}-"

# Find the highest existing index N for today
max_index=-1

# Enable nullglob so that the loop doesn't literally use the pattern when no matches
shopt -s nullglob
for path in "${BASE_DIR}/${prefix}"*; do
  # Only consider directories
  [[ -d "$path" ]] || continue

  name="${path##*/}"  # e.g. "backup-11-22-3"
  # Strip the prefix to isolate the numeric suffix
  suffix="${name#${prefix}}"

  # If suffix is all digits, consider it
  if [[ "$suffix" =~ ^[0-9]+$ ]]; then
    if (( suffix > max_index )); then
      max_index="$suffix"
    fi
  fi
done
shopt -u nullglob

# Decide the new index
if (( max_index < 0 )); then
  index=0
else
  index=$((max_index + 1))
fi

TARGET_DIR="${BASE_DIR}/${prefix}${index}"

echo "Computed backup directory: $TARGET_DIR"
echo

# Location of this script (mongoshscripts dir)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKUP_SCRIPT="${SCRIPT_DIR}/backup-chatalog.sh"

if [[ ! -x "$BACKUP_SCRIPT" ]]; then
  echo "Error: backup script not found or not executable at: $BACKUP_SCRIPT"
  exit 1
fi

# Call the existing backup script with the computed directory
"$BACKUP_SCRIPT" "$TARGET_DIR"
