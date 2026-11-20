import { beforeAll, describe, expect, it, mock } from 'bun:test'
import { createElement, type FC } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

// `@/…` does not resolve under `bun test`, so every module the banner file
// imports is stubbed, even though the shipped component renders nothing.
mock.module('@/assets/browserclaw_logo.png', () => ({ default: 'logo.png' }))
mock.module('@/lib/metrics/track', () => ({ track: () => {} }))
mock.module('@/lib/sentry/sentry', () => ({
  sentry: { captureException: () => {} },
}))
mock.module('@/lib/constants/analyticsEvents', () => ({
  BROWSERCLAW_MCP_BANNER_CLICKED_EVENT: 'unused',
}))
mock.module('@/components/ui/button', () => ({
  Button: () => null,
}))

let BrowserClawMcpBanner: FC

beforeAll(async () => {
  BrowserClawMcpBanner = (await import('./BrowserClawMcpBanner'))
    .BrowserClawMcpBanner
})

describe('BrowserClawMcpBanner', () => {
  // MaestroOS hides the upstream BrowserOS neo promo (see the component).
  it('renders nothing in the MaestroOS fork', () => {
    expect(renderToStaticMarkup(createElement(BrowserClawMcpBanner))).toBe('')
  })
})
