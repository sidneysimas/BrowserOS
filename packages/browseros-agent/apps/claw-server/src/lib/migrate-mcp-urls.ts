/**
 * @license
 * Copyright 2025 BrowserOS
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * One-shot startup migration for stored cockpit MCP URLs.
 *
 * The migration walks the profile directory, re-installs the harness
 * entry with the runtime's current canonical MCP URL, and rewrites
 * profile JSON only after that entry is in place.
 *
 * Failures are logged per-profile; one bad file does not abort the
 * sweep. The migration is idempotent: a second run is a no-op once
 * every URL has been refreshed; failed harness installs leave the
 * old URL stored so the next boot retries.
 */

import {
  type StoredAgentProfile,
  storedAgentProfileSchema,
} from '../routes/agents/schemas'
import { installForAgent, uninstallForAgent } from '../services/harness-install'
import { logger } from './logger'
import { listFiles, readJson, writeJson } from './storage'

const AGENTS_SUBDIR = 'agents'

export async function migrateMcpUrls(
  targetMcpUrl: string,
): Promise<{ migrated: number; skipped: number; failed: number }> {
  let migrated = 0
  let skipped = 0
  let failed = 0
  const names = await listFiles(AGENTS_SUBDIR)
  for (const name of names) {
    const file = `${AGENTS_SUBDIR}/${name}`
    try {
      const profile = await readJson(file, storedAgentProfileSchema)
      const next = targetMcpUrl
      if (profile.mcpUrl === next) {
        skipped++
        continue
      }
      // Missing or already-removed stale entries must not block installing the replacement entry.
      try {
        await uninstallForAgent({
          slug: profile.slug,
          harness: profile.harness,
        })
      } catch (uninstallErr) {
        logger.warn('migration uninstall step threw; continuing install', {
          file,
          slug: profile.slug,
          error:
            uninstallErr instanceof Error
              ? uninstallErr.message
              : String(uninstallErr),
        })
      }
      const updated: StoredAgentProfile = { ...profile, mcpUrl: next }
      const outcome = await installForAgent({
        slug: updated.slug,
        mcpUrl: updated.mcpUrl,
        harness: updated.harness,
      })
      if (!outcome.installed) {
        failed++
        logger.warn('failed to reinstall harness during mcpUrl migration', {
          file,
          slug: profile.slug,
          message: outcome.message,
        })
        continue
      }
      await writeJson(file, updated, storedAgentProfileSchema)
      migrated++
      logger.info('migrated cockpit mcpUrl', {
        slug: profile.slug,
        from: profile.mcpUrl,
        to: next,
      })
    } catch (err) {
      failed++
      logger.warn('failed to migrate cockpit profile mcpUrl', {
        file,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }
  return { migrated, skipped, failed }
}
