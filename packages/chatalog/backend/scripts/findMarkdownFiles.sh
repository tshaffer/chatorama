#!/usr/bin/env bash

set -euo pipefail

OUTPUT_FILE="$HOME/Documents/markDownFiles.txt"

# Clear the output file first
: > "$OUTPUT_FILE"

# Search from the root of the local drive
find / \
  -type d -name node_modules -prune \
  -o -type f -name "*.md" -print >> "$OUTPUT_FILE"

echo "Done."
echo "Results written to: $OUTPUT_FILE"
