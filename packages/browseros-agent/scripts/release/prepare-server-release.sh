#!/usr/bin/env bash
set -euo pipefail

# Resolve a server GitHub Release. The tag is the source of truth for the version;
# this script never pushes to the default branch. On manual dispatch it creates and
# pushes only the annotated tag (allowed under a "changes to main via PR" ruleset);
# the version is reflected back into package.json by the workflow's bump PR step.
NEW_PREFIX="agent-server/v"

usage() {
  cat >&2 <<'EOF'
Usage: prepare-server-release.sh --event-name <push|workflow_dispatch> --default-branch <branch> --ref-name <ref> [--requested-version <X.Y.Z>] [--remote <name>]
EOF
}

event_name=""
default_branch=""
ref_name=""
requested_version=""
remote="origin"

while [ "$#" -gt 0 ]; do
  case "$1" in
    --event-name)
      event_name="${2:-}"
      shift 2
      ;;
    --default-branch)
      default_branch="${2:-}"
      shift 2
      ;;
    --ref-name)
      ref_name="${2:-}"
      shift 2
      ;;
    --requested-version)
      requested_version="${2:-}"
      shift 2
      ;;
    --remote)
      remote="${2:-}"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage
      exit 2
      ;;
  esac
done

if [ -z "$event_name" ] || [ -z "$default_branch" ]; then
  usage
  exit 2
fi

git_root="$(git rev-parse --show-toplevel)"
git_root="$(cd "$git_root" && pwd -P)"
cd "$git_root"

is_semver() {
  [[ "$1" =~ ^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$ ]]
}

ensure_git_identity() {
  git config user.name "github-actions[bot]"
  git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
}

require_annotated_tag() {
  local tag="$1"
  local tag_type
  tag_type="$(git cat-file -t "refs/tags/$tag" 2>/dev/null || true)"
  if [ -z "$tag_type" ]; then
    echo "::error::Tag does not exist: $tag"
    exit 1
  fi
  if [ "$tag_type" != "tag" ]; then
    echo "::error::Tag $tag must be an annotated tag."
    exit 1
  fi
}

ensure_default_branch_release() {
  local sha="$1"
  if ! git merge-base --is-ancestor "$sha" "$remote/$default_branch"; then
    echo "::error::Tagged commit $sha is not reachable from $remote/$default_branch."
    exit 1
  fi
}

# Resolve the closest earlier server tag across current and legacy prefixes, and
# reject duplicate or non-incrementing versions. All comparisons are tag-based.
previous_server_tag() {
  python3 - "$1" "$2" <<'PY'
import re
import subprocess
import sys

target = tuple(int(part) for part in sys.argv[1].split("."))
target_tag = sys.argv[2]
tags = subprocess.check_output(["git", "tag", "-l"], text=True).splitlines()
latest = None
duplicate = None

for tag in tags:
    if tag == target_tag:
        continue

    for prefix in ("agent-server/v", "browseros-server-v"):
        if not tag.startswith(prefix):
            continue
        version = tag[len(prefix):]
        if not re.fullmatch(r"(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)", version):
            continue
        parsed = tuple(int(part) for part in version.split("."))
        if parsed == target:
            duplicate = tag
        if latest is None or parsed > latest[0]:
            latest = (parsed, tag)

if duplicate:
    print(f"duplicate={duplicate}")
    sys.exit(0)

if latest and target <= latest[0]:
    print(f"non_incrementing={'.'.join(str(part) for part in latest[0])}:{latest[1]}")
    sys.exit(0)

if latest:
    print(f"previous={latest[1]}")
PY
}

resolve_previous_tag() {
  local previous_result
  previous_result="$(previous_server_tag "$version" "$tag")"
  case "$previous_result" in
    duplicate=*)
      duplicate_tag="${previous_result#duplicate=}"
      echo "::error::Release version $version already exists as tag $duplicate_tag."
      exit 1
      ;;
    non_incrementing=*)
      latest="${previous_result#non_incrementing=}"
      latest_version="${latest%%:*}"
      latest_tag="${latest#*:}"
      echo "::error::Release version $version must be greater than latest existing server version $latest_version ($latest_tag)."
      exit 1
      ;;
    previous=*)
      previous_tag="${previous_result#previous=}"
      ;;
    "")
      previous_tag=""
      ;;
    *)
      echo "::error::Unexpected previous tag resolver output: $previous_result"
      exit 1
      ;;
  esac
}

emit() {
  printf '%s=%s\n' "$1" "$2"
  if [ -n "${GITHUB_OUTPUT:-}" ]; then
    printf '%s=%s\n' "$1" "$2" >> "$GITHUB_OUTPUT"
  fi
}

git fetch "$remote" "$default_branch:refs/remotes/$remote/$default_branch" --no-tags
git fetch "$remote" --tags --prune

previous_tag=""

if [ "$event_name" = "push" ]; then
  tag="$ref_name"
  version="${tag#"$NEW_PREFIX"}"

  if [ "$tag" = "$version" ] || ! is_semver "$version"; then
    echo "::error::Expected server release tag like agent-server/vX.Y.Z, got: $tag"
    exit 1
  fi

  require_annotated_tag "$tag"
  release_sha="$(git rev-list -n 1 "$tag")"
  ensure_default_branch_release "$release_sha"
  resolve_previous_tag
else
  version="$requested_version"
  if ! is_semver "$version"; then
    echo "::error::Version must be MAJOR.MINOR.PATCH, got: $version"
    exit 1
  fi

  tag="${NEW_PREFIX}${version}"
  resolve_previous_tag

  if git rev-parse --verify --quiet "refs/tags/$tag" >/dev/null; then
    require_annotated_tag "$tag"
    release_sha="$(git rev-list -n 1 "$tag")"
    ensure_default_branch_release "$release_sha"
  else
    release_sha="$(git rev-parse "$remote/$default_branch")"
    ensure_git_identity
    git tag -a "$tag" -m "BrowserOS Server - v$version" "$release_sha"
    git push "$remote" "refs/tags/$tag"
  fi
fi

emit version "$version"
emit tag "$tag"
emit release_sha "$release_sha"
emit previous_tag "$previous_tag"

if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then
  cat >> "$GITHUB_STEP_SUMMARY" <<EOF
Server release:
- Version: $version
- Tag: $tag
- Release commit: $release_sha
- Assets: GitHub source archives only
EOF
fi
