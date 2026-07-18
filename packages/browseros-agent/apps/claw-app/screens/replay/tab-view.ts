/**
 * @license
 * Copyright 2026 BrowserOS
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import type { ReplayEvent, ReplayFrame } from '@/modules/api/replay.hooks'

/**
 * A single tab's replay view. All fields are scoped to one
 * target:
 *   - `frames`: filtered AND time-shifted so `t=0` is the tab's
 *     first activity, not session start.
 *   - `events`: pass-through. rrweb treats the first event's `ts`
 *     as the tab-relative playback origin.
 *   - `totalSeconds`: duration of this tab's activity window (from
 *     first event to last event). 0 for empty tabs.
 */
export interface TabView {
  frames: ReplayFrame[]
  events: readonly ReplayEvent[]
  totalSeconds: number
}

export const EMPTY_TAB_VIEW: TabView = {
  frames: [],
  events: [],
  totalSeconds: 0,
}

export interface BuildTabViewInput {
  frames: ReplayFrame[]
  eventsForTarget: (targetId: string) => readonly ReplayEvent[]
  startedAtMs: number
}

/** Builds the frame/event/duration view for the selected replay tab. */
export function buildTabView(
  input: BuildTabViewInput,
  targetId: string | null,
): TabView {
  if (targetId === null) return EMPTY_TAB_VIEW
  const rawFrames = input.frames.filter((frame) => frame.targetId === targetId)
  const events = input.eventsForTarget(targetId)
  if (rawFrames.length === 0 && events.length === 0) return EMPTY_TAB_VIEW
  const startedMs = input.startedAtMs
  const originMs =
    events.length > 0
      ? events[0]?.ts
      : startedMs + (rawFrames[0]?.t ?? 0) * 1000
  const endMs =
    events.length > 0
      ? events[events.length - 1]?.ts
      : startedMs + (rawFrames[rawFrames.length - 1]?.t ?? 0) * 1000
  const totalSeconds = Math.max(0, (endMs - originMs) / 1000)
  const originT = (originMs - startedMs) / 1000
  const frames = rawFrames.map((f) => ({
    ...f,
    t: Math.max(0, f.t - originT),
  }))
  return { frames, events, totalSeconds }
}

export interface TargetSeek {
  targetId: string | null
  seconds: number
}

/** Resolves a session frame to its target and target-relative playback time. */
export function targetSeekForFrame(
  input: BuildTabViewInput,
  selectedTargetId: string | null,
  frame: ReplayFrame,
): TargetSeek {
  const targetId = frame.targetId ?? selectedTargetId
  if (targetId === null) return { targetId, seconds: frame.t }

  const targetFrames = input.frames.filter(
    (candidate) => candidate.targetId === targetId,
  )
  if (frame.targetId == null) {
    const targetEvents = input.eventsForTarget(targetId)
    const originT =
      targetEvents.length > 0
        ? ((targetEvents[0]?.ts ?? input.startedAtMs) - input.startedAtMs) /
          1000
        : (targetFrames[0]?.t ?? 0)
    return { targetId, seconds: Math.max(0, frame.t - originT) }
  }
  const targetFrameIndex = targetFrames.indexOf(frame)
  const targetView = buildTabView(input, targetId)
  const shiftedFrame = targetView.frames[targetFrameIndex]
  return { targetId, seconds: shiftedFrame?.t ?? frame.t }
}
