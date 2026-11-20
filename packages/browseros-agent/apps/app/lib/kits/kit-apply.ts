import type { Kit, KitCommand, KitId } from './kits'

/** A tile on the new tab's "Seus sites" row. `kitId` records which kit added
 * it (absent for sites the user added), so a later "restore kit" can tell
 * kit items from the user's own. */
export interface PinnedSite {
  title: string
  url: string
  kitId?: KitId
}

export const MAX_PINNED_SITES = 12

function siteKey(url: string): string {
  try {
    const parsed = new URL(url)
    return `${parsed.host}${parsed.pathname.replace(/\/$/, '')}`.toLowerCase()
  } catch {
    return url.trim().toLowerCase()
  }
}

/**
 * Adds a kit's sites after the ones already pinned. Applying a kit is additive:
 * switching kits keeps everything the user had, and re-applying the same kit
 * is a no-op because sites are de-duplicated by host + path.
 */
export function mergeKitSites(
  current: readonly PinnedSite[],
  kit: Kit,
): PinnedSite[] {
  const seen = new Set(current.map((site) => siteKey(site.url)))
  const merged = [...current]
  for (const site of kit.sites) {
    const key = siteKey(site.url)
    if (seen.has(key)) continue
    seen.add(key)
    merged.push({ title: site.title, url: site.url, kitId: kit.id })
  }
  return merged.slice(0, MAX_PINNED_SITES)
}

/** The kit's personalization only fills an empty Personalize text; anything
 * the user wrote wins. Returns the text to store, or null to leave it alone. */
export function kitPersonalization(current: string, kit: Kit): string | null {
  return current.trim() ? null : kit.personalization
}

/** An address-bar command as stored: a kit command plus where it came from. */
export interface OmniboxCommand extends KitCommand {
  kitId?: KitId
}

/** Keywords are one lowercase word so `m <keyword> <text>` parses unambiguously. */
export const KEYWORD_PATTERN = /^[a-z0-9-]{1,20}$/

export function normalizeKeyword(keyword: string): string {
  return keyword.trim().toLowerCase()
}

/** Adds a kit's commands, keeping the user's own when a keyword collides. */
export function mergeKitCommands(
  current: readonly OmniboxCommand[],
  kit: Kit,
): OmniboxCommand[] {
  const seen = new Set(current.map((command) => command.keyword))
  const merged = [...current]
  for (const command of kit.commands) {
    if (seen.has(command.keyword)) continue
    seen.add(command.keyword)
    merged.push({ ...command, kitId: kit.id })
  }
  return merged
}

/** Splits omnibox text (after the `m` keyword) into a known command and the
 * rest of the text. Null when the first word is not a command, so the caller
 * can fall back to asking the assistant. */
export function parseOmniboxInput(
  text: string,
  commands: readonly OmniboxCommand[],
): { command: OmniboxCommand; query: string } | null {
  const trimmed = text.trim()
  const space = trimmed.search(/\s/)
  const head = normalizeKeyword(
    space === -1 ? trimmed : trimmed.slice(0, space),
  )
  const command = commands.find((entry) => entry.keyword === head)
  if (!command) return null
  return { command, query: space === -1 ? '' : trimmed.slice(space).trim() }
}

/** Fills `{q}`; a command used without text opens its site's root instead of
 * a search for the empty string. */
export function buildCommandUrl(command: KitCommand, query: string): string {
  if (!query) {
    try {
      return new URL(command.url.replaceAll('{q}', '')).origin
    } catch {
      return command.url.replaceAll('{q}', '')
    }
  }
  return command.url.replaceAll('{q}', encodeURIComponent(query))
}
