import type { Provider } from '@/components/chat/chatComponentTypes'

export type HomeSendRoute =
  | { kind: 'llm'; providerId: string; path: string }
  | { kind: 'acp'; agentId: string; path: string }

/**
 * Decide where a home-composer submission goes from the selected target.
 * LLM providers run in the in-tab provider chat (`/home/chat`); named agents
 * run in their harness conversation (`/home/agents/:id`). Returns null for an
 * empty prompt. Side effects (setDefaultProvider, setPendingInitialMessage)
 * are the caller's job — this stays a pure routing decision so it's testable.
 */
export function routeHomeSend(
  provider: Provider,
  text: string,
  options: { agentSessionId?: string } = {},
): HomeSendRoute | null {
  const query = text.trim()
  if (!query) return null
  const encoded = encodeURIComponent(query)
  if (provider.kind === 'acp') {
    // A malformed acp target (missing agentId) must not silently misroute to
    // the LLM chat with the agent id treated as a provider id — fail visibly.
    if (!provider.agentId || !options.agentSessionId) return null
    return {
      kind: 'acp',
      agentId: provider.agentId,
      path: `/home/agents/${provider.agentId}/sessions/${options.agentSessionId}?q=${encoded}`,
    }
  }
  return {
    kind: 'llm',
    providerId: provider.id,
    path: `/home/chat?q=${encoded}`,
  }
}
