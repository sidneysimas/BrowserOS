/**
 * @license
 * Copyright 2025 BrowserOS
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { useMemo } from 'react'
import { useNavigate, useParams } from 'react-router'
import type { RunStatus } from '@/lib/status'
import {
  type TaskDetail,
  type ToolDispatchRow,
  useTaskDetail,
} from '@/modules/api/audit.hooks'
import {
  type ReplayEvent,
  type ReplayFrame,
  type ReplayKind,
  type ReplayVerb,
  useReplayEvents,
  useReplayMetadata,
} from '@/modules/api/replay.hooks'
import {
  buildReplayEventTargets,
  buildReplayTargetIds,
  EMPTY_REPLAY_EVENTS,
  type ReplayEventTargets,
} from './replay-events'

export interface ReplayData {
  sessionId: string
  agentLabel: string
  taskTitle: string
  harness: string
  status: RunStatus
  site: string
  startedAt: string
  /**
   * Raw session start in ms since epoch. Used by `buildTabView` to
   * translate a frame's session-relative `t` into tab-relative time.
   * `startedAt` above is the formatted date string; this is the
   * machine-readable original.
   */
  startedAtMs: number
  duration: string
  /** Stat strip displayed in the header. Strings are presentation. */
  tokens: string
  steps: string
  /** Total seconds the session covers, from start to last dispatch. */
  totalSeconds: number
  frames: ReplayFrame[]
  targetIds: string[]
  eventsForTarget: (targetId: string) => readonly ReplayEvent[]
}

// `buildTabView` and the `TabView` shape live in `./tab-view.ts` so
// tests can import them without dragging the react-query-kit hook
// graph. Re-exported here for backward-compat with existing
// callers that reach it through this module.
export {
  buildTabView,
  EMPTY_TAB_VIEW,
  type TabView,
} from './tab-view'

export interface UseReplayDataResult {
  replay: ReplayData | null
  sessionId: string
  isLoading: boolean
  navigate: ReturnType<typeof useNavigate>
}

/** Loads task metadata and stable rrweb event buckets for the replay page. */
export function useReplayData(): UseReplayDataResult {
  const { sessionId = '' } = useParams<{ sessionId: string }>()
  const navigate = useNavigate()
  const taskQuery = useTaskDetail({
    variables: { sessionId },
    enabled: sessionId.length > 0,
  })
  const eventsQuery = useReplayEvents({
    variables: { sessionId },
    enabled: sessionId.length > 0,
  })
  const metadataQuery = useReplayMetadata({
    variables: { sessionId },
    enabled: sessionId.length > 0,
  })

  const events = eventsQuery.data?.events ?? EMPTY_REPLAY_EVENTS
  const eventTargets = useMemo(() => buildReplayEventTargets(events), [events])
  const targetIds = useMemo(
    () =>
      buildReplayTargetIds(metadataQuery.data?.targets, eventTargets.targetIds),
    [eventTargets.targetIds, metadataQuery.data?.targets],
  )
  const replay = useMemo<ReplayData | null>(() => {
    if (!taskQuery.data) return null
    return buildReplayData(taskQuery.data, eventTargets, targetIds)
  }, [taskQuery.data, eventTargets, targetIds])

  return {
    replay,
    sessionId,
    isLoading: taskQuery.isLoading,
    navigate,
  }
}

/** Converts task rows into replay metadata while reusing event buckets. */
function buildReplayData(
  task: TaskDetail,
  eventTargets: ReplayEventTargets,
  targetIds: string[],
): ReplayData {
  const sessionStartMs = task.startedAt
  const lastDispatchAt = task.dispatches.length
    ? task.dispatches[task.dispatches.length - 1].createdAt
    : sessionStartMs
  const totalMs = Math.max(
    1_000,
    (task.endedAt ?? lastDispatchAt) - sessionStartMs,
  )

  const frames: ReplayFrame[] = task.dispatches.map((row) =>
    mapDispatchToFrame(row, sessionStartMs),
  )

  return {
    sessionId: task.sessionId,
    agentLabel: task.agentLabel || task.slug,
    taskTitle: task.title,
    harness: task.startEvent?.clientName ?? 'unknown',
    status: mapTaskStatus(task.status),
    site: task.site ?? 'about:blank',
    startedAt: formatStartedAt(task.startedAt),
    startedAtMs: sessionStartMs,
    duration: formatDuration(totalMs),
    tokens: '-',
    steps: String(task.dispatchCount),
    totalSeconds: totalMs / 1000,
    frames,
    targetIds,
    eventsForTarget: eventTargets.eventsForTarget,
  }
}

const TOOL_TO_VERB: Record<string, ReplayVerb> = {
  tabs: 'navigate',
  navigate: 'navigate',
  windows: 'navigate',
  tab_groups: 'navigate',
  snapshot: 'read',
  read: 'read',
  grep: 'read',
  diff: 'read',
  screenshot: 'read',
  act: 'click',
  upload: 'attach',
  download: 'attach',
  pdf: 'read',
  wait: 'read',
  run: 'type',
  evaluate: 'type',
}

function mapDispatchToFrame(
  row: ToolDispatchRow,
  sessionStartMs: number,
): ReplayFrame {
  const t = Math.max(0, (row.createdAt - sessionStartMs) / 1000)
  const meta = row.resultMeta ? safeParse(row.resultMeta) : null
  const isError = meta?.isError === true
  const cancellationKind = meta?.cancellationKind
  const cancelled = cancellationKind === 'cockpit.operator-cancelled'
  const kind: ReplayKind = cancelled ? 'block' : isError ? 'block' : 'action'
  const note = cancelled ? 'Cancelled' : isError ? 'Errored' : undefined
  const node = row.title || row.url || row.toolName
  const verb = TOOL_TO_VERB[row.toolName] ?? 'read'
  const caption = buildCaption(row, verb, isError, cancelled)
  return {
    t,
    kind,
    verb,
    node,
    caption,
    url: row.url,
    pageId: row.pageId,
    targetId: row.targetId,
    note,
    dispatchId: row.id,
  }
}

function buildCaption(
  row: ToolDispatchRow,
  verb: ReplayVerb,
  isError: boolean,
  cancelled: boolean,
): string {
  if (cancelled) return `${row.toolName}: cancelled by operator`
  if (isError) return `${row.toolName}: errored`
  if (verb === 'navigate' && row.url) return `Navigate to ${row.url}`
  if (row.title) return `${row.toolName}: ${row.title}`
  return row.toolName
}

function safeParse(json: string): Record<string, unknown> | null {
  try {
    return JSON.parse(json) as Record<string, unknown>
  } catch {
    return null
  }
}

function mapTaskStatus(status: TaskDetail['status']): RunStatus {
  if (status === 'live') return 'running'
  if (status === 'failed') return 'blocked'
  return 'done'
}

function formatStartedAt(ms: number): string {
  const d = new Date(ms)
  return d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function formatDuration(ms: number): string {
  const total = Math.floor(ms / 1000)
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${String(s).padStart(2, '0')}`
}
