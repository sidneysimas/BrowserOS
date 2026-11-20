import { describe, expect, it } from 'bun:test'
import {
  buildCommandUrl,
  KEYWORD_PATTERN,
  kitPersonalization,
  mergeKitCommands,
  mergeKitSites,
  type OmniboxCommand,
  type PinnedSite,
  parseOmniboxInput,
} from './kit-apply'
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

describe('mergeKitCommands', () => {
  it('keeps the user command when a keyword collides', () => {
    const mine: OmniboxCommand[] = [
      {
        keyword: 'g',
        title: 'Meu buscador',
        url: 'https://busca.example?q={q}',
      },
    ]
    const merged = mergeKitCommands(mine, juridico)
    expect(merged.filter((command) => command.keyword === 'g')).toEqual(mine)
    expect(merged.length).toBe(juridico.commands.length)
  })
})

describe('parseOmniboxInput', () => {
  const commands = mergeKitCommands([], juridico)

  it('splits the keyword from the text, ignoring case and spacing', () => {
    const parsed = parseOmniboxInput('  STF   habeas corpus ', commands)
    expect(parsed?.command.keyword).toBe('stf')
    expect(parsed?.query).toBe('habeas corpus')
  })

  it('returns null for text that does not start with a command', () => {
    expect(parseOmniboxInput('resuma esta página', commands)).toBeNull()
  })
})

describe('buildCommandUrl', () => {
  const command = {
    keyword: 'g',
    title: 'G',
    url: 'https://www.google.com/search?q={q}',
  }

  it('url-encodes the text into {q}', () => {
    expect(buildCommandUrl(command, 'a&b ç')).toBe(
      'https://www.google.com/search?q=a%26b%20%C3%A7',
    )
  })

  it('opens the site root when there is no text', () => {
    expect(buildCommandUrl(command, '')).toBe('https://www.google.com')
  })
})

describe('KITS', () => {
  it('have unique ids, valid https urls and well-formed commands', () => {
    expect(new Set(KITS.map((kit) => kit.id)).size).toBe(KITS.length)
    for (const kit of KITS) {
      for (const site of kit.sites) {
        expect(new URL(site.url).protocol).toBe('https:')
      }
      const keywords = kit.commands.map((command) => command.keyword)
      expect(new Set(keywords).size).toBe(keywords.length)
      for (const command of kit.commands) {
        expect(command.keyword).toMatch(KEYWORD_PATTERN)
        expect(command.url).toContain('{q}')
        expect(new URL(command.url.replace('{q}', 'x')).protocol).toBe('https:')
      }
    }
  })
})
