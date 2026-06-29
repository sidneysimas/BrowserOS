/**
 * @license
 * Copyright 2025 BrowserOS
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/** Default loopback port for the standalone BrowserClaw API. */
export const CLAW_API_PORT_DEFAULT = 9200

/**
 * Default CDP port Claw dials when attaching to the BrowserOS
 * Chromium. Lives in IANA's dynamic / private range (49152-65535)
 * so it cannot collide with a registered service, and is not a round
 * number so a hand-rolled local script is unlikely to pick the same
 * Important: this is the port BrowserOS's Chromium exposes its
 * DevTools on, not a port Claw itself opens.
 */
export const CLAW_CDP_PORT_DEFAULT = 49337
