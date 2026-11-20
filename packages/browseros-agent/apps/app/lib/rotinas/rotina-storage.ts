import { storage } from '@wxt-dev/storage'
import { useEffect, useState } from 'react'
import type { RotinaMeta } from './rotinas'

/**
 * Rotina metadata keyed by scheduled-job id (see rotinas.ts for why it is not
 * on the server row). A job without an entry is a plain upstream scheduled
 * task, which the Rotinas page shows as a one-step rotina built from `query`.
 */
const rotinasStorage = storage.defineItem<Record<string, RotinaMeta>>(
  'local:rotinas',
  { fallback: {} },
)

export async function saveRotinaMeta(
  jobId: string,
  meta: RotinaMeta,
): Promise<void> {
  const all = await rotinasStorage.getValue()
  await rotinasStorage.setValue({ ...all, [jobId]: meta })
}

export async function removeRotinaMeta(jobId: string): Promise<void> {
  const all = await rotinasStorage.getValue()
  if (!(jobId in all)) return
  const { [jobId]: _removed, ...rest } = all
  await rotinasStorage.setValue(rest)
}

/** All rotina metadata; `undefined` while loading. Subscribes before reading
 * so a save in another tab is not overwritten by a slower first read. */
export function useRotinaMetas(): Record<string, RotinaMeta> | undefined {
  const [value, setValue] = useState<Record<string, RotinaMeta>>()
  useEffect(() => {
    let changed = false
    const unwatch = rotinasStorage.watch((next) => {
      changed = true
      setValue(next)
    })
    rotinasStorage.getValue().then((initial) => {
      if (!changed) setValue(initial)
    })
    return unwatch
  }, [])
  return value
}
