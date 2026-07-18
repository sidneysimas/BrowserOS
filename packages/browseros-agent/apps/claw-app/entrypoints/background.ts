/**
 * @license
 * Copyright 2025 BrowserOS
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { defineBackground } from 'wxt/utils/define-background'
import { resolveBrowserOSServerBaseUrl } from '@/modules/api/browseros-ports'
import { createRecordingsRelay } from '@/modules/recorder'

/** Tags recorder batches with the sender tab and relays them to the local server. */
export default defineBackground(() => {
  const relay = createRecordingsRelay({
    resolveServerBaseUrl: resolveBrowserOSServerBaseUrl,
  })

  chrome.runtime.onMessage.addListener((message, sender) => {
    const recorderMessage = message as {
      type?: unknown
      ndjson?: unknown
    }
    const tabId = sender.tab?.id
    if (
      recorderMessage.type !== 'recorder-events' ||
      typeof recorderMessage.ndjson !== 'string' ||
      typeof tabId !== 'number'
    ) {
      return false
    }
    void relay.post(tabId, recorderMessage.ndjson)
    return false
  })

  void relay.serverHasRecordings()
})
