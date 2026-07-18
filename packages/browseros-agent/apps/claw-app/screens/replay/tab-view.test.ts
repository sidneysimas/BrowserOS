/**
 * @license
 * Copyright 2026 BrowserOS
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Pure unit tests for `buildTabView`. Lives in `tab-view.ts` (not
 * `replay.data.ts`) so bun test does not import the react-query-kit
 * hook graph, which sibling tests `mock.module`-poison globally.
 */

import { describe, expect, it } from 'bun:test'
import type { ReplayEvent, ReplayFrame } from '@/modules/api/replay.hooks'
import { buildReplayEventTargets, buildReplayTargetIds } from './replay-events'
import {
  type BuildTabViewInput,
  buildTabView,
  targetSeekForFrame,
} from './tab-view'

function frame(
  t: number,
  targetId: string | null,
  extra: Partial<ReplayFrame> = {},
): ReplayFrame {
  return {
    t,
    kind: 'action',
    verb: 'read',
    node: 'test',
    caption: 'test',
    targetId,
    ...extra,
  }
}

function event(ts: number, targetId: string): ReplayEvent {
  return { sessionId: 'test', targetId, tabId: 1, type: 3, data: {}, ts }
}

function makeInput(
  overrides: Partial<BuildTabViewInput> = {},
): BuildTabViewInput {
  return {
    frames: [],
    eventsForTarget: () => [],
    startedAtMs: 1_000_000,
    ...overrides,
  }
}

describe('buildTabView', () => {
  it('returns EMPTY for a null targetId', () => {
    const v = buildTabView(makeInput(), null)
    expect(v.frames).toEqual([])
    expect(v.events).toEqual([])
    expect(v.totalSeconds).toBe(0)
  })

  it('returns EMPTY when the tab has no frames AND no events', () => {
    const v = buildTabView(makeInput({ frames: [frame(5, 'target-a')] }), 'x')
    expect(v.frames).toEqual([])
    expect(v.events).toEqual([])
    expect(v.totalSeconds).toBe(0)
  })

  it('filters frames to only the target tab', () => {
    const v = buildTabView(
      makeInput({
        frames: [
          frame(1, 'target-a'),
          frame(2, 'target-b'),
          frame(3, 'target-a'),
          frame(4, 'target-c'),
        ],
      }),
      'target-a',
    )
    expect(v.frames).toHaveLength(2)
    expect(v.frames.map((f) => f.targetId)).toEqual(['target-a', 'target-a'])
  })

  it('shifts frame `t` to be tab-relative (first frame at t=0)', () => {
    const v = buildTabView(
      makeInput({
        frames: [
          frame(5, 'target-a'),
          frame(8, 'target-a'),
          frame(12, 'target-a'),
        ],
        eventsForTarget: () => [
          event(1_005_000, 'target-a'),
          event(1_012_000, 'target-a'),
        ],
      }),
      'target-a',
    )
    expect(v.frames.map((f) => f.t)).toEqual([0, 3, 7])
  })

  it('totalSeconds = tab activity window (last event - first event)', () => {
    const v = buildTabView(
      makeInput({
        frames: [frame(3, 'target-a'), frame(6, 'target-a')],
        eventsForTarget: () => [
          event(1_003_000, 'target-a'),
          event(1_007_500, 'target-a'),
        ],
      }),
      'target-a',
    )
    expect(v.totalSeconds).toBeCloseTo(4.5)
  })

  it('falls back to frame timespan when no events exist', () => {
    const v = buildTabView(
      makeInput({
        frames: [frame(2, 'target-a'), frame(10, 'target-a')],
        eventsForTarget: () => [],
      }),
      'target-a',
    )
    expect(v.totalSeconds).toBe(8)
    expect(v.frames.map((f) => f.t)).toEqual([0, 8])
  })

  it('preserves other frame fields when shifting `t`', () => {
    const v = buildTabView(
      makeInput({
        frames: [
          frame(5, 'target-a', {
            verb: 'navigate',
            url: 'https://example.com',
          }),
        ],
      }),
      'target-a',
    )
    expect(v.frames[0]?.verb).toBe('navigate')
    expect(v.frames[0]?.url).toBe('https://example.com')
    expect(v.frames[0]?.targetId).toBe('target-a')
    expect(v.frames[0]?.t).toBe(0)
  })

  it('keeps a tab events array stable across task-only data changes', () => {
    const eventTargets = buildReplayEventTargets([
      event(1_002_000, 'target-a'),
      event(1_003_000, 'target-a'),
      event(1_004_000, 'target-b'),
    ])
    const first = buildTabView(
      makeInput({
        frames: [frame(2, 'target-a')],
        eventsForTarget: eventTargets.eventsForTarget,
      }),
      'target-a',
    )
    const afterTaskPoll = buildTabView(
      makeInput({
        frames: [frame(2, 'target-a'), frame(4, 'target-a')],
        eventsForTarget: eventTargets.eventsForTarget,
      }),
      'target-a',
    )

    expect(afterTaskPoll.events).toBe(first.events)
    expect(afterTaskPoll.frames).not.toBe(first.frames)
  })
})

describe('buildReplayTargetIds', () => {
  it('sorts metadata targets by first event time', () => {
    expect(
      buildReplayTargetIds(
        [
          {
            targetId: 'target-later',
            tabId: 2,
            firstEventAt: 4_000,
            lastEventAt: 5_000,
          },
          {
            targetId: 'target-first',
            tabId: 1,
            firstEventAt: 1_000,
            lastEventAt: 3_000,
          },
        ],
        ['stream-only'],
      ),
    ).toEqual(['target-first', 'target-later'])
  })

  it('falls back to first-seen stream targets before metadata loads', () => {
    expect(buildReplayTargetIds(undefined, ['target-b', 'target-a'])).toEqual([
      'target-b',
      'target-a',
    ])
  })
})

describe('targetSeekForFrame', () => {
  it('switches to the frame target and returns its target-relative time', () => {
    const targetFrame = frame(12, 'target-b', { dispatchId: 22 })
    const input = makeInput({
      frames: [frame(1, 'target-a'), targetFrame],
      eventsForTarget: (targetId) =>
        targetId === 'target-b'
          ? [event(1_010_000, targetId), event(1_015_000, targetId)]
          : [event(1_001_000, targetId), event(1_005_000, targetId)],
    })

    expect(targetSeekForFrame(input, 'target-a', targetFrame)).toEqual({
      targetId: 'target-b',
      seconds: 2,
    })
  })

  it('translates an unaddressed session frame into the selected target clock', () => {
    const sessionFrame = frame(7, null, { dispatchId: 23 })
    const input = makeInput({
      frames: [frame(5, 'target-a'), sessionFrame],
      eventsForTarget: (targetId) => [
        event(1_005_000, targetId),
        event(1_010_000, targetId),
      ],
    })

    expect(targetSeekForFrame(input, 'target-a', sessionFrame)).toEqual({
      targetId: 'target-a',
      seconds: 2,
    })
  })
})
