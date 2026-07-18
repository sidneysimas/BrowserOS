/**
 * @license
 * Copyright 2026 BrowserOS
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import type {
  ReplayEvent,
  ReplayTargetMetadata,
} from '@/modules/api/replay.hooks'

export const EMPTY_REPLAY_EVENTS: readonly ReplayEvent[] = []

export interface ReplayEventTargets {
  targetIds: string[]
  eventsForTarget: (targetId: string) => readonly ReplayEvent[]
}

/** Groups rrweb events by target while preserving each target array's identity. */
export function buildReplayEventTargets(
  events: readonly ReplayEvent[],
): ReplayEventTargets {
  if (events.length === 0) {
    return {
      targetIds: [],
      eventsForTarget: () => EMPTY_REPLAY_EVENTS,
    }
  }

  const targetIds: string[] = []
  const eventsByTarget = new Map<string, ReplayEvent[]>()
  for (const event of events) {
    const list = eventsByTarget.get(event.targetId)
    if (list) {
      list.push(event)
    } else {
      eventsByTarget.set(event.targetId, [event])
      targetIds.push(event.targetId)
    }
  }

  return {
    targetIds,
    eventsForTarget: (targetId) =>
      eventsByTarget.get(targetId) ?? EMPTY_REPLAY_EVENTS,
  }
}

/** Returns metadata-ordered targets, falling back to stream discovery. */
export function buildReplayTargetIds(
  targets: readonly ReplayTargetMetadata[] | undefined,
  discoveredTargetIds: readonly string[],
): string[] {
  if (!targets) return [...discoveredTargetIds]
  return [...targets]
    .sort((a, b) => a.firstEventAt - b.firstEventAt)
    .map((target) => target.targetId)
}
