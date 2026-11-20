import { storage } from '@wxt-dev/storage'
import { useEffect, useState } from 'react'
import { personalizationStorage } from '@/lib/personalization/personalizationStorage'
import { kitPersonalization, mergeKitSites, type PinnedSite } from './kit-apply'
import type { Kit, KitId } from './kits'

/**
 * Persistence for the chosen kit and the pinned sites it seeds.
 *
 * Both live in extension-local storage, so the new tab, the onboarding page and
 * settings see the same values and react to each other through `watch`.
 * `skipped` records an explicit "no kit" so the new tab stops inviting the user
 * to pick one; a null selection means the question was never answered.
 */
export interface KitSelection {
  kitId: KitId | null
  version: number
  skipped: boolean
  chosenAt: number
}

const kitSelectionStorage = storage.defineItem<KitSelection | null>(
  'local:maestroKit',
  { fallback: null },
)

const pinnedSitesStorage = storage.defineItem<PinnedSite[]>(
  'local:pinnedSites',
  { fallback: [] },
)

/** Records the kit and seeds its sites and personalization (see kit-apply). */
export async function applyKit(kit: Kit): Promise<void> {
  const [sites, personalization] = await Promise.all([
    pinnedSitesStorage.getValue(),
    personalizationStorage.getValue(),
  ])
  const seeded = kitPersonalization(personalization, kit)
  await Promise.all([
    pinnedSitesStorage.setValue(mergeKitSites(sites, kit)),
    seeded === null ? undefined : personalizationStorage.setValue(seeded),
    kitSelectionStorage.setValue({
      kitId: kit.id,
      version: kit.version,
      skipped: false,
      chosenAt: Date.now(),
    }),
  ])
}

export async function skipKit(): Promise<void> {
  await kitSelectionStorage.setValue({
    kitId: null,
    version: 0,
    skipped: true,
    chosenAt: Date.now(),
  })
}

export async function removePinnedSite(url: string): Promise<void> {
  const sites = await pinnedSitesStorage.getValue()
  await pinnedSitesStorage.setValue(sites.filter((site) => site.url !== url))
}

/** Subscribes before the first read so a save in another tab is never
 * overwritten by a slower initial load. `undefined` means still loading. */
function useStorageValue<T>(item: {
  getValue: () => Promise<T>
  watch: (cb: (value: T) => void) => () => void
}): T | undefined {
  const [value, setValue] = useState<T | undefined>(undefined)
  useEffect(() => {
    let changed = false
    const unwatch = item.watch((next) => {
      changed = true
      setValue(next)
    })
    item.getValue().then((initial) => {
      if (!changed) setValue(initial)
    })
    return unwatch
  }, [item])
  return value
}

export function useKitSelection(): KitSelection | null | undefined {
  return useStorageValue(kitSelectionStorage)
}

export function usePinnedSites(): PinnedSite[] | undefined {
  return useStorageValue(pinnedSitesStorage)
}
