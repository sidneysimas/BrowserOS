import type { Kit, KitId } from './kits'

/** A tile on the new tab's "Seus sites" row. `kitId` records which kit added
 * it (absent for sites the user added), so a later "restore kit" can tell
 * kit items from the user's own. */
export interface PinnedSite {
  title: string
  url: string
  kitId?: KitId
}

const MAX_PINNED_SITES = 12

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
