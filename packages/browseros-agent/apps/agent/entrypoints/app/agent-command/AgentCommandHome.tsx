import { type FC, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import type { Provider } from '@/components/chat/chatComponentTypes'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import type {
  HarnessAdapterDescriptor,
  HarnessAgent,
} from '@/entrypoints/app/agents/agent-harness-types'
import {
  useAgentAdapters,
  useHarnessAgents,
} from '@/entrypoints/app/agents/useAgents'
import { ImportDataHint } from '@/entrypoints/newtab/index/ImportDataHint'
import { SignInHint } from '@/entrypoints/newtab/index/SignInHint'
import { useActiveHint } from '@/entrypoints/newtab/index/useActiveHint'
import {
  buildSidepanelChatTargets,
  persistSidepanelChatTargetSelection,
  resolveSidepanelChatTarget,
} from '@/entrypoints/sidepanel/index/sidepanel-chat-targets'
import { toProviderOption } from '@/entrypoints/sidepanel/index/useChatSessionRequest'
import { Feature } from '@/lib/browseros/capabilities'
import { useCapabilities } from '@/lib/browseros/useCapabilities'
import { visibleHarnessAgents } from '@/lib/chat/adapter-visibility'
import { useLlmProviders } from '@/lib/llm-providers/useLlmProviders'
import { AgentCardDock } from './AgentCardDock'
import {
  ConversationInput,
  type ConversationInputSendInput,
} from './ConversationInput'
import { orderHomeAgents } from './home-agent-card.helpers'
import { routeHomeSend } from './home-compose.helpers'
import { setPendingInitialMessage } from './pending-initial-message'

function RecentThreads({
  activeAgentId,
  agents,
  adapters,
  onOpenAgents,
  onSelectAgent,
}: {
  activeAgentId?: string | null
  agents: HarnessAgent[]
  adapters: HarnessAdapterDescriptor[]
  onOpenAgents: () => void
  onSelectAgent: (agentId: string) => void
}) {
  if (agents.length === 0) return null

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="font-semibold text-base">Recent agents</h2>
          <p className="text-muted-foreground text-sm">
            Continue from where you left off.
          </p>
        </div>
        <Button
          variant="outline"
          onClick={onOpenAgents}
          className="rounded-xl"
          size="sm"
        >
          Manage agents
        </Button>
      </div>
      <AgentCardDock
        agents={agents}
        adapters={adapters}
        activeAgentId={activeAgentId ?? undefined}
        onSelectAgent={onSelectAgent}
        onCreateAgent={onOpenAgents}
      />
    </section>
  )
}

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

  const orderedAgents = useMemo(
    () => orderHomeAgents(harnessAgents),
    [harnessAgents],
  )

  // "Manage agents" opens the settings pane for an adapter the user actually
  // has agents under (the most recent visible one), not a hardcoded adapter —
  // otherwise a Codex-only user would land on an empty Claude pane.
  const manageAgentsPath = useMemo(() => {
    const adapter = visibleHarnessAgents(
      orderedAgents,
      hermesAgentSupported,
    ).at(0)?.adapter
    return adapter ? `/settings/ai?section=${adapter}` : '/settings/ai'
  }, [orderedAgents, hermesAgentSupported])

  const handleSend = async (input: ConversationInputSendInput) => {
    if (!selectedProvider) return
    const route = routeHomeSend(selectedProvider, input.text)
    if (!route) return
    if (route.kind === 'acp') {
      // Stash text + attachments in the in-memory registry. Text also travels
      // in `?q=` so a hard refresh / shareable URL still works for text-only
      // prompts; attachments are registry-only (a multi-MB dataUrl can't ride
      // a URL param). The chat screen prefers the registry when both exist.
      setPendingInitialMessage({
        agentId: route.agentId,
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

        {orderedAgents.length > 0 ? (
          <>
            <Separator />
            <RecentThreads
              activeAgentId={selectedProvider?.agentId ?? null}
              agents={orderedAgents}
              adapters={adapters}
              onOpenAgents={() => navigate(manageAgentsPath)}
              onSelectAgent={(agentId) => navigate(`/home/agents/${agentId}`)}
            />
          </>
        ) : null}
      </div>

      {activeHint === 'signin' ? <SignInHint /> : null}
      {activeHint === 'import' ? <ImportDataHint /> : null}
    </div>
  )
}
