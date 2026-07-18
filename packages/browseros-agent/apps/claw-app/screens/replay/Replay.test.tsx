import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test'
import { parseHTML } from 'linkedom'
import { act, createContext, type ReactNode, useContext } from 'react'
import type { Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router'
import type {
  ReplayEvent,
  ReplayFrame,
  ReplayMetadata,
} from '@/modules/api/replay.hooks'
import * as replayDataModule from './replay.data'
import { buildReplayEventTargets, buildReplayTargetIds } from './replay-events'

let replayResult: replayDataModule.UseReplayDataResult

mock.module('./replay.data', () => ({
  ...replayDataModule,
  useReplayData: () => replayResult,
}))

mock.module('./ReplayViewport', () => ({
  ReplayViewport: ({ events }: { events: readonly ReplayEvent[] }) => (
    <div
      data-player-targets={events.map((event) => event.targetId).join(',')}
    />
  ),
}))

mock.module('./PlaybackTransport', () => ({
  PlaybackTransport: ({
    playback,
  }: {
    playback: { time: number; isPlaying: boolean }
  }) => (
    <div
      data-playback-time={playback.time}
      data-playback-playing={playback.isPlaying}
    />
  ),
}))

mock.module('./EventTimeline', () => ({
  EventTimeline: ({
    frames,
    onSelectFrame,
  }: {
    frames: readonly ReplayFrame[]
    onSelectFrame: (frame: ReplayFrame) => void
  }) => (
    <div>
      {frames.map((frame) => (
        <button
          type="button"
          key={frame.dispatchId}
          data-frame-target={frame.targetId}
          onClick={() => onSelectFrame(frame)}
        >
          {frame.caption}
        </button>
      ))}
    </div>
  ),
}))

const TargetSelectContext = createContext<(targetId: string) => void>(() => {})

mock.module('@/components/ui/tabs', () => ({
  Tabs: ({
    value,
    onValueChange,
    children,
  }: {
    value: string
    onValueChange: (targetId: string) => void
    children: ReactNode
  }) => (
    <TargetSelectContext.Provider value={onValueChange}>
      <div data-selected-target={value}>{children}</div>
    </TargetSelectContext.Provider>
  ),
  TabsList: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  TabsTrigger: ({
    value,
    children,
  }: {
    value: string
    children: ReactNode
  }) => {
    const selectTarget = useContext(TargetSelectContext)
    return (
      <button
        type="button"
        data-target-chip={value}
        onClick={() => selectTarget(value)}
      >
        {children}
      </button>
    )
  },
}))

const metadata: ReplayMetadata = {
  exists: true,
  firstEventAt: 1_000,
  lastEventAt: 15_000,
  sizeBytes: 1_024,
  targets: [
    {
      targetId: 'target-b',
      tabId: 2,
      firstEventAt: 10_000,
      lastEventAt: 15_000,
    },
    {
      targetId: 'target-a',
      tabId: 1,
      firstEventAt: 1_000,
      lastEventAt: 5_000,
    },
  ],
}

const events: ReplayEvent[] = [
  {
    sessionId: 'session-1',
    targetId: 'target-a',
    tabId: 1,
    ts: 1_000,
    type: 4,
    data: { width: 1280, height: 720 },
  },
  {
    sessionId: 'session-1',
    targetId: 'target-a',
    tabId: 1,
    ts: 5_000,
    type: 3,
    data: {},
  },
  {
    sessionId: 'session-1',
    targetId: 'target-b',
    tabId: 2,
    ts: 10_000,
    type: 4,
    data: { width: 1280, height: 720 },
  },
  {
    sessionId: 'session-1',
    targetId: 'target-b',
    tabId: 2,
    ts: 15_000,
    type: 3,
    data: {},
  },
]

const frames: ReplayFrame[] = [
  {
    t: 1,
    kind: 'action',
    verb: 'read',
    node: 'A',
    caption: 'Read target A',
    targetId: 'target-a',
    dispatchId: 1,
  },
  {
    t: 12,
    kind: 'action',
    verb: 'click',
    node: 'B',
    caption: 'Click target B',
    targetId: 'target-b',
    dispatchId: 2,
  },
]

function replayData(
  replayEvents: readonly ReplayEvent[],
  replayMetadata = metadata,
) {
  const eventTargets = buildReplayEventTargets(replayEvents)
  return {
    sessionId: 'session-1',
    agentLabel: 'Codex',
    taskTitle: 'Replay test',
    harness: 'Codex',
    status: 'done' as const,
    site: 'example.com',
    startedAt: 'Jul 18, 2026',
    startedAtMs: 0,
    duration: '0:15',
    tokens: '-',
    steps: '2',
    totalSeconds: 15,
    frames,
    targetIds: buildReplayTargetIds(
      replayMetadata.targets,
      eventTargets.targetIds,
    ),
    eventsForTarget: eventTargets.eventsForTarget,
  }
}

const globalDescriptors = new Map(
  ['window', 'document', 'navigator', 'HTMLElement', 'Node', 'Event'].map(
    (name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)],
  ),
)

let root: Root
let container: HTMLElement

beforeEach(async () => {
  const dom = parseHTML(
    '<!doctype html><html><body><div id="root"></div></body></html>',
  )
  const globals = {
    window: dom.window,
    document: dom.document,
    navigator: dom.window.navigator,
    HTMLElement: dom.window.HTMLElement,
    Node: dom.window.Node,
    Event: dom.window.Event,
  }
  for (const [name, value] of Object.entries(globals)) {
    Object.defineProperty(globalThis, name, {
      configurable: true,
      writable: true,
      value,
    })
  }
  Object.assign(dom.window, {
    requestAnimationFrame: () => 1,
    cancelAnimationFrame: () => undefined,
  })
  Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', {
    configurable: true,
    writable: true,
    value: true,
  })

  replayResult = {
    replay: replayData([]),
    sessionId: 'session-1',
    isLoading: false,
    navigate: mock(() => undefined) as never,
  }
  container = dom.document.getElementById('root') as unknown as HTMLElement
  const { createRoot } = await import('react-dom/client')
  root = createRoot(container)
})

afterEach(async () => {
  await act(async () => root.unmount())
  for (const [name, descriptor] of globalDescriptors) {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor)
    else Reflect.deleteProperty(globalThis, name)
  }
  Reflect.deleteProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT')
})

describe('Replay', () => {
  it('renders metadata targets before events and switches target on frame click', async () => {
    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={['/audit/session-1/replay']}>
          <Replay />
        </MemoryRouter>,
      )
    })

    expect(
      [...container.querySelectorAll('[data-target-chip]')].map(
        (chip) => chip.textContent,
      ),
    ).toEqual(['Tab 1', 'Tab 2'])
    expect(
      container
        .querySelector('[data-player-targets]')
        ?.getAttribute('data-player-targets'),
    ).toBe('')

    replayResult = { ...replayResult, replay: replayData(events) }
    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={['/audit/session-1/replay']}>
          <Replay />
        </MemoryRouter>,
      )
    })

    expect(
      container
        .querySelector('[data-player-targets]')
        ?.getAttribute('data-player-targets'),
    ).toBe('target-a,target-a')
    expect(
      container
        .querySelector('[data-playback-playing]')
        ?.getAttribute('data-playback-playing'),
    ).toBe('true')

    const targetBFrame = container.querySelector(
      '[data-frame-target="target-b"]',
    )
    if (!targetBFrame) throw new Error('target B frame missing')
    await act(async () => {
      targetBFrame.dispatchEvent(new window.Event('click', { bubbles: true }))
    })

    expect(
      container
        .querySelector('[data-selected-target]')
        ?.getAttribute('data-selected-target'),
    ).toBe('target-b')
    expect(
      container
        .querySelector('[data-player-targets]')
        ?.getAttribute('data-player-targets'),
    ).toBe('target-b,target-b')
    expect(
      container
        .querySelector('[data-playback-time]')
        ?.getAttribute('data-playback-time'),
    ).toBe('2')

    replayResult = {
      ...replayResult,
      replay: replayData(events, {
        exists: true,
        firstEventAt: 1_000,
        lastEventAt: 5_000,
        sizeBytes: 512,
        targets: [
          {
            targetId: 'target-a',
            tabId: 1,
            firstEventAt: 1_000,
            lastEventAt: 5_000,
          },
        ],
      }),
    }
    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={['/audit/session-1/replay']}>
          <Replay />
        </MemoryRouter>,
      )
    })

    expect(
      container
        .querySelector('[data-player-targets]')
        ?.getAttribute('data-player-targets'),
    ).toBe('target-a,target-a')
    expect(
      container
        .querySelector('[data-playback-time]')
        ?.getAttribute('data-playback-time'),
    ).toBe('0')
  })
})

const { Replay } = await import('./Replay')
