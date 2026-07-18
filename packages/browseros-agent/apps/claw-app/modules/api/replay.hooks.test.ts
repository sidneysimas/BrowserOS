import { afterEach, describe, expect, it, mock } from 'bun:test'
import * as client from './client'

mock.module('./client', () => ({
  ...client,
  resolveApiBaseUrl: async () => 'http://127.0.0.1:9200',
}))

const { fetchReplayEvents, fetchReplayMetadata } = await import(
  './replay.hooks'
)

const originalFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = originalFetch
})

describe('replay queries', () => {
  it('fetches replay metadata from the plural meta endpoint', async () => {
    const metadata = {
      exists: true,
      firstEventAt: 1_000,
      lastEventAt: 4_000,
      sizeBytes: 512,
      targets: [
        {
          targetId: 'target-a',
          tabId: 7,
          firstEventAt: 1_000,
          lastEventAt: 4_000,
        },
      ],
    }
    const request = mock(async () => Response.json(metadata))
    globalThis.fetch = request as unknown as typeof fetch

    await expect(
      fetchReplayMetadata({ sessionId: 'session/with slash' }),
    ).resolves.toEqual(metadata)
    expect(request).toHaveBeenCalledWith(
      'http://127.0.0.1:9200/audit/replays/session%2Fwith%20slash/meta',
    )
  })

  it('preserves the empty metadata shape when no replay exists', async () => {
    const metadata = { exists: false, sizeBytes: 0, targets: [] }
    globalThis.fetch = mock(async () =>
      Response.json(metadata),
    ) as unknown as typeof fetch

    await expect(
      fetchReplayMetadata({ sessionId: 'session-1' }),
    ).resolves.toEqual(metadata)
  })

  it('parses valid replay lines and skips malformed lines', async () => {
    const body = [
      JSON.stringify({
        sessionId: 'session-1',
        targetId: 'target-b',
        tabId: 9,
        ts: 2_000,
        type: 4,
        data: { width: 1280, height: 720 },
      }),
      '{not-json',
      JSON.stringify({
        sessionId: 'session-1',
        tabId: 9,
        ts: 2_500,
        type: 3,
        data: {},
      }),
      JSON.stringify({
        sessionId: 'session-1',
        targetId: 'target-a',
        tabId: 3,
        ts: 3_000,
        type: 2,
        data: {},
      }),
    ].join('\n')
    const request = mock(async () => new Response(body))
    globalThis.fetch = request as unknown as typeof fetch

    await expect(
      fetchReplayEvents({ sessionId: 'session-1' }),
    ).resolves.toEqual({
      events: [
        {
          sessionId: 'session-1',
          targetId: 'target-b',
          tabId: 9,
          ts: 2_000,
          type: 4,
          data: { width: 1280, height: 720 },
        },
        {
          sessionId: 'session-1',
          targetId: 'target-a',
          tabId: 3,
          ts: 3_000,
          type: 2,
          data: {},
        },
      ],
      targetIds: ['target-b', 'target-a'],
    })
    expect(request).toHaveBeenCalledWith(
      'http://127.0.0.1:9200/audit/replays/session-1',
    )
  })
})
