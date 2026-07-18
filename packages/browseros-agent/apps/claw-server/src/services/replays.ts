/**
 * @license
 * Copyright 2025 BrowserOS
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { eq } from 'drizzle-orm'
import { type AuditDb, getAuditDb } from '../modules/db/db'
import { tabClaims } from '../modules/db/schema/tab-claims.sql'
import { tabRecordings } from '../modules/db/schema/tab-recordings.sql'
import {
  type RecordedEvent,
  type RecordingStore,
  recordingStore,
} from './recordings'

/** Includes recorder events already in flight when a claim closes. */
const RELEASE_TAIL_MS = 5_000

export interface ReplayEvent extends RecordedEvent {
  sessionId: string
  targetId: string
}

export interface ReplayTargetMeta {
  targetId: string
  tabId: number
  firstEventAt: number
  lastEventAt: number
}

export interface ReplayMeta {
  exists: boolean
  firstEventAt?: number
  lastEventAt?: number
  sizeBytes: number
  targets: ReplayTargetMeta[]
}

export interface ReplayService {
  readSession(sessionId: string): Promise<ReplayEvent[]>
  getMeta(sessionId: string): ReplayMeta
}

interface ReplayServiceOptions {
  recordingStore: RecordingStore
  getDb?: () => AuditDb
}

/** Assembles session replays by slicing target recordings through claim windows. */
export function createReplayService(
  options: ReplayServiceOptions,
): ReplayService {
  const getDb = options.getDb ?? getAuditDb

  return {
    async readSession(sessionId) {
      const claims = getDb()
        .select()
        .from(tabClaims)
        .where(eq(tabClaims.sessionId, sessionId))
        .all()
      const slices = await Promise.all(
        claims.map(async (claim) => {
          const to =
            claim.releasedAt === null
              ? Number.POSITIVE_INFINITY
              : claim.releasedAt + RELEASE_TAIL_MS
          const events = await options.recordingStore.readRange(
            claim.targetId,
            claim.claimedAt,
            to,
          )
          return events.map((event) => ({
            sessionId,
            targetId: claim.targetId,
            ...event,
          }))
        }),
      )
      // Stable timestamp merge preserves a target slice's order when rrweb
      // events from one or more targets share the same millisecond.
      return slices.flat().sort((a, b) => a.ts - b.ts)
    },
    getMeta(sessionId) {
      const claims = getDb()
        .select()
        .from(tabClaims)
        .where(eq(tabClaims.sessionId, sessionId))
        .all()
      if (claims.length === 0) return emptyMeta()

      const recordings = new Map(
        getDb()
          .select()
          .from(tabRecordings)
          .all()
          .map((recording) => [recording.targetId, recording]),
      )
      const claimsByTarget = new Map<string, typeof claims>()
      for (const claim of claims) {
        const targetClaims = claimsByTarget.get(claim.targetId) ?? []
        targetClaims.push(claim)
        claimsByTarget.set(claim.targetId, targetClaims)
      }

      const targets: ReplayTargetMeta[] = []
      let sizeBytes = 0
      for (const [targetId, targetClaims] of claimsByTarget) {
        const recording = recordings.get(targetId)
        if (!recording) continue
        const claimedAt = Math.min(
          ...targetClaims.map((claim) => claim.claimedAt),
        )
        const releasedAt = Math.max(
          ...targetClaims.map(
            (claim) => claim.releasedAt ?? recording.lastEventAt,
          ),
        )
        const firstEventAt = Math.max(claimedAt, recording.firstEventAt)
        const lastEventAt = Math.min(releasedAt, recording.lastEventAt)
        if (firstEventAt > lastEventAt) continue
        targets.push({
          targetId,
          tabId: recording.tabId,
          firstEventAt,
          lastEventAt,
        })
        // Size is a catalog-level whole-file approximation, not claim-window bytes.
        sizeBytes += recording.sizeBytes
      }
      targets.sort((a, b) => a.targetId.localeCompare(b.targetId))
      if (targets.length === 0) return emptyMeta()
      return {
        exists: true,
        firstEventAt: Math.min(...targets.map((target) => target.firstEventAt)),
        lastEventAt: Math.max(...targets.map((target) => target.lastEventAt)),
        sizeBytes,
        targets,
      }
    },
  }
}

function emptyMeta(): ReplayMeta {
  return { exists: false, sizeBytes: 0, targets: [] }
}

export const replayService = createReplayService({ recordingStore })
