import { type FC, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import type { Provider } from '@/components/chat/chatComponentTypes'
import { Feature } from '@/lib/browseros/capabilities'
import {
  useAgentAdapters,
  useHarnessAgents,
} from '@/modules/agents/agents.hooks'
import { useCapabilities } from '@/modules/browseros/capabilities.hooks'
import { toProviderOption } from '@/modules/chat/chat-session-request'
import {
  buildSidepanelChatTargets,
  persistSidepanelChatTargetSelection,
  resolveSidepanelChatTarget,
} from '@/modules/chat/sidepanel-chat-targets'
import { useLlmProviders } from '@/modules/llm-providers/llm-providers.hooks'
import { useActiveHint } from '@/screens/newtab/index/active-hint.hooks'
import { ImportDataHint } from '@/screens/newtab/index/ImportDataHint'
import { SignInHint } from '@/screens/newtab/index/SignInHint'
import {
  ConversationInput,
  type ConversationInputSendInput,
} from './ConversationInput'
import { routeHomeSend } from './home-compose.helpers'
import { setPendingInitialMessage } from './pending-initial-message'

export const AgentCommandHome: FC = () => {
  const navigate = useNavigate()
  const activeHint = useActiveHint()
  const {
    providers: llmProviders,
    defaultProviderId,
    setDefaultProvider,
  } = useLlmProviders()
  const { harnessAgents } = useHarnessAgents()
  const { adapters } = useAgentAdapters()
  const { supports } = useCapabilities()
  const hermesAgentSupported = supports(Feature.HERMES_AGENT_SUPPORT)
  const [selectedProvider, setSelectedProvider] = useState<Provider | null>(
    null,
  )

  const targets = useMemo(
    () =>
      buildSidepanelChatTargets({
        providers: llmProviders,
        adapters,
        agents: harnessAgents,
        hermesAgentSupported,
      }),
    [llmProviders, adapters, harnessAgents, hermesAgentSupported],
  )
  const providerOptions = useMemo(
    () => targets.map(toProviderOption),
    [targets],
  )

  // Default the picker to the user's default LLM provider (BrowserOS out of the
  // box) so the composer works with zero agents. Re-resolve if the current
  // selection disappears (e.g. its provider/agent was removed).
  useEffect(() => {
    if (targets.length === 0) return
    const stillValid =
      selectedProvider &&
      providerOptions.some(
        (option) =>
          option.id === selectedProvider.id &&
          option.kind === selectedProvider.kind,
      )
    if (stillValid) return
    const fallback = resolveSidepanelChatTarget({ targets, defaultProviderId })
    setSelectedProvider(fallback ? toProviderOption(fallback) : null)
  }, [targets, providerOptions, selectedProvider, defaultProviderId])

  const handleSend = async (input: ConversationInputSendInput) => {
    if (!selectedProvider) return
    const agentSessionId =
      selectedProvider.kind === 'acp' ? crypto.randomUUID() : undefined
    const route = routeHomeSend(selectedProvider, input.text, {
      agentSessionId,
    })
    if (!route) return
    if (route.kind === 'acp') {
      if (!agentSessionId) return
      // Stash text + attachments in the in-memory registry. Text also travels
      // in `?q=` so a hard refresh / shareable URL still works for text-only
      // prompts; attachments are registry-only (a multi-MB dataUrl can't ride
      // a URL param). The chat screen prefers the registry when both exist.
      setPendingInitialMessage({
        agentId: route.agentId,
        sessionId: agentSessionId,
        text: input.text,
        attachments: input.attachments,
        createdAt: Date.now(),
      })
      navigate(route.path)
      return
    }
    // LLM target → /home/chat. That chat resolves its provider from the shared
    // chat-target selection (preferred over the global default), so persist
    // this pick there before navigating; also set it as the default to mirror
    // the sidepanel's behaviour.
    const target = targets.find(
      (entry) => entry.kind === 'llm' && entry.id === route.providerId,
    )
    await persistSidepanelChatTargetSelection(target)
    await setDefaultProvider(route.providerId)
    navigate(route.path)
  }

  return (
    <div className="min-h-full px-4 py-6">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-8">
        <div className="flex flex-col items-center gap-5 pt-[max(10vh,24px)] text-center">
          <div className="space-y-3">
            <h1 className="font-semibold text-[clamp(2.25rem,4.5vw,3.5rem)] leading-[1.08] tracking-[-0.025em] [text-wrap:balance]">
              What should your agent{' '}
              <span className="font-medium text-[var(--accent-orange)] italic">
                work on
              </span>{' '}
              next?
            </h1>
            <p className="mx-auto max-w-2xl text-muted-foreground text-sm leading-6 [text-wrap:pretty]">
              Pick BrowserOS AI or any agent, then start a task — all without
              leaving this tab.
            </p>
          </div>

          <div className="w-full max-w-3xl">
            <ConversationInput
              variant="home"
              providers={providerOptions}
              selectedProvider={selectedProvider}
              onSelectProvider={setSelectedProvider}
              onSend={handleSend}
              streaming={false}
              disabled={!selectedProvider}
              attachmentsEnabled={true}
              placeholder={
                selectedProvider
                  ? `Ask ${selectedProvider.name} to handle a task...`
                  : 'Loading providers...'
              }
            />
          </div>
        </div>
      </div>

      {activeHint === 'signin' ? <SignInHint /> : null}
      {activeHint === 'import' ? <ImportDataHint /> : null}
    </div>
  )
}
