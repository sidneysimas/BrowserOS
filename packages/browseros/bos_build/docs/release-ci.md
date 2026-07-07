# BrowserOS Release CI

This document covers the deliberate release workflows. None of these commands
should be run as a smoke test unless the operator intends to spend release
runner time.

## Workflow Map

The full release path is dispatch-only:

```text
release-full.yml
  preflight
    - read packages/browseros/resources/BROWSEROS_VERSION for browser artifacts
    - optionally cancel only nightly-release.yml WarpBuild runs
    - fail early when selected lane secrets or variables are missing
  server resources, when include_servers=true
    - release-server.yml for browseros
    - release-claw-server.yml for browserclaw
    - release-claw-server-rust.yml exists as a separate manual/reusable lane
      for BrowserClaw Rust server resources, but is not called by the full
      release until the Rust server becomes the active embedded server
  browser builds
    - release-linux.yml -> build-browseros.yml
    - release-windows.yml -> build-browseros.yml
    - release-macos.yml
  finalize
    - write the Actions step summary
    - create or refresh draft GitHub release assets when all selected lanes pass
```

`release-full.yml` has no schedule and no tag trigger. A full release is a
manual dispatch so it cannot accidentally occupy WarpBuild or the self-hosted
macOS builder.

## Component Workflows

| Workflow | Purpose | Dispatch | Called by `release-full.yml` |
| --- | --- | --- | --- |
| `.github/workflows/release-server.yml` | Builds BrowserOS server resource zips for every browser target, uploads versioned R2 resource keys, attaches server release assets, and reflects the server package version. | Manual and `agent-server/v*` tags | Yes, when `include_servers=true` and `products` includes `browseros` |
| `.github/workflows/release-claw-server.yml` | Builds BrowserClaw server and onboard resource zips, uploads versioned R2 keys, attaches server release assets, and reflects Claw package versions. | Manual and `claw-server/v*` tags | Yes, when `include_servers=true` and `products` includes `browserclaw` |
| `.github/workflows/release-claw-server-rust.yml` | Builds BrowserClaw Rust server resource zips for every browser target, uploads versioned R2 keys under `claw-server-rust/prod-resources`, and attaches Rust server release assets. | Manual, reusable, and `claw-server-rust/v*` tags | No; intentionally separate until BrowserClaw migrates from the TypeScript server |
| `.github/workflows/release-linux.yml` | Builds Linux x64 browser artifacts on WarpBuild, one matrix entry per selected product. | Manual | Yes |
| `.github/workflows/release-windows.yml` | Builds Windows x64 browser artifacts on WarpBuild and optionally signs them. | Manual | Yes |
| `.github/workflows/release-macos.yml` | Builds signed macOS artifacts on the dedicated self-hosted builder. | Manual | Yes |
| `.github/workflows/release-full.yml` | Orchestrates servers, selected browser platforms, and draft GitHub release asset creation. | Manual only | No reusable entry point |

Browser artifacts use the BrowserOS browser version from
`packages/browseros/resources/BROWSEROS_VERSION` (for example `0.47.2.2`).
Server resources do not use that version. `release-server.yml` resolves
`packages/browseros-agent/apps/server/package.json` and tags
`agent-server/vX.Y.Z`; `release-claw-server.yml` resolves
`packages/browseros-agent/apps/claw-server/package.json` and tags
`claw-server/vX.Y.Z`; `release-claw-server-rust.yml` resolves
`packages/browseros-agent/apps/claw-server-rust/Cargo.toml` and tags
`claw-server-rust/vX.Y.Z`.

The Rust Claw server lane publishes to a distinct CDN/R2 prefix:
`claw-server-rust/prod-resources/{version,latest}/`. Do not add
`download_resources.yaml` entries that point at a new Rust server version until
that workflow has populated the matching R2 objects; the bos_build download
step fails the whole Chromium build when a configured key is missing.

The reusable nesting depth is `release-full.yml -> release-linux.yml or
release-windows.yml -> build-browseros.yml`, which stays below GitHub's limit
of four workflow levels.

## Full Release Inputs

```bash
gh workflow run release-full.yml \
  -f products=all \
  -f platforms=all \
  -f include_servers=true \
  -f sign_windows=true \
  -f macos_arch=arm64 \
  -f upload_to_r2=true \
  -f preempt_nightly=true \
  -f github_release_draft=true
```

Useful narrower runs:

```bash
# Rebuild browser artifacts against server resources already staged in R2.
gh workflow run release-full.yml -f include_servers=false

# Linux only, both products, still creates a draft release if selected lanes pass.
gh workflow run release-full.yml -f platforms=linux -f products=all

# Unsigned Windows verification when signing secrets are not available.
gh workflow run release-full.yml -f platforms=windows -f sign_windows=false

# BrowserClaw macOS universal build only.
gh workflow run release-full.yml \
  -f products=browserclaw \
  -f platforms=macos \
  -f macos_arch=universal
```

Individual workflow examples:

```bash
gh workflow run release-server.yml -f version=0.0.124
gh workflow run release-claw-server.yml -f version=0.0.3
gh workflow run release-claw-server-rust.yml -f version=0.1.0
gh workflow run release-linux.yml -f products=browseros -f upload_to_r2=true
gh workflow run release-windows.yml -f products=browserclaw -f sign=false
gh workflow run release-macos.yml -f products=all -f arch=arm64
```

## Secrets And Variables

Repository secret and variable names were checked when this document was
added. Values are never needed locally to inspect this matrix.

| Lane | Required names | Current repo status | Notes |
| --- | --- | --- | --- |
| R2 browser artifacts and final draft release | `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET` | Present | Used by Linux/Windows browser downloads and uploads, server resource uploads, and the draft GitHub release asset step. |
| BrowserOS server resources | R2 names plus `BROWSEROS_CONFIG_URL`, `POSTHOG_API_KEY`, `SENTRY_DSN`, `AGENT_RUNNER_JWT_SECRET` | R2 and `POSTHOG_API_KEY` present; `BROWSEROS_CONFIG_URL`, `SENTRY_DSN`, and `AGENT_RUNNER_JWT_SECRET` missing | `release-full.yml` fails in preflight before cancelling nightlies or starting paid builds if selected required names are absent. |
| BrowserClaw server resources | R2 names | Present | `SPARKLE_PRIVATE_KEY` is optional for server OTA publishing; the orchestrator passes `publish_ota=false`. |
| BrowserClaw Rust server resources | R2 names | Present | Uses only GitHub-hosted runners and writes `claw-server-rust/prod-resources`; no signing or OTA secrets are required. |
| Windows signing | `ESIGNER_USERNAME`, `ESIGNER_PASSWORD`, `ESIGNER_TOTP_SECRET`, `SPARKLE_PRIVATE_KEY` | Missing | `ESIGNER_CREDENTIAL_ID` is optional. Use `sign_windows=false` only for unsigned verification, not a signed release. |
| macOS release builder | Repository variables `BROWSEROS_REPO_PATH`, `BROWSEROS_CHROMIUM_SRC` | Present | Signing, notarization, R2, and Slack values live in the runner-local `packages/browseros/.env`; do not copy them into GitHub secrets. |
| GitHub release assets | `GITHUB_TOKEN` | Automatic | Finalize uses it through `GH_TOKEN`. |

## Runner Cost And Time

Linux and Windows release builds use WarpBuild runners. The operational details,
cost ballparks, cache behavior, and stuck-queue troubleshooting live in
`packages/browseros/bos_build/docs/nightly-warpbuild-ci.md`; keep that document
as the source of truth for WarpBuild labels and timing expectations.

Rules of thumb:

- Linux and Windows are paid cloud runs and can take several hours.
- The macOS release lane runs on the user's dedicated self-hosted machine and
  can take 6 to 20 hours for all products or universal builds.
- `preempt_nightly=true` cancels only queued or in-progress
  `.github/workflows/nightly-release.yml` runs. It does not cancel
  `Nightly: macOS Browser (signed, self-hosted)`; the shared `macos-build`
  concurrency group serializes self-hosted macOS work.

## Draft GitHub Release

The final job creates draft GitHub release assets only when every selected
server and browser lane succeeds and `upload_to_r2=true`. It runs:

```bash
cd packages/browseros
uv run browseros release github create --version <version> --draft --product browseros
uv run browseros release github create --version <version> --draft --product browserclaw
```

For `products=browseros` or `products=browserclaw`, only that product command is
run. If the target GitHub release already exists and is published, the workflow
refuses to modify it. If it is still a draft, matching product assets are removed
first so reruns refresh the draft from current R2 artifacts.

## Manual Promote To Live

Promotion is deliberately outside `release-full.yml`. Inspect the R2 metadata,
downloaded artifacts, and draft GitHub release first. Then promote each selected
product explicitly:

```bash
cd packages/browseros

# Inspect staged browser artifacts.
uv run browseros release list --version <version> --product browseros
uv run browseros release list --version <version> --product browserclaw

# Copy versioned R2 objects to live download/ aliases.
uv run browseros release publish --version <version> --product browseros
uv run browseros release publish --version <version> --product browserclaw

# Preview appcast changes first, then publish.
uv run browseros release appcast --version <version> --product browseros
uv run browseros release appcast --version <version> --product browseros --publish
uv run browseros release appcast --version <version> --product browserclaw
uv run browseros release appcast --version <version> --product browserclaw --publish
```

Server OTA promotion is also manual. The server release workflows can generate
alpha OTA artifacts when their own `publish_ota` input is true, but the full
release orchestrator does not enable that input.
