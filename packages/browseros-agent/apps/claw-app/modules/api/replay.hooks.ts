/**
 * @license
 * Copyright 2025 BrowserOS
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Session-replay API surface for the claw-app cockpit.
 */

import { createQuery } from 'react-query-kit'
import { resolveApiBaseUrl } from './client'
import { parseResponse } from './parseResponse'

export type ReplayVerb =
  | 'navigate'
  | 'read'
  | 'click'
  | 'type'
  | 'attach'
  | 'submit'
  | 'done'

export type ReplayKind = 'action' | 'block' | 'done'

export interface ReplayFrame {
  /** Seconds into the session. */
  t: number
  kind: ReplayKind
  verb: ReplayVerb
  /** Short node label, e.g. the page title or a focused element. */
  node: string
  /** Caption sentence rendered in the viewport overlay + timeline row. */
  caption: string
  /**
   * Full URL captured on this dispatch's audit row, when the tool
   * targeted a page. Populates the replay viewport's browser-chrome
   * address bar so the operator can see the exact URL the agent
   * was on at this instant. Null for tools that do not target a
   * page (`run`, `windows`, `tab_groups`, `tabs new` before the
   * result comes back).
   */
  url?: string | null
  pageId?: number | null
  /** Stable CDP target this frame belongs to, when known. */
  targetId?: string | null
  /** Optional badge shown on the timeline row ("Blocked", "Cancelled"). */
  note?: string
  /** Source dispatch id so the replay surface can deep-link. */
  dispatchId?: number
}

export interface ReplayEvent {
  sessionId: string
  targetId: string
  tabId: number
  type: number
  data: unknown
  ts: number
}

export interface ReplayTargetMetadata {
  targetId: string
  tabId: number
  firstEventAt: number
  lastEventAt: number
}

export interface ReplayMetadata {
  exists: boolean
  sizeBytes: number
  firstEventAt?: number
  lastEventAt?: number
  targets: ReplayTargetMetadata[]
}

export interface UseReplayMetadataVariables {
  sessionId: string
}

/** Fetches the replay target index used by the CTA and tab picker. */
export async function fetchReplayMetadata({
  sessionId,
}: UseReplayMetadataVariables): Promise<ReplayMetadata> {
  const baseUrl = await resolveApiBaseUrl()
  const res = await fetch(
    `${baseUrl}/audit/replays/${encodeURIComponent(sessionId)}/meta`,
  )
  return parseResponse<ReplayMetadata>(res)
}

export const useReplayMetadata = createQuery<
  ReplayMetadata,
  UseReplayMetadataVariables
>({
  queryKey: ['replay', 'metadata'],
  fetcher: fetchReplayMetadata,
  refetchInterval: 10_000,
})

export interface UseReplayEventsVariables {
  sessionId: string
}

export interface ReplayEventsBundle {
  events: ReplayEvent[]
  targetIds: string[]
}

function isReplayEvent(value: unknown): value is ReplayEvent {
  if (!value || typeof value !== 'object') return false
  const event = value as Partial<ReplayEvent>
  return (
    typeof event.sessionId === 'string' &&
    typeof event.targetId === 'string' &&
    typeof event.tabId === 'number' &&
    typeof event.ts === 'number' &&
    typeof event.type === 'number'
  )
}

/** Fetches and parses one session's target-addressed NDJSON stream. */
export async function fetchReplayEvents({
  sessionId,
}: UseReplayEventsVariables): Promise<ReplayEventsBundle> {
  const baseUrl = await resolveApiBaseUrl()
  const res = await fetch(
    `${baseUrl}/audit/replays/${encodeURIComponent(sessionId)}`,
  )
  if (!res.ok) {
    if (res.status === 404) return { events: [], targetIds: [] }
    return parseResponse<ReplayEventsBundle>(res)
  }

  const events: ReplayEvent[] = []
  const targetIds: string[] = []
  const seenTargets = new Set<string>()
  for (const line of (await res.text()).split('\n')) {
    if (line.length === 0) continue
    try {
      const event: unknown = JSON.parse(line)
      if (!isReplayEvent(event)) continue
      events.push(event)
      if (!seenTargets.has(event.targetId)) {
        seenTargets.add(event.targetId)
        targetIds.push(event.targetId)
      }
    } catch {}
  }
  return { events, targetIds }
}

export const useReplayEvents = createQuery<
  ReplayEventsBundle,
  UseReplayEventsVariables
>({
  queryKey: ['replay', 'events'],
  fetcher: fetchReplayEvents,
  staleTime: Number.POSITIVE_INFINITY,
})
