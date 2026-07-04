/**
 * @license
 * Copyright 2025 BrowserOS
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * v2 single MCP endpoint. Every agent connects to the same standard
 * URL; identity is captured via the server's `oninitialized` hook in
 * `single-server.ts` (which fires on the InitializedNotification,
 * after the server has stored `clientInfo`). The standalone server
 * serves the route at `/mcp`.
 */

import { Hono } from 'hono'
import { handleSingleMcpRequest } from '../../mcp/single-server'

export const mcpV2Route = new Hono().all('/mcp', async (c) => {
  return handleSingleMcpRequest(c.req.raw)
})
