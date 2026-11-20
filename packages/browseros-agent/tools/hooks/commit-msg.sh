#!/usr/bin/env bash
# Enforces Conventional Commits on the first line of the commit message ($1 is
# the message file). A script file, not inline YAML: see file-length.sh.
msg=$(head -1 "$1")
if [[ ! "$msg" =~ ^(feat|fix|docs|style|refactor|perf|test|chore|ci|build|revert)(\(.+\))?\!?:\ .+ ]]; then
  echo "Commit message must follow Conventional Commits format:"
  echo "  <type>(<optional scope>): <description>"
  echo "  Types: feat, fix, docs, style, refactor, perf, test, chore, ci, build, revert"
  echo ""
  echo "Examples:"
  echo "  feat(auth): add OAuth2 support"
  echo "  fix: resolve null pointer exception"
  exit 1
fi
