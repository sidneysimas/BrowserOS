import { useEffect, useState } from 'react'
import type { OmniboxCommand, PinnedSite } from './kit-apply'
import {
  type KitSelection,
  kitSelectionStorage,
  omniboxCommandsStorage,
  pinnedSitesStorage,
} from './kit-storage'

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

export function useOmniboxCommands(): OmniboxCommand[] | undefined {
  return useStorageValue(omniboxCommandsStorage)
}
