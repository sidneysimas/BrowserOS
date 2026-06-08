import { Loader2, Trash2 } from 'lucide-react'
import type { FC } from 'react'
import type { HarnessAgentAdapter } from '@/modules/agents/agent-harness-types'
import type { AgentListItem } from '@/modules/agents/agents-page-types'
import { AdapterIcon, adapterLabel } from '../../components/agents/AdapterIcon'
import {
  canDelete as canDeleteAgent,
  displayName,
} from '../../components/agents/agent-display.helpers'
import { Button } from '../../components/ui/button'
import { cn } from '../../lib/utils'

interface CodingAgentCardProps {
  agent: AgentListItem
  adapter: HarnessAgentAdapter | 'unknown'
  modelLabel: string | null
  reasoningEffort: string | null
  deleting: boolean
  onDelete: (agent: AgentListItem) => void
}

/** Provider-style row for coding agents in the AI settings pane. */
export const CodingAgentCard: FC<CodingAgentCardProps> = ({
  agent,
  adapter,
  modelLabel,
  reasoningEffort,
  deleting,
  onDelete,
}) => {
  const name = displayName(agent)
  const metadata = [adapterLabel(adapter), modelLabel, reasoningEffort]
    .filter((part): part is string => Boolean(part))
    .join(' · ')
  const allowDelete = canDeleteAgent(agent)

  return (
    <div
      className={cn(
        'group flex w-full items-center gap-4 rounded-xl border p-4 text-left transition-all',
        'border-border bg-card hover:border-[var(--accent-orange)]/50 hover:shadow-sm',
      )}
    >
      <div
        aria-hidden="true"
        className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 border-border transition-all"
      />
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[var(--accent-orange)]/10 text-[var(--accent-orange)]">
        <AdapterIcon adapter={adapter} className="h-6 w-6" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="mb-1 flex items-center gap-2">
          <span className="truncate font-semibold">{name}</span>
        </div>
        <p className="truncate text-muted-foreground text-sm">{metadata}</p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`Delete ${name}`}
          disabled={!allowDelete || deleting}
          onClick={() => onDelete(agent)}
          className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
        >
          {deleting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Trash2 className="h-4 w-4" />
          )}
        </Button>
      </div>
    </div>
  )
}
