import {
  buildCommandUrl,
  normalizeKeyword,
  parseOmniboxInput,
} from '@/lib/kits/kit-apply'
import { omniboxCommandsStorage } from '@/lib/kits/kit-storage'

/**
 * MaestroOS address-bar commands. The manifest reserves the omnibox keyword
 * `m` (wxt.config.ts); after typing `m` + space, Chromium hands the rest of the
 * text to this module.
 *
 * `m <keyword> <text>` opens the matching command's URL (seeded by the kit and
 * edited in Settings > Meu kit). Any other text goes to the assistant on the
 * new tab chat, so `m` doubles as "ask MaestroOS" from the address bar.
 */

const MAX_SUGGESTIONS = 6

/** Omnibox descriptions are XML: escape user text before embedding it. */
function escapeXml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;')
}

function assistantUrl(text: string): string {
  const search = new URLSearchParams({ q: text, mode: 'agent' })
  return chrome.runtime.getURL(`app.html#/home/chat?${search.toString()}`)
}

// Chromium passes these three strings; @types/chrome models them as an enum.
function openUrl(
  url: string,
  disposition: 'currentTab' | 'newForegroundTab' | 'newBackgroundTab',
): void {
  if (disposition === 'currentTab') {
    void chrome.tabs.update({ url })
  } else {
    void chrome.tabs.create({ url, active: disposition === 'newForegroundTab' })
  }
}

export function registerOmniboxCommands(): void {
  // Older builds without the manifest key have no omnibox API.
  if (!chrome.omnibox) return

  chrome.omnibox.setDefaultSuggestion({
    description:
      'Digite um comando (ex.: <match>jus</match> lei 8.112) ou pergunte ao assistente',
  })

  chrome.omnibox.onInputChanged.addListener((text, suggest) => {
    void omniboxCommandsStorage.getValue().then((commands) => {
      const head = normalizeKeyword(text.split(/\s/)[0] ?? '')
      const rest = text.trim().slice(head.length).trim()
      const matches = commands
        .filter((command) => command.keyword.startsWith(head))
        .slice(0, MAX_SUGGESTIONS)
        .map((command) => ({
          content: `${command.keyword} ${rest}`.trimEnd(),
          description: `<match>${escapeXml(command.keyword)}</match> · ${escapeXml(command.title)}${rest ? ` <dim>${escapeXml(rest)}</dim>` : ''}`,
        }))
      if (text.trim() && !parseOmniboxInput(text, commands)) {
        matches.push({
          content: `? ${text.trim()}`,
          description: `Perguntar ao assistente: <dim>${escapeXml(text.trim())}</dim>`,
        })
      }
      suggest(matches)
    })
  })

  chrome.omnibox.onInputEntered.addListener((text, disposition) => {
    void omniboxCommandsStorage.getValue().then((commands) => {
      // The "ask" suggestion is prefixed with "? " so it never parses as a
      // command whose keyword happens to match the question's first word.
      const asked = text.startsWith('? ') ? text.slice(2) : null
      const parsed = asked === null ? parseOmniboxInput(text, commands) : null
      const url = parsed
        ? buildCommandUrl(parsed.command, parsed.query)
        : assistantUrl((asked ?? text).trim())
      openUrl(url, disposition)
    })
  })
}
