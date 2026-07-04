# Design: fix missing `"type": "http"` in Claude Code MCP entries written by claw-server

**Status:** ready for implementation
**Scope:** `packages/browseros-agent` (claw-server, shared package; apps/server import-path update only)
**Author:** design session on branch `feat/mcp-http-fix`

## 1. Problem

Clicking **Connect** for Claude Code on the BrowserOS "MCP / Connected agents" settings
page writes this into `~/.claude.json`:

```json
"browseros": { "url": "http://127.0.0.1:9200/mcp" }
```

Claude Code requires remote entries in the **system-scope** `~/.claude.json` to carry a
transport tag. Without it, Claude Code's config parser falls back to the stdio schema,
fails validation ("invalid MCP server config for browseros: command: expected string,
received undefined"), and silently skips the server. The correct on-disk shape is:

```json
"browseros": { "type": "http", "url": "http://127.0.0.1:9200/mcp" }
```

## 2. Root cause (verified against the code)

Two layers combine to produce the bug:

**(a) Upstream library omission.** Both claw-server and apps/server delegate on-disk
config writes to the external npm package `agent-mcp-manager@0.0.3`
(github.com/DaniAkash/agent-toolkit). Its JSON emitter only writes a transport tag when
the catalog entry sets `transportTagKey` (`dist/index.js`, `specToValue()`):

```js
const tag = transportTagKey ? { [transportTagKey]: spec.transport } : {};
```

The `claude-code` catalog entry sets `transportTagKey: "type"` **only for project scope**
(`projectEmitterConfig`); its system-scope `emitterConfig` is `{ parentKey: "mcpServers" }`
with no tag key. Both BrowserOS servers use `scope: 'system'`, so every claude-code write
lands as a bare `{ url }`. (VS Code's entry has the tag key and is unaffected.)

**(b) claw-server never applies the existing workaround.** apps/server already ships a
tested post-write fixup, `ensureClaudeCodeHttpTransportTag()`
(`apps/server/src/lib/mcp-manager/transport-tag.ts`, tests in
`apps/server/tests/lib/mcp-manager/transport-tag.test.ts`). It is invoked after every
apps/server claude-code http write:

- `apps/server/src/lib/mcp-manager/service.ts:164` (`installInto`)
- `apps/server/src/lib/mcp-manager/reconcile.ts:138` (boot-time URL-drift relink)

The **claw-server** flows never call it. Both of its write paths funnel through
`relinkManagedServer()` (`apps/claw-server/src/services/mcp-relink.ts`), which calls
`mgr.add()` + `mgr.link()` and returns — no fixup:

- **Connect button:** `routes/connections/index.ts` → `services/browseros-connect.ts`
  `connectBrowserosToHarness()` → `relinkManagedServer()` (serverName
  `BROWSEROS_MCP_SERVER_NAME` = `'BrowserClaw'` since commit `bfd5de08`; older installs
  wrote `'browseros'` — see `docs/design/mcp-dual-entry-cleanup.md` for the legacy-name
  cleanup).
- **Profile install:** `services/harness-install.ts` `installForAgent()` →
  `relinkManagedServer()` (serverName = profile slug). Also reached by
  `reconcileHarnessLink()` (profile edits) and `lib/migrate-mcp-urls.ts` (boot URL sweep).

`specFor()` (`services/spec-for.ts`) is *not* at fault — it correctly returns
`{ transport: 'http', url }` for claude-code; the tag is dropped at the library's disk
layer. That asymmetry between apps/server and claw-server is the bug.

Note the profile-install path means **per-profile slug entries** written into
`~/.claude.json` are broken the same way, not just the shared `browseros` entry.

## 3. Fix design

### 3.1 Choke point: `relinkManagedServer()` in `mcp-relink.ts`

Apply the fixup inside `relinkManagedServer()`, immediately after each successful
`mgr.link()` (both the happy path and the restore-previous-link rollback path). This is
the single funnel for every claw-server claude-code write — Connect, profile install,
profile reconcile, and the boot URL migration all pass through it, so no future caller
can forget the tag.

```ts
// inside relinkManagedServer, after: const link = await mgr.link(...)
await tagClaudeCodeHttpEntry(agent, spec, serverName, link.configPath)
return link
```

with a small local helper:

```ts
async function tagClaudeCodeHttpEntry(
  agent: AgentId,
  spec: McpServerSpec,
  serverName: string,
  configPath: string | undefined,
): Promise<void> {
  if (agent !== 'claude-code' || spec.transport !== 'http' || !configPath) return
  await ensureClaudeCodeHttpTransportTag({ configPath, serverName })
}
```

Guards, mirroring apps/server:
- `agent === 'claude-code'` only — no other harness gets touched.
- `spec.transport === 'http'` only — a stdio spec (`command`/`args`) must never receive
  `type: "http"`. (Today `specFor()` always routes claude-code to http, but the guard
  keeps a future catalog flip from corrupting a stdio entry.)
- On the rollback path, guard on `previousSpec.transport` instead of `spec.transport`.

Failure handling: `ensureClaudeCodeHttpTransportTag` already swallows its own errors and
warn-logs (returns `boolean`), so the relink result is unaffected by a fixup failure —
same best-effort semantics apps/server uses.

### 3.2 Code reuse: lift `transport-tag.ts` into `@browseros/shared`

Three options were evaluated:

| Option | Verdict |
|---|---|
| claw-server imports from `@browseros/server` | **Rejected.** claw-server has no dependency on `@browseros/server`, the util is not among server's package exports, and the file imports apps/server internals (`../logger`, `./manager`). Adding a cross-app dependency between two independently built/shipped app binaries for one util is the wrong boundary. |
| Duplicate into claw-server | **Rejected.** ~120 lines is copyable, but the util encodes a Claude Code config-format quirk that should change in exactly one place — e.g. when upstream `agent-mcp-manager` fixes its catalog and both call sites should be deleted together. Two copies invite drift. |
| **Lift into `@browseros/shared`** | **Recommended.** Both apps already depend on `@browseros/shared` (`workspace:*`). The package uses per-file subpath exports (no barrels, per monorepo convention), so a `node:fs`-using subpath cannot leak into browser consumers that import other subpaths. Single source of truth; apps/server's two call sites just change an import line. |

Concrete shape of the lift — new file
`packages/shared/src/mcp/claude-code-transport-tag.ts`, exported as
`@browseros/shared/mcp/claude-code-transport-tag` (add the subpath to
`packages/shared/package.json` `exports` with both `types` and `default`, per convention):

- **Make `configPath` and `serverName` required.** Every existing call site
  (apps/server `service.ts`, `reconcile.ts`; new claw-server choke point; heal step below)
  already has both in hand. This drops the current fallback call to
  `resolveAgentMcpConfigPath('claude-code', 'system')`, so `@browseros/shared` does **not**
  gain an `agent-mcp-manager` dependency.
- **Logging via optional injection.** The current file logs through apps/server's logger.
  The shared version takes an optional `logger?: Logger` (type from
  `@browseros/shared/types/logger`) and stays silent when omitted; each app passes its own
  logger. Behavior (swallow errors, return `boolean` "did write") is unchanged.
- **Everything else moves verbatim:** jsonc-parser `parseTree`/`modify`/`applyEdits`
  surgical edit (preserves the rest of `.claude.json`, which holds unrelated user state),
  the already-tagged short-circuit, missing-file/invalid-JSON/missing-entry no-ops, and
  the tmp-file + rename atomic write.
- Add `"jsonc-parser": "^3.3.1"` to `packages/shared/package.json` dependencies.
- apps/server: delete `src/lib/mcp-manager/transport-tag.ts`; update the two imports in
  `service.ts` and `reconcile.ts` to the shared subpath (pass `logger`). Do **not** leave
  a re-export shim.
- Move the test to `packages/shared/tests/mcp/claude-code-transport-tag.test.ts`
  (add `"test": "bun test"` to the shared package scripts so the root `bun run test`
  picks it up if it iterates workspaces; verify the root test script's discovery reaches
  `packages/shared` — if it does not, keep the test under `apps/server/tests/` importing
  the shared subpath, which still exercises the single implementation).

### 3.3 Heal-on-startup

Users who clicked Connect (or created a profile) before this fix have broken entries on
disk, and `~/.claude.json` may hold **several** of them: the shared connect entry
(`BrowserClaw` — or `browseros` from installs before the `bfd5de08` rename) plus one per
cockpit profile slug. Neither existing boot step repairs them today
(`migrateMcpUrls` skips profiles whose URL is already current, and the shared `browseros`
Connect entry has no boot reconcile at all in claw-server).

New function `healClaudeCodeTransportTags()` in
`apps/claw-server/src/services/claude-code-heal.ts`:

```ts
export async function healClaudeCodeTransportTags(): Promise<number> {
  const mgr = getMcpManager()
  const [servers, links] = await Promise.all([mgr.listServers(), mgr.listLinks()])
  const httpServers = new Set(
    servers.filter((s) => s.spec.transport === 'http').map((s) => s.name),
  )
  let healed = 0
  for (const link of links) {
    if (link.agent !== 'claude-code') continue
    if (!httpServers.has(link.serverName)) continue   // never tag stdio entries
    if (!link.configPath) continue
    const changed = await ensureClaudeCodeHttpTransportTag({
      configPath: link.configPath,
      serverName: link.serverName,
      logger,
    })
    if (changed) healed++
  }
  return healed
}
```

Wiring in `apps/claw-server/src/main.ts`: chain it **after** `migrateMcpUrls` settles
(inside the existing `.then()`), not in parallel with it. `migrateMcpUrls` triggers
library writes to the same `~/.claude.json`; the heal step's direct read-modify-write
must not interleave with them or one side's write can be lost. Keep it fire-and-forget
and log the healed count, matching the migration's error-handling style. Ordering also
means URL-migrated entries (rewritten bare by the library moments earlier) get tagged in
the same boot — though they are already covered by the §3.1 choke point since the
migration goes through `relinkManagedServer`.

The heal iterates **manifest links** (claw-server's own manifest under
`<browserosDir>/claw-server/mcp-manager`), so it only touches entries claw-server wrote —
foreign `.claude.json` entries are never modified. apps/server's own `browseros` entry is
managed by apps/server's separate manifest and its existing reconcile already tags it.

### 3.4 Idempotency

- `ensureClaudeCodeHttpTransportTag` short-circuits (`return false`, no write) when
  `type` is already `"http"` — proven by the existing test's double-invoke assertion.
- Re-clicking Connect: `relinkManagedServer` rewrites the entry via the library (bare),
  then re-tags it — converging to the same bytes every time. No double-write, no
  `type` duplication (jsonc `modify` replaces the property path).
- Every boot re-runs the heal; steady state is a no-op sweep (reads only).

## 4. Files to change

| File | Change |
|---|---|
| `packages/shared/src/mcp/claude-code-transport-tag.ts` | **New.** Lifted `ensureClaudeCodeHttpTransportTag` (required `configPath`/`serverName`, optional injected `logger`). |
| `packages/shared/package.json` | Add `./mcp/claude-code-transport-tag` export; add `jsonc-parser` dep; add `test` script if tests move here. |
| `packages/shared/tests/mcp/claude-code-transport-tag.test.ts` | **Moved** from `apps/server/tests/lib/mcp-manager/transport-tag.test.ts`, plus new cases (see §5). |
| `apps/claw-server/src/services/mcp-relink.ts` | Choke point: tag after each successful `mgr.link()` (happy + rollback paths), guarded on `claude-code` + http + configPath. |
| `apps/claw-server/src/services/claude-code-heal.ts` | **New.** `healClaudeCodeTransportTags()` boot sweep. |
| `apps/claw-server/src/main.ts` | Chain heal after `migrateMcpUrls` settles; log healed count. |
| `apps/server/src/lib/mcp-manager/transport-tag.ts` | **Deleted** (moved to shared). |
| `apps/server/src/lib/mcp-manager/service.ts` | Import from shared subpath; pass `logger`. |
| `apps/server/src/lib/mcp-manager/reconcile.ts` | Import from shared subpath; pass `logger`. |
| `apps/claw-server/tests/services/mcp-relink.test.ts` | **New** unit tests for the choke point. |
| `apps/claw-server/tests/services/claude-code-heal.test.ts` | **New** unit tests for the heal sweep. |

No UI change: `apps/claw-app/screens/mcp/Mcp.tsx` just POSTs
`/connections/:harness/connect`; the fix is entirely server-side.

## 5. Test plan

### Unit

1. **Shared util (moved tests, all existing cases kept):** surgical add + idempotent
   re-run, missing entry no-op, missing file no-op. Add: invalid-JSON no-op; entry with
   `type` already present but not `"http"` gets overwritten to `"http"`; unrelated keys
   and formatting preserved byte-for-byte outside the entry.
2. **`relinkManagedServer` choke point** (stub `McpManager` whose `link()` writes a bare
   `{ "mcpServers": { "<name>": { "url": … } } }` file into a temp dir and returns its
   path as `configPath`, imitating the library):
   - claude-code + http spec → file gains `"type": "http"`; second relink converges.
   - claude-code + stdio spec → file untouched.
   - `cursor` agent + http spec → file untouched.
   - rollback path (make the new `link()` throw once with a `previousSpec`) → restored
     entry is tagged.
   - fixup failure (unwritable path) does not fail the relink result.
3. **Heal sweep** (stub manager `listServers`/`listLinks` + temp config file): bare
   `BrowserClaw` entry and a bare profile-slug entry both healed in one pass; stdio-spec
   server names skipped; non-claude-code links skipped; missing config file → 0 healed,
   no throw; already-tagged steady state → 0 healed.
4. **Existing suites** `apps/claw-server/tests/services/browseros-connect.test.ts` and
   `tests/lib/migrate-mcp-urls.test.ts`: extend their manager stubs if the new tag call
   observes them; assert Connect leaves a tagged entry when the stub materializes a file.

Run: `bun run check && bun run test` from `packages/browseros-agent` (repo ground rules).

### Real end-to-end check (must be executed, not just unit-tested)

1. Back up `~/.claude.json`.
2. Start claw-server (`cd apps/claw-server && bun run start`, or via the BrowserOS dev
   flow per the test-ui skill).
3. Trigger Connect exactly as the UI does:
   `curl -X POST http://127.0.0.1:<claw-port>/connections/Claude%20Code/connect`
   (or click Connect on the MCP settings page).
4. Assert the on-disk shape:
   `jq '.mcpServers.BrowserClaw' ~/.claude.json` →
   `{ "type": "http", "url": "http://127.0.0.1:9200/mcp" }`
   (the entry name is `BrowserClaw` — claw-server's `BROWSEROS_MCP_SERVER_NAME` value —
   not `browseros`, which is the legacy/apps-server name).
5. Assert Claude Code accepts it: `claude mcp list` shows `BrowserClaw` as a connected
   http server (no "invalid MCP server config" skip).
6. Idempotency: re-POST connect; file bytes for the entry unchanged.
7. Heal: hand-edit the entry to remove `"type"`, restart claw-server, confirm the tag
   reappears after boot and the log line reports 1 healed entry.
8. Restore the `.claude.json` backup.

## 6. Other harnesses (findings only — no fixes designed here)

From `agent-mcp-manager@0.0.3`'s catalog/emitters:

- **VS Code** — catalog sets `transportTagKey: "type"`; entries already get
  `"type": "http"`. Fine.
- **Cursor** — writes bare `{ url }` into `~/.cursor/mcp.json`; Cursor auto-detects
  transport from `url`. Believed fine; not a confirmed break.
- **Codex** — TOML emitter writes `[mcp_servers.<name>] url = …`, matching Codex's
  streamable-HTTP config shape. Believed fine.
- **Claude Desktop** — stdio-only in the catalog; entries are `command`-shaped and don't
  need a tag. (apps/server hides it anyway.)
- **Gemini CLI** — ⚠️ worth a follow-up: the emitter writes `{ url }` under `mcpServers`
  in `~/.gemini/settings.json`, but Gemini CLI distinguishes `httpUrl` (streamable HTTP)
  from `url` (SSE). A bare `url` is likely treated as SSE and may fail against the
  BrowserOS endpoint. apps/server already hides gemini for exactly this instability;
  claw-server still offers it as a harness. Flagging only.
- **Zed** — ⚠️ worth a follow-up: emitter writes `{ url, source: "custom", enabled: true }`
  into `context_servers`. Whether Zed accepts a URL-only custom context server (vs.
  requiring `command`) should be verified by whoever owns the Zed harness path. Flagging
  only.

## 7. Risks / edge cases

- **Concurrent writers of `~/.claude.json`.** Claude Code itself rewrites this file
  (it stores history/session state there). Our read-modify-write window is tiny and the
  write is atomic (tmp + rename), but a Claude Code write landing inside our window could
  be lost, and vice versa. This is the same accepted risk apps/server has shipped with;
  no new mitigation designed. Chaining heal after `migrateMcpUrls` removes the one
  *internal* race we control.
- **User-customized entries.** The jsonc surgical edit only touches
  `mcpServers.<serverName>.type`; user formatting, comments-adjacent content, and all
  other keys survive (covered by tests). Entries not present in claw-server's manifest
  are never touched by the heal.
- **Catalog flips.** If a future `agent-mcp-manager` routes claude-code to stdio, the
  `spec.transport === 'http'` guards keep us from stamping `type: "http"` onto a
  `command` entry.
- **Upstream fix collision.** If upstream later adds `transportTagKey: "type"` to
  claude-code's system-scope config, the library writes the tag itself and our fixup
  becomes a no-op (already-tagged short-circuit) — safe, then deletable. **Follow-up:**
  file/PR the one-line catalog fix upstream (`DaniAkash/agent-toolkit`); once released
  and both apps bump the dependency, remove the shared util and both call sites.
- **`link.configPath` undefined.** Guarded; the fixup is skipped rather than resolving a
  path independently (avoids tagging a file the library didn't actually write).
- **Windows/`CLAUDE_CONFIG_DIR`.** No path logic is added anywhere in this design — we
  only ever use the `configPath` the library reports for the link, so nonstandard config
  locations are handled by construction.
