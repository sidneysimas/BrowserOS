import { describe, expect, it } from 'bun:test'
import { kitPersonalization, mergeKitSites, type PinnedSite } from './kit-apply'
import { findKit, KITS } from './kits'

const found = findKit('juridico')
if (!found) throw new Error('juridico kit missing')
const juridico = found

describe('mergeKitSites', () => {
  it('adds every kit site to an empty list, tagged with the kit', () => {
    const merged = mergeKitSites([], juridico)
    expect(merged).toHaveLength(juridico.sites.length)
    expect(merged.every((site) => site.kitId === 'juridico')).toBe(true)
  })

  it('keeps user sites first and skips duplicates by host and path', () => {
    const current: PinnedSite[] = [
      { title: 'Meu STF', url: 'https://portal.stf.jus.br/' },
      { title: 'Intranet', url: 'https://intranet.example' },
    ]
    const merged = mergeKitSites(current, juridico)
    expect(merged.slice(0, 2)).toEqual(current)
    expect(
      merged.filter((site) => site.url.includes('stf.jus.br')),
    ).toHaveLength(1)
  })

  it('is a no-op when the same kit is applied twice', () => {
    const once = mergeKitSites([], juridico)
    expect(mergeKitSites(once, juridico)).toEqual(once)
  })

  it('caps the row at twelve tiles', () => {
    let sites: PinnedSite[] = []
    for (const kit of KITS) sites = mergeKitSites(sites, kit)
    expect(sites).toHaveLength(12)
  })
})

describe('kitPersonalization', () => {
  it('fills an empty text', () => {
    expect(kitPersonalization('  ', juridico)).toBe(juridico.personalization)
  })

  it('never overwrites what the user wrote', () => {
    expect(kitPersonalization('Sou contador.', juridico)).toBeNull()
  })
})

describe('KITS', () => {
  it('have unique ids and valid https urls', () => {
    expect(new Set(KITS.map((kit) => kit.id)).size).toBe(KITS.length)
    for (const kit of KITS) {
      for (const site of kit.sites) {
        expect(new URL(site.url).protocol).toBe('https:')
      }
    }
  })
})
