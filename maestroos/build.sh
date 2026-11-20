#!/usr/bin/env bash
# One-shot Windows build of MaestroOS, the custom-branded BrowserOS fork.
#
# The upstream release pipeline needs BrowserOS's private R2 bucket and CRX
# signing keys. This script replaces those two inputs with public or local ones:
#
#   1. Server and onboarding resources come from the public CDN zips (the
#      onboarding UI is then rebuilt from this tree, so it carries our branding).
#   2. The agent extension is built from this tree and signed with OUR key
#      (MAESTRO_AGENT_KEY). Its ID must match BROWSEROS_AGENT_EXTENSION_ID in
#      bos_build/core/products.py and kAgentExtensionId in the chromium patches;
#      the script refuses to continue when it does not.
#   3. The Chromium build then runs with --skip download_resources and a local
#      bundled-extensions manifest that points at the CRX from step 2.
#
# Run from Git Bash on Windows. See maestroos/README.md for prerequisites.
# `--prepare-only` stops after steps 1-2 (minutes instead of hours).
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
AGENT="$REPO/packages/browseros-agent"
BROWSEROS="$REPO/packages/browseros"

CHROMIUM_ROOT="${CHROMIUM_ROOT:-E:/chromium}"
MAESTRO_AGENT_KEY="${MAESTRO_AGENT_KEY:-$CHROMIUM_ROOT/keys/agent_key.pem}"
WORK="${MAESTRO_WORK:-$CHROMIUM_ROOT/custom_ext}"
SERVER_ZIP_URL="https://cdn.browseros.com/artifacts/server/latest/browseros-server-resources-windows-x64.zip"
ONBOARDING_ZIP_URL="https://cdn.browseros.com/app-onboard/prod-resources/latest/browseros-app-onboard-resources.zip"
BUG_REPORTER_LINE='<app appid="adlpneommgkgeanpaekgoaolcpncohkf"><updatecheck codebase="https://cdn.browseros.com/extensions/bugreporter-57.0.0.0.crx" version="57.0.0.0" /></app>'

export DEPOT_TOOLS_WIN_TOOLCHAIN=0
export PYTHONIOENCODING=utf-8
export PATH="$CHROMIUM_ROOT/depot_tools:$PATH"

step() { printf '\n==> %s\n' "$*"; }
die() { printf '\nERRO: %s\n' "$*" >&2; exit 1; }

# --- prerequisites ---------------------------------------------------------
if ! command -v bun >/dev/null; then
  # winget installs Bun without adding it to Git Bash's PATH.
  winget_bun="$(ls -d "$(cygpath -u "${LOCALAPPDATA:-}")"/Microsoft/WinGet/Packages/Oven-sh.Bun_*/bun-windows-x64 2>/dev/null | head -1 || true)"
  [ -n "$winget_bun" ] && export PATH="$winget_bun:$PATH"
fi
for tool in bun uv curl unzip; do
  command -v "$tool" >/dev/null || die "'$tool' não encontrado no PATH"
done
[ -d "$CHROMIUM_ROOT/depot_tools" ] || die "depot_tools não encontrado em $CHROMIUM_ROOT/depot_tools"
[ -f "$MAESTRO_AGENT_KEY" ] || die "chave da extensão não encontrada: $MAESTRO_AGENT_KEY"
mkdir -p "$WORK"

expected_id="$(sed -n 's/^BROWSEROS_AGENT_EXTENSION_ID = "\([a-p]*\)"/\1/p' "$BROWSEROS/bos_build/core/products.py")"
[ -n "$expected_id" ] || die "não foi possível ler BROWSEROS_AGENT_EXTENSION_ID"

# --- 1. CDN resources (server binaries + onboarding baseline) ----------------
server_dir="$BROWSEROS/resources/binaries/browseros_server/windows-x64"
onboarding_dir="$BROWSEROS/resources/binaries/browseros_onboarding"
if [ ! -f "$server_dir/artifact-metadata.json" ]; then
  step "Baixando recursos do servidor (CDN público)"
  curl -fL -o "$WORK/server.zip" "$SERVER_ZIP_URL"
  mkdir -p "$server_dir" && unzip -oq "$WORK/server.zip" -d "$server_dir"
fi
if [ ! -d "$onboarding_dir/resources" ]; then
  step "Baixando recursos do onboarding (CDN público)"
  curl -fL -o "$WORK/onboarding.zip" "$ONBOARDING_ZIP_URL"
  mkdir -p "$onboarding_dir" && unzip -oq "$WORK/onboarding.zip" -d "$onboarding_dir"
fi

# --- 2. extension + onboarding from this tree --------------------------------
step "Instalando dependências (bun install)"
(cd "$AGENT" && bun install)

# The CDN server binary has upstream's PostHog/Sentry keys compiled in, so the
# fork builds its own with empty keys and swaps it in. third_party/bun.exe still
# comes from the CDN zip (upstream fetches it from a private bucket).
step "Compilando o servidor sem telemetria"
server_out="$AGENT/dist/prod/server/windows-x64"
rm -rf "$server_out"
# The final zip step needs a `zip` binary Git Bash lacks; the staged directory
# is what we use, so its exit status is checked through the output instead.
(cd "$AGENT" && BROWSEROS_SERVER_TELEMETRY_OFF=1 bun scripts/build/server.ts --target=windows-x64 --ci) ||
  echo "(etapa final de zip ignorada)"
server_exe="$server_out/resources/bin/browseros_server.exe"
[ -f "$server_exe" ] || die "o build do servidor não gerou $server_exe"
grep -aq 'POSTHOG_API_KEY: ""' "$server_exe" || die "o servidor compilado ainda tem chave de telemetria"
cp -r "$server_out/resources/." "$server_dir/resources/"
uv run --python 3.12 python -I - "$server_dir" <<'EOF'
import hashlib, json, sys
from pathlib import Path
root = Path(sys.argv[1])
meta_path = root / "artifact-metadata.json"
meta = json.loads(meta_path.read_text(encoding="utf-8"))
meta["files"] = [
    {"path": f.relative_to(root).as_posix(),
     "sha256": hashlib.sha256(f.read_bytes()).hexdigest(),
     "size": f.stat().st_size}
    for f in sorted((root / "resources").rglob("*")) if f.is_file()
]
meta_path.write_text(json.dumps(meta, indent=2) + "\n", encoding="utf-8")
EOF

step "Compilando a extensão do agente"
(cd "$AGENT/apps/app" && bun run build)
dist="$AGENT/apps/app/dist/chrome-mv3"
ext_version="$(uv run --python 3.12 python -I -c "import json,sys;print(json.load(open(sys.argv[1]))['version'])" "$dist/manifest.json")"

step "Compilando o onboarding"
(cd "$AGENT/apps/app-onboard" && bun run build:chromium)
cp -r "$AGENT/apps/app-onboard/dist/chromium/." "$onboarding_dir/resources/"

# chrome --pack-extension signs the CRX. Prefer a previous MaestroOS build, then
# CHROME_BINARY, then an installed Google Chrome (find_chrome_binary's order).
built_chrome="$CHROMIUM_ROOT/src/out/Default_browseros_x64/chrome.exe"
if [ -z "${CHROME_BINARY:-}" ] && [ -f "$built_chrome" ]; then
  export CHROME_BINARY="$built_chrome"
fi

step "Assinando o CRX da extensão ($expected_id v$ext_version)"
crx="$WORK/$expected_id.crx"
(cd "$BROWSEROS" && uv run --python 3.12 python - "$dist" "$MAESTRO_AGENT_KEY" "$crx" "$expected_id" <<'EOF'
import sys
from pathlib import Path
from bos_build.release.extensions.crx import find_chrome_binary, pack_crx, read_crx_extension_id
dist, key, out, expected = sys.argv[1:5]
pack_crx(Path(dist), Path(key).read_text(), find_chrome_binary(None), Path(out))
actual = read_crx_extension_id(Path(out).read_bytes())
if actual != expected:
    sys.exit(f"CRX ID {actual} != {expected}: a chave não corresponde ao ID do produto")
EOF
)

cat > "$WORK/bundled-manifest.xml" <<EOF
<?xml version='1.0' encoding='UTF-8'?>
<gupdate xmlns="http://www.google.com/update2/response" protocol="2.0">
  $BUG_REPORTER_LINE
  <app appid="$expected_id"><updatecheck codebase="file://$crx" version="$ext_version" /></app>
</gupdate>
EOF
export BUNDLED_EXTENSIONS_MANIFEST_URL="$WORK/bundled-manifest.xml"

if [ "${1:-}" = "--prepare-only" ]; then
  step "Preparação concluída (sem compilar o Chromium): $crx"
  exit 0
fi

# --- 3. Chromium ---------------------------------------------------------------
cd "$BROWSEROS"
step "Sincronizando a fonte do Chromium (source ensure --reset)"
uv run --python 3.12 browseros source ensure --root "$CHROMIUM_ROOT" --reset

step "Compilando o MaestroOS (isso leva horas)"
uv run --python 3.12 browseros build --preset release --product browseros --arch x64 \
  --no-sign --no-upload --provision none --no-clean --skip download_resources \
  --chromium-src "$CHROMIUM_ROOT/src"

step "Pronto. Instalador em packages/browseros/releases/"
ls -1 "$BROWSEROS/releases/"*/MaestroOS_* 2>/dev/null || true
