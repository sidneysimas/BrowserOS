/**
 * @license
 * Copyright 2025 BrowserOS
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { ensureClaudeCodeHttpTransportTag } from '@browseros/shared/mcp/claude-code-transport-tag'
import { logger } from '../lib/logger'
import { getMcpManager } from '../lib/mcp-manager'
import { BROWSEROS_MCP_SERVER_NAME } from '../shared/mcp-url-common'

const LEGACY_BROWSEROS_MCP_SERVER_NAME = 'browseros'

export async function healClaudeCodeTransportTags(): Promise<number> {
  const mgr = getMcpManager()
  const [servers, links] = await Promise.all([
    mgr.listServers(),
    mgr.listLinks(),
  ])
  const serversByName = new Map(servers.map((server) => [server.name, server]))
  let healed = 0

  for (const link of links) {
    if (link.agent !== 'claude-code') continue
    const server = serversByName.get(link.serverName)
    if (server?.spec.transport !== 'http') continue
    if (!link.configPath) continue

    for (const entry of claudeCodeServerNamesToHeal(
      link.serverName,
      server.spec.url,
    )) {
      const changed = await ensureClaudeCodeHttpTransportTag({
        configPath: link.configPath,
        serverName: entry.serverName,
        expectedUrl: entry.expectedUrl,
        logger,
      })
      if (changed) healed++
    }
  }

  return healed
}

function claudeCodeServerNamesToHeal(
  serverName: string,
  expectedUrl: string,
): Array<{ serverName: string; expectedUrl?: string }> {
  if (
    serverName !== BROWSEROS_MCP_SERVER_NAME &&
    serverName !== LEGACY_BROWSEROS_MCP_SERVER_NAME
  ) {
    return [{ serverName }]
  }
  const aliases = new Set([
    serverName,
    BROWSEROS_MCP_SERVER_NAME,
    LEGACY_BROWSEROS_MCP_SERVER_NAME,
  ])
  return Array.from(aliases, (alias) => ({
    serverName: alias,
    expectedUrl: alias === serverName ? undefined : expectedUrl,
  }))
}
