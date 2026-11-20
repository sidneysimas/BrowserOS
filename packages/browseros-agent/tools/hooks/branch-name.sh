#!/usr/bin/env bash
# Pre-push warning for branch names outside <type>/<short-description>.
# A script file, not inline YAML: see file-length.sh.
branch=$(git rev-parse --abbrev-ref HEAD)
if [[ "$branch" == "main" || "$branch" == "master" ]]; then
  exit 0
fi
if [[ ! "$branch" =~ ^(feat|fix|bugfix|hotfix|release|docs|refactor|test|chore|experiment)/[a-z0-9-]+$ ]]; then
  echo "⚠️  Warning: Branch name '$branch' doesn't match recommended format."
  echo "   Use: <type>/<short-description>"
  echo "   Types: feat, fix, bugfix, hotfix, release, docs, refactor, test, chore, experiment"
  echo "   Example: feat/add-auth, fix/login-crash"
  echo ""
  echo "   To rename your branch:"
  echo "     git branch -m <new-name>"
  echo "     git push -u origin <new-name>"
fi
