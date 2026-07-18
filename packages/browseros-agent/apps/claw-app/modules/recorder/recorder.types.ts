/**
 * @license
 * Copyright 2025 BrowserOS
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

export interface RecorderEventsMessage {
  type: 'recorder-events'
  ndjson: string
}

export type RecorderMessage = RecorderEventsMessage
