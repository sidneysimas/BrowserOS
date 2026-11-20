#!/usr/bin/env bash
# Pre-commit warning for oversized TypeScript files. It lives in a script file
# rather than inline in lefthook.yml because lefthook on Windows wraps inline
# scripts in `sh -c "..."`, which breaks on the script's own double quotes.
for file in "$@"; do
  if [[ -f "$file" ]]; then
    lines=$(wc -l < "$file" | tr -d ' ')
    if [[ $lines -gt 400 ]]; then
      echo "⚠️  Warning: $file has $lines lines (threshold: 400)"
      echo "   Consider splitting this file if it has multiple responsibilities."
    fi
  fi
done
