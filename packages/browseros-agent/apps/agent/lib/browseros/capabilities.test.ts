import { describe, expect, it } from 'bun:test'
import {
  checkFeatureSupport,
  Feature,
  resolveStaticFeatureSupport,
} from './capabilities'

describe('resolveStaticFeatureSupport', () => {
  it('enables alpha-gated features automatically in development', () => {
    expect(
      resolveStaticFeatureSupport({
        isDevelopment: true,
        alphaFeaturesEnabled: false,
        requiresAlphaFlag: true,
      }),
    ).toBe(true)
  })

  it('enables alpha-gated features only when explicitly opted in', () => {
    expect(
      resolveStaticFeatureSupport({
        isDevelopment: false,
        alphaFeaturesEnabled: true,
        requiresAlphaFlag: true,
      }),
    ).toBe(true)
  })

  it('keeps non-alpha features enabled in development', () => {
    expect(
      resolveStaticFeatureSupport({
        isDevelopment: true,
        alphaFeaturesEnabled: false,
      }),
    ).toBe(true)
  })

  it('leaves non-alpha features unresolved in production', () => {
    expect(
      resolveStaticFeatureSupport({
        isDevelopment: false,
        alphaFeaturesEnabled: false,
      }),
    ).toBeNull()
  })
})

describe('checkFeatureSupport — AGENT_HARNESS_SUPPORT', () => {
  const at = (browserOSVersion: number[] | null) =>
    checkFeatureSupport(
      { browserOSVersion, serverVersion: null },
      Feature.AGENT_HARNESS_SUPPORT,
    )

  it('hides harness agents below BrowserOS 0.46.0.0 or when version is unknown', () => {
    expect(at([0, 45, 9, 9])).toBe(false)
    expect(at([0, 45, 0, 0])).toBe(false)
    expect(at(null)).toBe(false)
  })

  it('shows harness agents at or above BrowserOS 0.46.0.0', () => {
    expect(at([0, 46, 0, 0])).toBe(true)
    expect(at([0, 47, 0, 0])).toBe(true)
  })
})

describe('checkFeatureSupport — HERMES_AGENT_SUPPORT', () => {
  it('has no version dependency once the static alpha gate allows it', () => {
    expect(
      checkFeatureSupport(
        { browserOSVersion: null, serverVersion: null },
        Feature.HERMES_AGENT_SUPPORT,
      ),
    ).toBe(true)
  })
})
