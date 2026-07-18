/**
 * @license
 * Copyright 2025 BrowserOS
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import {
  type FileHandle,
  mkdir,
  open,
  readFile,
  rm,
  unlink,
} from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { and, eq, isNotNull, lt, sql } from 'drizzle-orm'
import { resolveClawServerPath } from '../lib/browserclaw-dir'
import { logger } from '../lib/logger'
import { type AuditDb, getAuditDb } from '../modules/db/db'
import { tabClaims } from '../modules/db/schema/tab-claims.sql'
import { tabRecordings } from '../modules/db/schema/tab-recordings.sql'

const RECORDINGS_DIR_NAME = 'recordings'
const MAX_OPEN_HANDLES = 50
const IDLE_HANDLE_MS = 30_000
const RETENTION_INTERVAL_MS = 60 * 60 * 1000
const DAY_MS = 24 * 60 * 60 * 1000
const BATCH_ID_LRU_CAPACITY = 256

export interface RecordingEventInput {
  ts: number
  type: unknown
  data: unknown
}

export interface RecordedEvent extends RecordingEventInput {
  tabId: number
}

export interface RetentionSweepResult {
  recordingsDeleted: number
  claimsDeleted: number
}

export interface RecordingStore {
  /** Returns false only when this target already accepted the batch id. */
  appendBatch(
    targetId: string,
    tabId: number,
    events: RecordingEventInput[],
    batchId?: string,
  ): Promise<boolean>
  readRange(
    targetId: string,
    from: number,
    to: number,
  ): Promise<RecordedEvent[]>
  sweepRetention(
    retentionDays: number,
    now?: number,
  ): Promise<RetentionSweepResult>
  /** Drains queued writes and closes every cached recording handle. */
  close(): Promise<void>
  resetForTesting(): Promise<void>
}

export interface RecordingStoreOptions {
  rootDir?: string
  maxOpenHandles?: number
  idleHandleMs?: number
  getDb?: () => AuditDb
}

interface OpenEntry {
  handle: FileHandle
  closeTimer: ReturnType<typeof setTimeout> | null
  activeWrites: number
}

/** Stores target-keyed rrweb events and keeps the SQLite catalog in sync. */
export function createRecordingStore(
  options: RecordingStoreOptions = {},
): RecordingStore {
  const maxOpenHandles = options.maxOpenHandles ?? MAX_OPEN_HANDLES
  const idleHandleMs = options.idleHandleMs ?? IDLE_HANDLE_MS
  const getDb = options.getDb ?? getAuditDb
  const openHandles = new Map<string, OpenEntry>()
  /**
   * Serializes each target's append, retention, and dedupe state so concurrent
   * relay retries cannot interleave writes or both pass the acceptance check.
   */
  const chains = new Map<string, Promise<unknown>>()
  /**
   * Successful batch ids stay process-local and bounded: enough to absorb
   * relay retries without turning every target into unbounded durable state.
   */
  const acceptedBatchIds = new Map<string, Map<string, undefined>>()

  function hasAcceptedBatchId(targetId: string, batchId: string): boolean {
    const targetBatchIds = acceptedBatchIds.get(targetId)
    if (!targetBatchIds?.has(batchId)) return false
    targetBatchIds.delete(batchId)
    targetBatchIds.set(batchId, undefined)
    return true
  }

  function rememberAcceptedBatchId(targetId: string, batchId: string): void {
    let targetBatchIds = acceptedBatchIds.get(targetId)
    if (!targetBatchIds) {
      targetBatchIds = new Map()
      acceptedBatchIds.set(targetId, targetBatchIds)
    }
    targetBatchIds.set(batchId, undefined)
    if (targetBatchIds.size <= BATCH_ID_LRU_CAPACITY) return
    const oldest = targetBatchIds.keys().next().value
    if (oldest !== undefined) targetBatchIds.delete(oldest)
  }

  function resolvePath(targetId: string): string {
    const root = options.rootDir ?? resolveClawServerPath(RECORDINGS_DIR_NAME)
    return join(root, `${sanitizeTargetId(targetId)}.ndjson`)
  }

  async function closeEntry(targetId: string): Promise<void> {
    const entry = openHandles.get(targetId)
    if (!entry || entry.activeWrites > 0) return
    openHandles.delete(targetId)
    if (entry.closeTimer) clearTimeout(entry.closeTimer)
    try {
      await entry.handle.close()
    } catch (error) {
      logger.warn('recording handle close failed', {
        targetId,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  function bumpIdleTimer(targetId: string): void {
    const entry = openHandles.get(targetId)
    if (!entry || entry.activeWrites > 0) return
    if (entry.closeTimer) clearTimeout(entry.closeTimer)
    entry.closeTimer = setTimeout(() => void closeEntry(targetId), idleHandleMs)
    entry.closeTimer.unref?.()
  }

  async function evictOldestIfNeeded(): Promise<void> {
    while (openHandles.size > maxOpenHandles) {
      let oldestTarget: string | undefined
      for (const [targetId, entry] of openHandles) {
        if (entry.activeWrites === 0) {
          oldestTarget = targetId
          break
        }
      }
      if (oldestTarget === undefined) return
      await closeEntry(oldestTarget)
    }
  }

  async function openForAppend(targetId: string): Promise<OpenEntry> {
    const existing = openHandles.get(targetId)
    if (existing) {
      openHandles.delete(targetId)
      openHandles.set(targetId, existing)
      if (existing.closeTimer) clearTimeout(existing.closeTimer)
      existing.closeTimer = null
      existing.activeWrites++
      return existing
    }

    const path = resolvePath(targetId)
    await mkdir(dirname(path), { recursive: true })
    const handle = await open(path, 'a')
    const entry: OpenEntry = { handle, closeTimer: null, activeWrites: 1 }
    openHandles.set(targetId, entry)
    await evictOldestIfNeeded()
    return entry
  }

  async function releaseAppendEntry(
    targetId: string,
    entry: OpenEntry,
  ): Promise<void> {
    entry.activeWrites--
    if (openHandles.get(targetId) === entry) bumpIdleTimer(targetId)
    await evictOldestIfNeeded()
  }

  async function append(
    targetId: string,
    tabId: number,
    events: RecordingEventInput[],
  ): Promise<void> {
    if (events.length === 0) return
    const lines = events.map((event) => JSON.stringify({ tabId, ...event }))
    const payload = `${lines.join('\n')}\n`
    let firstEventAt = events[0].ts
    let lastEventAt = events[0].ts
    for (const event of events.slice(1)) {
      firstEventAt = Math.min(firstEventAt, event.ts)
      lastEventAt = Math.max(lastEventAt, event.ts)
    }
    const sizeBytes = Buffer.byteLength(payload)
    const entry = await openForAppend(targetId)
    // The NDJSON append and SQLite catalog cannot share a transaction. Retain
    // the byte boundary so a catalog failure can restore the file first.
    let originalSize: number | null = null
    try {
      originalSize = (await entry.handle.stat()).size
      await entry.handle.appendFile(payload, 'utf8')
      getDb()
        .insert(tabRecordings)
        .values({
          targetId,
          tabId,
          firstEventAt,
          lastEventAt,
          sizeBytes,
          eventCount: events.length,
        })
        .onConflictDoUpdate({
          target: tabRecordings.targetId,
          set: {
            tabId,
            firstEventAt: sql`min(${tabRecordings.firstEventAt}, ${firstEventAt})`,
            lastEventAt: sql`max(${tabRecordings.lastEventAt}, ${lastEventAt})`,
            sizeBytes: sql`${tabRecordings.sizeBytes} + ${sizeBytes}`,
            eventCount: sql`${tabRecordings.eventCount} + ${events.length}`,
          },
        })
        .run()
    } catch (error) {
      if (originalSize !== null) {
        try {
          await entry.handle.truncate(originalSize)
        } catch (rollbackError) {
          logger.warn('recording append rollback failed', {
            targetId,
            error:
              rollbackError instanceof Error
                ? rollbackError.message
                : String(rollbackError),
          })
        }
      }
      throw error
    } finally {
      await releaseAppendEntry(targetId, entry)
    }
  }

  function enqueue<T>(
    targetId: string,
    operation: () => Promise<T>,
  ): Promise<T> {
    const previous = chains.get(targetId) ?? Promise.resolve()
    const next = previous.catch(() => undefined).then(operation)
    const tracked = next.finally(() => {
      if (chains.get(targetId) === tracked) chains.delete(targetId)
    })
    chains.set(targetId, tracked)
    return tracked
  }

  async function deleteIfExpired(
    targetId: string,
    cutoff: number,
  ): Promise<boolean> {
    return enqueue(targetId, async () => {
      const current = getDb()
        .select({ lastEventAt: tabRecordings.lastEventAt })
        .from(tabRecordings)
        .where(eq(tabRecordings.targetId, targetId))
        .get()
      if (!current || current.lastEventAt >= cutoff) return false

      await closeEntry(targetId)
      try {
        await unlink(resolvePath(targetId))
      } catch (error) {
        if ((error as { code?: string }).code !== 'ENOENT') {
          logger.warn('recording retention unlink failed', {
            targetId,
            error: error instanceof Error ? error.message : String(error),
          })
          return false
        }
      }
      getDb()
        .delete(tabRecordings)
        .where(eq(tabRecordings.targetId, targetId))
        .run()
      acceptedBatchIds.delete(targetId)
      return true
    })
  }

  async function closeAll(): Promise<void> {
    while (chains.size > 0) {
      await Promise.allSettled([...chains.values()])
    }
    for (const targetId of [...openHandles.keys()]) {
      await closeEntry(targetId)
    }
    chains.clear()
  }

  return {
    appendBatch(targetId, tabId, events, batchId) {
      return enqueue(targetId, async () => {
        // Check and remember share the target chain; remember only after append
        // succeeds so a failed delivery remains retryable.
        if (batchId !== undefined && hasAcceptedBatchId(targetId, batchId)) {
          return false
        }
        await append(targetId, tabId, events)
        if (batchId !== undefined) {
          rememberAcceptedBatchId(targetId, batchId)
        }
        return true
      })
    },
    async readRange(targetId, from, to) {
      await chains.get(targetId)?.catch(() => undefined)
      let text: string
      try {
        text = await readFile(resolvePath(targetId), 'utf8')
      } catch (error) {
        if ((error as { code?: string }).code === 'ENOENT') return []
        throw error
      }
      const events: RecordedEvent[] = []
      for (const line of text.split('\n')) {
        if (!line) continue
        const event = parseRecordedEvent(line)
        if (event && event.ts >= from && event.ts <= to) events.push(event)
      }
      return events
    },
    async sweepRetention(retentionDays, now = Date.now()) {
      const cutoff = now - retentionDays * DAY_MS
      const expired = getDb()
        .select({ targetId: tabRecordings.targetId })
        .from(tabRecordings)
        .where(lt(tabRecordings.lastEventAt, cutoff))
        .all()
      let recordingsDeleted = 0
      for (const { targetId } of expired) {
        if (await deleteIfExpired(targetId, cutoff)) recordingsDeleted++
      }
      const expiredClaims = getDb()
        .select({ id: tabClaims.id })
        .from(tabClaims)
        .where(
          and(
            isNotNull(tabClaims.releasedAt),
            lt(tabClaims.releasedAt, cutoff),
          ),
        )
        .all()
      getDb()
        .delete(tabClaims)
        .where(
          and(
            isNotNull(tabClaims.releasedAt),
            lt(tabClaims.releasedAt, cutoff),
          ),
        )
        .run()
      return { recordingsDeleted, claimsDeleted: expiredClaims.length }
    },
    close: closeAll,
    async resetForTesting() {
      await closeAll()
      acceptedBatchIds.clear()
      if (options.rootDir) {
        await rm(options.rootDir, { recursive: true, force: true })
      }
    },
  }
}

export interface RecordingRetentionHandle {
  initialSweep: Promise<void>
  stop(): Promise<void>
}

/** Runs recording retention at startup and hourly without keeping Bun alive. */
export function startRecordingRetention(
  store: RecordingStore,
  retentionDays: number,
  intervalMs = RETENTION_INTERVAL_MS,
): RecordingRetentionHandle {
  const activeSweeps = new Set<Promise<void>>()
  const run = async (): Promise<void> => {
    try {
      const result = await store.sweepRetention(retentionDays)
      logger.info('recording retention sweep finished', { ...result })
    } catch (error) {
      logger.warn('recording retention sweep failed', {
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }
  const launch = (): Promise<void> => {
    const sweep = run().finally(() => activeSweeps.delete(sweep))
    activeSweeps.add(sweep)
    return sweep
  }
  const initialSweep = launch()
  const timer = setInterval(() => void launch(), intervalMs)
  timer.unref?.()
  return {
    initialSweep,
    stop: async () => {
      clearInterval(timer)
      await Promise.allSettled([...activeSweeps])
    },
  }
}

function sanitizeTargetId(targetId: string): string {
  return targetId.replace(/[^A-Za-z0-9._-]/g, '_')
}

function parseRecordedEvent(line: string): RecordedEvent | null {
  try {
    const event = JSON.parse(line) as Partial<RecordedEvent>
    if (typeof event.tabId !== 'number' || typeof event.ts !== 'number') {
      return null
    }
    return {
      tabId: event.tabId,
      ts: event.ts,
      type: event.type,
      data: event.data,
    }
  } catch {
    return null
  }
}

export const recordingStore = createRecordingStore()
