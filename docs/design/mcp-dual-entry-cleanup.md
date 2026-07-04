# Design: single canonical BrowserOS MCP entry + cleanup of stale dual entries

**Status:** ready for implementation (layers on top of
`docs/design/mcp-connect-claude-type-http-fix.md`, "design #1", being implemented on
`feat/mcp-http-fix-impl`)
**Scope:** `packages/browseros-agent` (claw-server; small shared-package addition)
**Author:** design session on branch `feat/mcp-http-fix`

## 1. Problem

Harness configs accumulate MULTIPLE BrowserOS MCP entries written in different eras, and
the stale ones break things:

- `~/.codex/config.toml` observed with BOTH `[mcp_servers.browseros-stdio]`
  (`command = "npx", args = ["mcp-remote", "http://127.0.0.1:9200/mcp"]`) AND
  `[mcp_servers.BrowserClaw]` (`url = "http://127.0.0.1:9200/mcp"`). The stdio one
  errored on every Codex session until hand-removed; `BrowserClaw` alone works.
- `~/.claude.json` observed with BOTH `"browseros"` and `"BrowserClaw"` entries.

Nothing ever removes an entry written under an older name, so every rename or transport
flip strands a live-looking duplicate.

## 2. Root cause (verified)

### 2.1 Two writers, two namespaces, one config file

Two subsystems independently install "BrowserOS as an MCP server" into the **same**
per-user harness config files, under **different server names**, each with its own
manifest that doesn't know the other's entries exist:

| Subsystem | Server name(s) written | Name constant | Manifest location |
|---|---|---|---|
| `apps/server` (BrowserOS product) | `browseros` (http), `browseros-stdio` (stdio `npx mcp-remote <url>`) | `apps/server/src/lib/mcp-manager/manager.ts:22,33` | `<browserosDir>/mcp-manager` |
| `apps/claw-server` (BrowserClaw product) | `BrowserClaw` today; **`browseros` before 2026-07-02** | `apps/claw-server/src/shared/mcp-url-common.ts:12` | `<browserosDir>/claw-server/mcp-manager` |

Product wiring (verified in
`packages/browseros/chromium_patches/chrome/browser/browseros/server/browseros_server_config.cc`):
the browser is built as ONE of two products. `GetManagedServerDescriptor()` launches
`browseros_server` (apps/server) for BrowserOS or `browseros-claw-server` (claw-server)
for BrowserClaw, selected by `IsBrowserClawProduct()`. Both products expose the MCP
endpoint at the same user-facing proxy port (`kDefaultServerPort = 9200` in
`browseros_server_prefs.h`), so entries from every era point at
`http://127.0.0.1:9200/mcp` and look equally alive.

So on any one build only one writer runs — but a user's machine crosses eras (product
pivot BrowserOS → BrowserClaw, library upgrades, the rename), and the harness configs
are shared, durable state that nobody reconciles across eras.

### 2.2 The era matrix (which path wrote which name)

Era boundaries: `agent-mcp-manager` 0.0.3 published 2026-06-26 (Codex flipped from
stdio-only to http-capable in the catalog); claw-server rename commit `bfd5de08`
landed 2026-07-02 ("register MCP entry as BrowserClaw") — whose own doc comment admits
old entries are "not reconciled automatically and need manual removal".

| Era | Writer & trigger | claude-code | codex | cursor / vscode / zed | gemini | claude-desktop |
|---|---|---|---|---|---|---|
| **A** BrowserOS product, lib ≤0.0.2 | apps/app Integrations panel → `POST /mcp-manager/agents/:id/install` (`service.ts installInto`); boot `reconcileUrl` on URL drift | `browseros` `{url}` (bare — pre transport-tag util) | **`browseros-stdio`** `npx mcp-remote` (catalog said stdio-only) ← the erroring Codex entry | `browseros` `{url}` (vscode gets `"type"` from the lib catalog) | hidden | hidden (stdio, needs npx) |
| **B** BrowserOS product, lib 0.0.3+ | same | `browseros` `{url, type:"http"}` (transport-tag util) | `browseros` TOML `url` — but the era-A `browseros-stdio` is only swept if the user re-clicks install (`sweepLegacyLinks` runs on click, not at boot) | `browseros` | hidden | hidden |
| **C** BrowserClaw product, pre-`bfd5de08` | claw-app MCP screen → `POST /connections/:harness/connect` (`browseros-connect.ts`); profile installs (`harness-install.ts`, slug-named — out of scope here); boot `migrateMcpUrls` on URL drift | `browseros` `{url}` bare (bug #1) | `browseros` TOML `url` | `browseros` `{url}` | `browseros` `{url}` | `browseros` stdio `npx mcp-remote` |
| **D** BrowserClaw product, current | same | `BrowserClaw` `{url}` bare (bug #1; fixed by design #1 → `{type:"http", url}`) | `BrowserClaw` TOML `url` | `BrowserClaw` | `BrowserClaw` | `BrowserClaw` stdio |

The observed dual states fall straight out of the matrix: `browseros-stdio` +
`BrowserClaw` in Codex = era A + era D; `browseros` + `BrowserClaw` in Claude Code =
era A/B/C + era D. Nothing in eras C/D removes era-A/B names (they're
`ForeignEntryError` territory for claw-server's manifest), and claw's own rename
commit didn't migrate its era-C name.

> **Correction to design #1:** that doc described the Connect flow as writing serverName
> `browseros` and its e2e step asserts `.mcpServers.browseros`. Post-`bfd5de08` the
> claw-server constant is `BrowserClaw` — the implementation of design #1 must tag and
> assert `.mcpServers.BrowserClaw`. (Design #1's mechanics are unaffected: it uses the
> `serverName` variable throughout.)

### 2.3 Are both subsystems live? Who should own harness writes?

Both are live **in the repo and both binaries ship** (separate appcast feeds:
`appcast-server.xml`, `appcast-claw-server.xml`), but per product build exactly one
runs, and the current flagship direction is BrowserClaw (claw-onboard app, branding
commits, the deliberate `BrowserClaw` rename). The extension-side Integrations panel
(`apps/app/screens/mcp-settings/IntegrationsSection` →
`integrations-section.hooks.ts` → apps/server `/mcp-manager/agents/:id/install`) is
still wired in the BrowserOS product.

**Ownership recommendation:** the harness-config writer is *the managed server of the
running product* — there is no scenario where both run concurrently on one machine by
design. For the BrowserClaw product (the direction of travel), **claw-server is the
single owner**, and since the product pivot is one-directional, claw-server also takes
responsibility for **cleaning up all earlier-era BrowserOS names** it finds. apps/server
keeps its existing behavior for BrowserOS-product users (its own click-time
`sweepLegacyLinks` already handles its http↔stdio flips); we do NOT teach apps/server to
delete `BrowserClaw` entries — that would ping-pong on a machine that has run both
products. *(Assumption to confirm with product: BrowserOS-product builds are legacy and
will not be asked to reclaim ownership from BrowserClaw. If that's wrong, the sweep
below must move behind a product flag.)*

### 2.4 Why the Codex `browseros-stdio` entry errored while `BrowserClaw` worked (brief)

The stdio entry makes Codex spawn `npx mcp-remote http://127.0.0.1:9200/mcp` at session
start: it requires Node/npx on PATH (the exact reason apps/server hides Claude Desktop
from one-click install), pays an `npx` cold-start/network fetch that can fail or time
out offline, and any nonzero exit or stderr noise surfaces as an MCP startup error in
Codex every session. The `BrowserClaw` entry is a native streamable-HTTP URL — no child
process, no Node dependency — which Codex ≥0.0.3-catalog supports directly. The wrapper
also duplicated the exact same toolset under a second server name whenever it *did*
boot. Legacy-but-working duplicates additionally risk pinning a stale URL after port
drift, since no live subsystem reconciles the foreign-era entry.

## 3. Design

### 3.1 Canonical name

**`BrowserClaw`** — it's what the user sees in `claude mcp list` / Cursor settings and
matches the product brand; it's already the shipped value (era D), so keeping it means
only historical names need cleanup, never the current one. Canonical shape per harness =
whatever `specFor()` + design #1's transport tag produce today. The legacy-name set
becomes a single exported constant next to the canonical one
(`apps/claw-server/src/shared/mcp-url-common.ts`):

```ts
export const BROWSEROS_MCP_SERVER_NAME = 'BrowserClaw'
/** Names earlier BrowserOS/BrowserClaw eras wrote into harness configs. */
export const LEGACY_BROWSEROS_MCP_SERVER_NAMES = ['browseros', 'browseros-stdio'] as const
```

### 3.2 Cleanup mechanics: `sweepLegacyBrowserosEntries`

New module `apps/claw-server/src/services/legacy-mcp-sweep.ts`:

```ts
export async function sweepLegacyBrowserosEntries(
  agent: AgentId,
  configPath: string,
): Promise<string[]>  // names actually removed
```

Two-phase per agent/config:

1. **Manifest-owned removals (library path).** For each legacy name, try
   `mgr.unlink({ serverName, agent, configPath })` and, when no links remain,
   `mgr.remove(...)` — this cleans claw-server's OWN era-C `browseros` records (manifest
   + disk together, the same pattern `disconnectBrowserosFromHarness` uses). Catch and
   ignore `ForeignEntryError` / `ServerNotFoundError`: foreign means phase 2's problem.

2. **Foreign on-disk removals (direct file surgery).** Era-A/B entries live in
   apps/server's manifest, so from claw's manager they are permanently foreign — the
   library refuses to touch them by design. Remove them with the same surgical-edit
   approach design #1 lifted into `@browseros/shared`:
   - **JSON harnesses** (claude-code `mcpServers`, cursor `mcpServers`, vscode
     `servers`, zed `context_servers`, gemini `mcpServers`): jsonc-parser
     `parseTree`/`modify(path, undefined)`/`applyEdits`, atomic tmp+rename write.
     The parent key per agent comes from a small local map (5 constants; the library's
     catalog isn't exported — keep the map next to a comment pointing at
     `agent-mcp-manager`'s `_vendor/catalog.ts` so version bumps get re-checked).
   - **Codex (TOML)**: parse with `@iarna/toml` (the same library `agent-mcp-manager`
     uses for its codex emitter, so round-trip behavior matches the writes users already
     have), delete `mcp_servers.<name>`, re-stringify, atomic write. Add `@iarna/toml`
     to claw-server deps.

**Safety rules — an entry is removed ONLY if all of these hold:**

- Its name is in `LEGACY_BROWSEROS_MCP_SERVER_NAMES` (never the canonical `BrowserClaw`,
  never profile slugs, never anything else).
- Its shape is provably ours:
  - http shape: `url` (or codex TOML `url`) parses as a URL with host `127.0.0.1` (or
    `localhost`) and pathname `/mcp` — the only shape either subsystem has ever written
    (extra keys like zed's injected `source`/`enabled` are ours and don't block removal);
  - stdio shape: `command === 'npx'` and `args` is exactly `['mcp-remote', <url>]`
    (optionally tolerating a leading `-y`) where `<url>` passes the same loopback+`/mcp`
    test — the only stdio shape either subsystem has ever written.
- Anything else under a legacy name (user-customized URL, different command, remote
  host) is left untouched and warn-logged once.
- `browseros-stdio` is additionally gated on
  `resolveAgentSurface(agent, 'system').supportedTransports.includes('http')` — per the
  goal, the broken wrapper is only auto-removed when the agent can take the native http
  entry that supersedes it. (All currently surfaced claw harnesses pass this.)

The sweep never creates entries; pairing with the canonical write is the caller's job
(below). It is idempotent by construction: a swept file has no legacy names left, so a
second run is a pure read.

### 3.3 Hook 1 — Connect / every managed write (design #1's choke point)

Design #1 adds a post-link step inside `relinkManagedServer()`
(`apps/claw-server/src/services/mcp-relink.ts`): tag claude-code http entries. This
design appends one more best-effort call at the same spot, after the tag:

```ts
// after mgr.link() succeeds and tagClaudeCodeHttpEntry(...) ran:
await sweepLegacyBrowserosEntries(agent, link.configPath).catch(log)
```

Every claw-server write path funnels through `relinkManagedServer` (Connect button,
profile install, profile reconcile, boot URL migration — established in design #1), so
every write now also supersedes the legacy entries in that same config file, and the
ordering guarantees we only remove after the canonical entry is freshly in place.
Sweep failures must not fail the connect (same best-effort contract as the tag).

### 3.4 Hook 2 — boot-time heal (extends design #1's heal step)

Design #1 chains `healClaudeCodeTransportTags()` after `migrateMcpUrls()` in
`apps/claw-server/src/main.ts`. This design extends that chain with
`healLegacyBrowserosEntries()` (new, in `legacy-mcp-sweep.ts`), so users who never
click Connect again still converge:

```
migrateMcpUrls → healClaudeCodeTransportTags → healLegacyBrowserosEntries
```

(sequential, still fire-and-forget as a whole — all three write the same config files,
so they must not interleave; same reasoning as design #1 §3.3.)

For each external harness in `HARNESS_TO_AGENT_ID` (agentId non-null):

1. Resolve the config path via `resolveAgentMcpConfigPath(agentId, 'system')`; skip if
   the file doesn't exist.
2. Detect provably-ours legacy entries (same predicate as §3.2, read-only pass). None →
   skip (steady-state boots read, never write).
3. If found: call the existing `connectBrowserosToHarness(harness)`. This reuses the
   whole stack — canonical `BrowserClaw` entry written/refreshed (with `allowOverwrite`
   ownership adoption, design #1's `type: "http"` tag), then the §3.3 sweep inside
   `relinkManagedServer` removes the legacy entries. No new write machinery on the heal
   path at all; the heal is just "detect evidence of an older era, then run Connect".

Rationale for auto-migrating (vs. supersede-only-when-BrowserClaw-already-exists): a
provably-ours legacy entry IS the user's prior consent — they clicked install in an
earlier era and the entry still points at the live 9200 proxy. Rewriting it to the
working canonical form is repair, not a new grant. The conservative alternative (only
sweep configs that already contain a `BrowserClaw` entry, leave lone `browseros`
entries alone) is one `if` away if product prefers it — but it would leave era-A/B/C
users with a bare-url claude-code entry that Claude Code rejects (bug #1) and an
erroring codex stdio wrapper forever, which is exactly the reported pain.

Log a summary line (`healed: {harness: [removedNames]}`) so support can see what moved.

### 3.5 What we deliberately do NOT do

- **Don't touch apps/server's manifest** (`<browserosDir>/mcp-manager`). Deleting
  another app's private state from claw is fragile. Consequence flagged in risks: if the
  user later runs a BrowserOS-product build with `BROWSEROS_MCP_PUBLIC_URL` set and the
  URL drifted, apps/server's `reconcileUrl` can resurrect `browseros` entries from its
  manifest. Acceptable: the next claw boot sweeps them again; a permanent fix belongs to
  the product-level decision to retire the apps/server install surface (follow-up,
  §2.3 assumption).
- **Don't rename apps/server's `browseros` constants** or add cleanup of `BrowserClaw`
  there (ping-pong risk, §2.3).
- **Don't touch profile-slug entries** (cockpit profiles are current-era, design #1
  already tags them; their lifecycle is `harness-install.ts`'s).
- **Don't design the gemini/zed correctness fixes** flagged in design #1 §6.

## 4. Files to change

| File | Change |
|---|---|
| `apps/claw-server/src/shared/mcp-url-common.ts` | Add `LEGACY_BROWSEROS_MCP_SERVER_NAMES = ['browseros', 'browseros-stdio']`. |
| `apps/claw-server/src/services/legacy-mcp-sweep.ts` | **New.** `sweepLegacyBrowserosEntries(agent, configPath)` (§3.2 two-phase + safety predicate) and `healLegacyBrowserosEntries()` (§3.4). |
| `apps/claw-server/src/services/mcp-relink.ts` | Append best-effort sweep after link + design #1's tag (§3.3). |
| `apps/claw-server/src/main.ts` | Chain `healLegacyBrowserosEntries()` after design #1's `healClaudeCodeTransportTags()`. |
| `apps/claw-server/package.json` | Add `@iarna/toml` (codex TOML surgery) and `jsonc-parser` deps. |
| `apps/claw-server/tests/services/legacy-mcp-sweep.test.ts` | **New** unit tests (§5). |
| `apps/claw-server/tests/services/mcp-relink.test.ts` | Extend design #1's new suite: relink also sweeps. |
| `docs/design/mcp-connect-claude-type-http-fix.md` | Erratum applied separately: Connect-flow serverName is `BrowserClaw`, e2e asserts `.mcpServers.BrowserClaw` (§2.2 correction note). |

If design #1's implementation exposes its atomic-write/jsonc helpers from
`@browseros/shared` (`packages/shared/src/mcp/`), reuse them; otherwise a local
`atomicWrite` copy in `legacy-mcp-sweep.ts` is acceptable and can be unified later.

## 5. Test plan

### Unit (`bun test` in claw-server; run `bun run check && bun run test` from repo root)

**Sweep predicate + JSON surgery** (temp files, no real manager):
- `.claude.json` seeded with `browseros` (bare `{url: http://127.0.0.1:9200/mcp}`),
  `browseros-stdio` (`{command: "npx", args: ["mcp-remote", "http://127.0.0.1:9200/mcp"]}`),
  `BrowserClaw`, and a foreign `other` entry → sweep removes exactly the two legacy
  names; `BrowserClaw`, `other`, all sibling keys, and formatting outside the edits
  survive byte-for-byte; second run returns `[]` and writes nothing.
- NOT removed: legacy-named entries with a non-loopback URL, a non-`/mcp` path, a
  non-`npx` command, or extra/changed `args` — file untouched, warning logged.
- Zed shape (`context_servers`, injected `source`/`enabled`) removed under legacy name.
- Missing file / invalid JSON → no-op, no throw.

**TOML surgery (codex):** seeded `config.toml` with `[mcp_servers.browseros-stdio]`
(npx wrapper) + `[mcp_servers.BrowserClaw]` + an unrelated `[mcp_servers.foo]` and a
non-MCP table → sweep removes only `browseros-stdio`; `BrowserClaw`, `foo`, and other
tables survive re-stringify; idempotent.

**Phase 1 manifest cleanup:** stub manager whose manifest holds a claw era-C
`browseros` link → sweep calls `unlink`+`remove` for it (manifest cleaned), and
`ForeignEntryError` from the stub falls through to file surgery without throwing.

**`browseros-stdio` http-capability gate:** with a stubbed stdio-only surface, the
stdio entry is left in place.

**Relink integration (extends design #1's suite):** after `relinkManagedServer` for
claude-code, the temp config holds exactly one `BrowserClaw` entry with
`type: "http"` and zero legacy names; sweep failure (unwritable file) does not fail
the relink.

**Boot heal:** temp configs for two harnesses, one seeded with legacy entries, one
clean → heal invokes connect only for the seeded one (spy), resulting file has exactly
one canonical entry; clean harness's file mtime/content unchanged; missing harness
config skipped.

### Real end-to-end convergence check (must be executed)

1. Back up `~/.claude.json` and `~/.codex/config.toml`.
2. Seed duplicates exactly as observed in the field:
   - `~/.claude.json` → `mcpServers.browseros = {"url":"http://127.0.0.1:9200/mcp"}`,
     `mcpServers.browseros-stdio = {"command":"npx","args":["mcp-remote","http://127.0.0.1:9200/mcp"]}`,
     plus a decoy `mcpServers.myserver = {"url":"http://127.0.0.1:9999/other"}`.
   - `~/.codex/config.toml` → `[mcp_servers.browseros-stdio]` npx wrapper +
     `[mcp_servers.BrowserClaw]` url entry.
3. Start claw-server; click Connect for Claude Code (or POST
   `/connections/Claude%20Code/connect`) and Connect for Codex.
4. Assert convergence:
   - `jq '.mcpServers | keys' ~/.claude.json` → contains `BrowserClaw` and `myserver`
     only (no `browseros*`); `jq '.mcpServers.BrowserClaw'` →
     `{"type":"http","url":"http://127.0.0.1:9200/mcp"}` (design #1's tag).
   - `config.toml` has exactly `[mcp_servers.BrowserClaw]` with `url`, no
     `browseros-stdio` table, other tables intact.
5. Harness acceptance: `claude mcp list` shows a single connected `BrowserClaw`;
   `codex` starts a session with no MCP startup errors and `BrowserClaw` tools present.
6. Boot-heal variant: re-seed the legacy entries by hand, restart claw-server WITHOUT
   clicking anything, verify the same convergence plus the heal summary log line.
7. Idempotency: restart again; verify config files' bytes unchanged (steady-state boot
   is read-only).
8. Restore backups.

## 6. Risks / edge cases

- **TOML rewrite loses comments/formatting** in `~/.codex/config.toml` (parse →
  stringify, no surgical TOML editor). Accepted: `agent-mcp-manager`'s own codex writes
  already do exactly this, so any config we'd sweep has already been round-tripped.
- **False-positive removal** of a user's own entry coincidentally named
  `browseros`/`browseros-stdio` pointing at loopback + `/mcp`. Made vanishingly narrow
  by the shape predicate; such an entry is also indistinguishable from ours on purpose,
  and the canonical replacement serves the same endpoint.
- **Machines that run BOTH products over time.** A later BrowserOS-product boot can
  re-write `browseros` names from apps/server's untouched manifest (only on URL drift
  with `BROWSEROS_MCP_PUBLIC_URL` set, or on Integrations-panel clicks). Claw re-sweeps
  on its next boot; documented as accepted oscillation until the apps/server install
  surface is retired (product follow-up, §2.3/§3.5).
- **Auto-migration surprise:** boot heal rewrites configs without a click. Scoped to
  entries that are provably ours and already-consented (§3.4 rationale); the
  conservative supersede-only mode is a one-line policy switch if product objects.
- **Concurrent writers** of harness configs (Claude Code rewrites `~/.claude.json`
  itself): same tiny read-modify-write window accepted in design #1; atomic tmp+rename
  writes; the boot chain is sequenced so our own three steps never interleave.
- **Claude Desktop:** claw writes a stdio `BrowserClaw` wrapper for it (harness list
  includes it) — the sweep must key on *entry shape*, not "canonical name ⇒ http";
  the design does (predicate is shape-based, canonical name is never removed).
- **Design #1 coupling:** hooks land inside `relinkManagedServer` and the `main.ts`
  heal chain that design #1 introduces. If #2 is implemented first for any reason, the
  sweep call sites are the same two files and the tag/sweep order within them is
  tag-then-sweep either way.
- **Library version bumps** can change per-agent parent keys or transport routing; the
  local parent-key map carries a pointer comment to the library catalog, and the
  `browseros-stdio` gate re-reads `resolveAgentSurface` at runtime.
