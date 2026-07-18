import { describe, expect, it } from 'bun:test'
import {
  createRecorderBuffer,
  installRecorderFlushListeners,
} from './recorder-buffer'

function rrwebEvent(timestamp: number) {
  return { timestamp, type: 3, data: { source: timestamp } }
}

describe('createRecorderBuffer', () => {
  it('flushes at 50 events with only the recorder event fields', () => {
    const batches: string[] = []
    const buffer = createRecorderBuffer({
      send: (ndjson) => batches.push(ndjson),
      queueMicrotask: (callback) => callback(),
      setTimeout: () => 1,
    })

    for (let timestamp = 1; timestamp <= 50; timestamp++) {
      buffer.emit(rrwebEvent(timestamp))
    }

    expect(batches).toHaveLength(1)
    const lines = batches[0].split('\n').map((line) => JSON.parse(line))
    expect(lines).toHaveLength(50)
    expect(lines[0]).toEqual({ ts: 1, type: 3, data: { source: 1 } })
    expect(Object.keys(lines[0])).toEqual(['ts', 'type', 'data'])
  })

  it('flushes a partial batch when the timer fires', () => {
    const batches: string[] = []
    let timerCallback: (() => void) | undefined
    let timerDelay: number | undefined
    const buffer = createRecorderBuffer({
      send: (ndjson) => batches.push(ndjson),
      queueMicrotask: (callback) => callback(),
      setTimeout: (callback, delay) => {
        timerCallback = callback
        timerDelay = delay
        return 1
      },
    })

    buffer.emit(rrwebEvent(1))
    expect(batches).toEqual([])
    expect(timerDelay).toBe(2_500)

    timerCallback?.()
    expect(batches).toHaveLength(1)
  })

  it('drops the oldest events at the buffer cap and reports the count', () => {
    const batches: string[] = []
    const warnings: number[] = []
    const buffer = createRecorderBuffer({
      send: (ndjson) => batches.push(ndjson),
      warnDropped: (count) => warnings.push(count),
      queueMicrotask: (callback) => callback(),
      setTimeout: () => 1,
      bufferCap: 2,
      flushAtSize: 10,
    })

    buffer.emit(rrwebEvent(1))
    buffer.emit(rrwebEvent(2))
    buffer.emit(rrwebEvent(3))
    buffer.flushNow()

    expect(warnings).toEqual([1])
    expect(batches[0].split('\n').map((line) => JSON.parse(line).ts)).toEqual([
      2, 3,
    ])
  })
})

describe('installRecorderFlushListeners', () => {
  it('flushes pending events on pagehide', () => {
    const pageListeners = new Map<string, () => void>()
    const documentListeners = new Map<string, () => void>()
    const batches: string[] = []
    const buffer = createRecorderBuffer({
      send: (ndjson) => batches.push(ndjson),
      queueMicrotask: (callback) => callback(),
      setTimeout: () => 1,
    })

    installRecorderFlushListeners({
      page: {
        addEventListener: (type, listener) =>
          pageListeners.set(type, listener as () => void),
      },
      document: {
        visibilityState: 'visible',
        addEventListener: (type, listener) =>
          documentListeners.set(type, listener as () => void),
      },
      flush: buffer.flushNow,
    })

    buffer.emit(rrwebEvent(1))
    pageListeners.get('pagehide')?.()

    expect(batches).toHaveLength(1)
  })

  it('flushes only when visibility changes to hidden', () => {
    const documentListeners = new Map<string, () => void>()
    const batches: string[] = []
    let visibilityState = 'visible'
    const buffer = createRecorderBuffer({
      send: (ndjson) => batches.push(ndjson),
      queueMicrotask: (callback) => callback(),
      setTimeout: () => 1,
    })

    installRecorderFlushListeners({
      page: { addEventListener: () => {} },
      document: {
        get visibilityState() {
          return visibilityState
        },
        addEventListener: (type, listener) =>
          documentListeners.set(type, listener as () => void),
      },
      flush: buffer.flushNow,
    })

    buffer.emit(rrwebEvent(1))
    documentListeners.get('visibilitychange')?.()
    expect(batches).toEqual([])

    visibilityState = 'hidden'
    documentListeners.get('visibilitychange')?.()
    expect(batches).toHaveLength(1)
  })
})
