import { describe, expect, it } from 'bun:test'
import { createRecordingsRelay } from './recordings-relay'

const serverBaseUrl = 'http://127.0.0.1:9511'

describe('createRecordingsRelay', () => {
  it('health-gates and posts a batch to the sender tab path', async () => {
    const requests: Array<{ url: string; init?: RequestInit }> = []
    const relay = createRecordingsRelay({
      resolveServerBaseUrl: async () => serverBaseUrl,
      fetch: async (input, init) => {
        const url = String(input)
        requests.push({ url, init })
        return url.endsWith('/health')
          ? Response.json({ ok: true })
          : Response.json({ ok: true, accepted: 1 })
      },
    })

    await relay.post(42, '{"ts":1,"type":3,"data":{}}')

    expect(requests.map(({ url }) => url)).toEqual([
      `${serverBaseUrl}/recordings/health`,
      `${serverBaseUrl}/recordings/tabs/42/events`,
    ])
    expect(requests[1].init).toMatchObject({
      method: 'POST',
      headers: { 'content-type': 'application/x-ndjson' },
      body: '{"ts":1,"type":3,"data":{}}',
      credentials: 'omit',
    })
  })

  it('drops batches quietly while an unhealthy probe is cached', async () => {
    const requests: string[] = []
    let now = 0
    const warnings: unknown[][] = []
    const relay = createRecordingsRelay({
      resolveServerBaseUrl: async () => serverBaseUrl,
      fetch: async (input) => {
        requests.push(String(input))
        return new Response('{}', { status: 404 })
      },
      now: () => now,
      warn: (...args) => warnings.push(args),
    })

    await relay.post(1, 'first')
    await relay.post(1, 'second')
    expect(requests).toEqual([`${serverBaseUrl}/recordings/health`])
    expect(warnings).toEqual([])

    now = 60_000
    await relay.post(1, 'third')
    expect(requests).toEqual([
      `${serverBaseUrl}/recordings/health`,
      `${serverBaseUrl}/recordings/health`,
    ])
  })

  it('re-probes on the next batch after a failed post', async () => {
    const requests: string[] = []
    const warnings: unknown[][] = []
    let now = 0
    const relay = createRecordingsRelay({
      resolveServerBaseUrl: async () => serverBaseUrl,
      fetch: async (input) => {
        const url = String(input)
        requests.push(url)
        return url.endsWith('/health')
          ? Response.json({ ok: true })
          : new Response('{}', { status: 503 })
      },
      now: () => now,
      warn: (...args) => warnings.push(args),
    })

    await relay.post(7, 'first')
    await relay.post(7, 'second')

    expect(requests).toEqual([
      `${serverBaseUrl}/recordings/health`,
      `${serverBaseUrl}/recordings/tabs/7/events`,
      `${serverBaseUrl}/recordings/health`,
      `${serverBaseUrl}/recordings/tabs/7/events`,
    ])
    expect(warnings).toHaveLength(1)

    now = 60_000
    await relay.post(7, 'third')
    expect(warnings).toHaveLength(2)
  })

  it('rearms the warning after event ingestion recovers', async () => {
    const warnings: unknown[][] = []
    let eventPosts = 0
    const relay = createRecordingsRelay({
      resolveServerBaseUrl: async () => serverBaseUrl,
      fetch: async (input) => {
        const url = String(input)
        if (url.endsWith('/health')) return Response.json({ ok: true })
        eventPosts++
        return eventPosts === 2
          ? Response.json({ ok: true, accepted: 1 })
          : new Response('{}', { status: 503 })
      },
      now: () => 0,
      warn: (...args) => warnings.push(args),
    })

    await relay.post(7, 'failed')
    await relay.post(7, 'recovered')
    await relay.post(7, 'failed-again')

    expect(warnings).toHaveLength(2)
  })
})
