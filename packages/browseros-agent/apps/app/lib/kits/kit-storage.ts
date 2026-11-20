import { storage } from '@wxt-dev/storage'
import { personalizationStorage } from '@/lib/personalization/personalizationStorage'
import {
  KEYWORD_PATTERN,
  kitPersonalization,
  MAX_PINNED_SITES,
  mergeKitCommands,
  mergeKitSites,
  normalizeKeyword,
  type OmniboxCommand,
  type PinnedSite,
} from './kit-apply'
import type { Kit, KitId } from './kits'

/**
 * Persistence for the chosen kit and the state it seeds: pinned new-tab sites
 * and address-bar commands.
 *
 * Everything lives in extension-local storage, so the new tab, onboarding,
 * settings and the background omnibox handler (entrypoints/background) share
 * one copy and react to each other through `watch`. This module stays free of
 * React because the background imports it; hooks are in kit-hooks.ts.
 * `skipped` records an explicit "no kit" so the new tab stops inviting the user
 * to pick one; a null selection means the question was never answered.
 */
export interface KitSelection {
  kitId: KitId | null
  version: number
  skipped: boolean
  chosenAt: number
}

export const kitSelectionStorage = storage.defineItem<KitSelection | null>(
  'local:maestroKit',
  { fallback: null },
)

export const pinnedSitesStorage = storage.defineItem<PinnedSite[]>(
  'local:pinnedSites',
  { fallback: [] },
)

export const omniboxCommandsStorage = storage.defineItem<OmniboxCommand[]>(
  'local:omniboxCommands',
  { fallback: [] },
)

/** Records the kit and seeds its sites, commands and personalization. Also
 * serves "restore kit": re-applying only adds back what is missing. */
export async function applyKit(kit: Kit): Promise<void> {
  const [sites, commands, personalization] = await Promise.all([
    pinnedSitesStorage.getValue(),
    omniboxCommandsStorage.getValue(),
    personalizationStorage.getValue(),
  ])
  const seeded = kitPersonalization(personalization, kit)
  await Promise.all([
    pinnedSitesStorage.setValue(mergeKitSites(sites, kit)),
    omniboxCommandsStorage.setValue(mergeKitCommands(commands, kit)),
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

/** Thrown for user input the forms should show as a field error. */
export class KitInputError extends Error {}

export async function addPinnedSite(site: PinnedSite): Promise<void> {
  const sites = await pinnedSitesStorage.getValue()
  if (sites.some((entry) => entry.url === site.url)) {
    throw new KitInputError('Este site já está na lista.')
  }
  if (sites.length >= MAX_PINNED_SITES) {
    throw new KitInputError(`Limite de ${MAX_PINNED_SITES} sites atingido.`)
  }
  await pinnedSitesStorage.setValue([...sites, site])
}

export async function removePinnedSite(url: string): Promise<void> {
  const sites = await pinnedSitesStorage.getValue()
  await pinnedSitesStorage.setValue(sites.filter((site) => site.url !== url))
}

export async function addOmniboxCommand(
  command: OmniboxCommand,
): Promise<void> {
  const keyword = normalizeKeyword(command.keyword)
  if (!KEYWORD_PATTERN.test(keyword)) {
    throw new KitInputError(
      'Use uma palavra, só letras minúsculas, números ou hífen.',
    )
  }
  const commands = await omniboxCommandsStorage.getValue()
  if (commands.some((entry) => entry.keyword === keyword)) {
    throw new KitInputError(`O comando "${keyword}" já existe.`)
  }
  await omniboxCommandsStorage.setValue([...commands, { ...command, keyword }])
}

export async function removeOmniboxCommand(keyword: string): Promise<void> {
  const commands = await omniboxCommandsStorage.getValue()
  await omniboxCommandsStorage.setValue(
    commands.filter((command) => command.keyword !== keyword),
  )
}
