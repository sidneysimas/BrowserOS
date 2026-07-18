/**
 * @license
 * Copyright 2025 BrowserOS
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

export type Fetcher = (
  input: Parameters<typeof globalThis.fetch>[0],
  init?: Parameters<typeof globalThis.fetch>[1],
) => ReturnType<typeof globalThis.fetch>

export interface RecordingsRelayOptions {
  resolveServerBaseUrl: () => Promise<string>
  fetch?: Fetcher
  now?: () => number
  warn?: (...args: unknown[]) => void
}

export interface RecordingsRelay {
  serverHasRecordings: () => Promise<boolean>
  post: (tabId: number, ndjson: string) => Promise<void>
}

const HEALTH_RETRY_MS = 60_000
const WARNING_INTERVAL_MS = 60_000

/** Relays tab-scoped recorder batches only while the server supports ingestion. */
export function createRecordingsRelay(
  options: RecordingsRelayOptions,
): RecordingsRelay {
  const fetch = options.fetch ?? globalThis.fetch
  const now = options.now ?? Date.now
  const warn = options.warn ?? console.warn
  let healthyBaseUrl: string | null = null
  let unhealthyUntil = 0
  let healthProbe: Promise<string | null> | null = null
  let lastPostFailureWarningAt: number | null = null

  async function probeServer(): Promise<string | null> {
    try {
      const baseUrl = await options.resolveServerBaseUrl()
      const response = await fetch(`${baseUrl}/recordings/health`, {
        credentials: 'omit',
      })
      if (!response.ok) {
        unhealthyUntil = now() + HEALTH_RETRY_MS
        return null
      }
      const body = (await response.json()) as { ok?: unknown }
      if (body.ok !== true) {
        unhealthyUntil = now() + HEALTH_RETRY_MS
        return null
      }
      healthyBaseUrl = baseUrl
      unhealthyUntil = 0
      return baseUrl
    } catch {
      unhealthyUntil = now() + HEALTH_RETRY_MS
      return null
    }
  }

  async function resolveHealthyBaseUrl(): Promise<string | null> {
    if (healthyBaseUrl) return healthyBaseUrl
    if (now() < unhealthyUntil) return null
    if (!healthProbe) healthProbe = probeServer()
    const currentProbe = healthProbe
    try {
      return await currentProbe
    } finally {
      if (healthProbe === currentProbe) healthProbe = null
    }
  }

  function markPostFailure(error: unknown): void {
    healthyBaseUrl = null
    unhealthyUntil = 0
    const timestamp = now()
    if (
      lastPostFailureWarningAt !== null &&
      timestamp - lastPostFailureWarningAt < WARNING_INTERVAL_MS
    ) {
      return
    }
    lastPostFailureWarningAt = timestamp
    warn('[browseros-claw replay] events POST failed', {
      error: error instanceof Error ? error.message : String(error),
    })
  }

  return {
    async serverHasRecordings(): Promise<boolean> {
      return (await resolveHealthyBaseUrl()) !== null
    },
    async post(tabId, ndjson): Promise<void> {
      const baseUrl = await resolveHealthyBaseUrl()
      if (!baseUrl) return
      try {
        const response = await fetch(
          `${baseUrl}/recordings/tabs/${tabId}/events`,
          {
            method: 'POST',
            headers: { 'content-type': 'application/x-ndjson' },
            body: ndjson,
            credentials: 'omit',
          },
        )
        if (!response.ok) {
          throw new Error(`recordings ingest returned ${response.status}`)
        }
        lastPostFailureWarningAt = null
      } catch (error) {
        markPostFailure(error)
      }
    },
  }
}
