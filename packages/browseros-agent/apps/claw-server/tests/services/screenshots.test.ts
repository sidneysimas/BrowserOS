/**
 * @license
 * Copyright 2025 BrowserOS
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { describe, expect, it } from 'bun:test'
import { existsSync, readFileSync } from 'node:fs'
import {
  persistScreenshot,
  screenshotPath,
} from '../../src/services/screenshots'
import { withTempBrowserosDir } from '../_helpers/temp-browseros-dir'

const ONE_PX_JPEG_B64 =
  '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAMCAgICAgMCAgIDAwMDBAYEBAQEBAgGBgUGCQgKCgkICQkKDA8MCgsOCwkJDRENDg8QEBEQCgwSExIQEw8QEBD/2wBDAQMDAwQDBAgEBAgQCwkLEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBD/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAr/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFAEBAAAAAAAAAAAAAAAAAAAAAP/EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAMAwEAAhEDEQA/AKpAA//Z'

describe('persistScreenshot', () => {
  it('writes <dispatchId>.jpg from image content', async () => {
    await withTempBrowserosDir(async () => {
      persistScreenshot({
        dispatchId: 42,
        toolName: 'screenshot',
        result: {
          isError: false,
          content: [
            {
              type: 'image',
              data: ONE_PX_JPEG_B64,
              mimeType: 'image/jpeg',
            },
          ],
          structuredContent: {
            page: 1,
            format: 'jpeg',
            bytes: 0,
          },
        },
      })
      // writeFile is async; small delay so the fire-and-forget settles.
      await new Promise((r) => setTimeout(r, 50))
      const path = screenshotPath(42)
      expect(existsSync(path)).toBe(true)
      expect(readFileSync(path).length).toBeGreaterThan(0)
    })
  })

  it('no-op for non-screenshot tools', async () => {
    await withTempBrowserosDir(async () => {
      persistScreenshot({
        dispatchId: 1,
        toolName: 'snapshot',
        result: {
          isError: false,
          content: [
            {
              type: 'image',
              data: ONE_PX_JPEG_B64,
              mimeType: 'image/jpeg',
            },
          ],
          structuredContent: {},
        },
      })
      await new Promise((r) => setTimeout(r, 30))
      expect(existsSync(screenshotPath(1))).toBe(false)
    })
  })

  it('no-op when isError=true', async () => {
    await withTempBrowserosDir(async () => {
      persistScreenshot({
        dispatchId: 2,
        toolName: 'screenshot',
        result: {
          isError: true,
          content: [
            {
              type: 'image',
              data: ONE_PX_JPEG_B64,
              mimeType: 'image/jpeg',
            },
          ],
          structuredContent: {},
        },
      })
      await new Promise((r) => setTimeout(r, 30))
      expect(existsSync(screenshotPath(2))).toBe(false)
    })
  })

  it('no-op when image content is missing', async () => {
    await withTempBrowserosDir(async () => {
      persistScreenshot({
        dispatchId: 3,
        toolName: 'screenshot',
        result: {
          isError: false,
          content: [{ type: 'text', text: 'no image here' }],
          structuredContent: { page: 1, format: 'jpeg' },
        },
      })
      await new Promise((r) => setTimeout(r, 30))
      expect(existsSync(screenshotPath(3))).toBe(false)
    })
  })

  it('falls back to legacy structured image data', async () => {
    await withTempBrowserosDir(async () => {
      persistScreenshot({
        dispatchId: 4,
        toolName: 'screenshot',
        result: {
          isError: false,
          content: [],
          structuredContent: { image: ONE_PX_JPEG_B64 },
        },
      })
      await new Promise((r) => setTimeout(r, 50))
      expect(existsSync(screenshotPath(4))).toBe(true)
      expect(readFileSync(screenshotPath(4)).length).toBeGreaterThan(0)
    })
  })
})
