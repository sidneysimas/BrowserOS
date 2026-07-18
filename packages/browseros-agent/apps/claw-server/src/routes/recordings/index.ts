/**
 * @license
 * Copyright 2025 BrowserOS
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { Hono } from 'hono'
import { logger } from '../../lib/logger'
import { getTabTargetMap } from '../../lib/tab-targets'
import {
  type RecordingEventInput,
  type RecordingStore,
  recordingStore,
} from '../../services/recordings'

const MAX_BODY_BYTES = 8 * 1024 * 1024

interface RecordingsRouteDeps {
  tabTargets: {
    targetForTab(tabId: number): Promise<string | undefined>
  }
  recordingStore: Pick<RecordingStore, 'appendBatch'>
}

/** Creates the record-everything health and tab ingest HTTP surface. */
export function createRecordingsRoute(deps: RecordingsRouteDeps) {
  return new Hono()
    .get('/recordings/health', (c) => c.json({ ok: true }))
    .post('/recordings/tabs/:tabId/events', async (c) => {
      const body = await readBodyWithinLimit(c.req.raw, MAX_BODY_BYTES)
      if (body === null) return c.body(null, 413)

      // The relay knows the sender's Chrome tab id; the server resolves the
      // stable target so recorder payloads never choose their storage key.
      const tabIdParam = c.req.param('tabId')
      const tabId = /^\d+$/.test(tabIdParam) ? Number(tabIdParam) : Number.NaN
      const targetId = Number.isSafeInteger(tabId)
        ? await deps.tabTargets.targetForTab(tabId)
        : undefined
      if (!targetId) {
        return c.json({ ok: false, reason: 'unknown tab', accepted: 0 })
      }

      const events = parseEvents(body)
      if (events.length === 0) return c.json({ ok: true, accepted: 0 })
      // Batch ids are target-scoped retry tokens. A missing header preserves
      // the append-only behavior of older or independent ingest clients.
      const batchId = c.req.raw.headers.get('x-recording-batch-id') ?? undefined
      try {
        const appended = await deps.recordingStore.appendBatch(
          targetId,
          tabId,
          events,
          batchId,
        )
        if (!appended) return c.json({ ok: true, accepted: 0 })
      } catch (error) {
        logger.warn('recording batch append failed', {
          tabId,
          targetId,
          error: error instanceof Error ? error.message : String(error),
        })
        return c.json({ ok: false, reason: 'append failed', accepted: 0 }, 500)
      }
      return c.json({ ok: true, accepted: events.length })
    })
}

/** Keeps recorder data only; identity comes from route context and server claim state. */
function parseEvents(body: string): RecordingEventInput[] {
  const events: RecordingEventInput[] = []
  for (const line of body.split('\n')) {
    if (!line.trim()) continue
    try {
      const event = JSON.parse(line) as Record<string, unknown>
      if (typeof event.ts !== 'number' || !Number.isFinite(event.ts)) continue
      events.push({ ts: event.ts, type: event.type, data: event.data })
    } catch {}
  }
  return events
}

async function readBodyWithinLimit(
  request: Request,
  limit: number,
): Promise<string | null> {
  const declaredLength = Number(request.headers.get('content-length'))
  if (Number.isFinite(declaredLength) && declaredLength > limit) return null
  if (!request.body) return ''

  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > limit) {
      await reader.cancel()
      return null
    }
    chunks.push(value)
  }
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return new TextDecoder().decode(bytes)
}

export const recordingsRoute = createRecordingsRoute({
  tabTargets: {
    targetForTab: async (tabId) =>
      (await getTabTargetMap()?.targetForTab(tabId)) ?? undefined,
  },
  recordingStore,
})
