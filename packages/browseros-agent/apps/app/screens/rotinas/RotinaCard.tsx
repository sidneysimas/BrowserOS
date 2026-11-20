import dayjs from 'dayjs'
import 'dayjs/locale/pt-br'
import relativeTime from 'dayjs/plugin/relativeTime'
import {
  CheckCircle2,
  Eye,
  ListOrdered,
  Loader2,
  Pencil,
  Play,
  Send,
  Trash2,
  XCircle,
} from 'lucide-react'
import type { FC } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { describeSchedule, type RotinaMeta } from '@/lib/rotinas/rotinas'
import type {
  ScheduledJob,
  ScheduledJobRun,
} from '@/lib/schedules/scheduleTypes'

dayjs.extend(relativeTime)

export interface RotinaCardProps {
  job: ScheduledJob
  /** Undefined for a plain upstream scheduled task. */
  meta: RotinaMeta | undefined
  lastRun: ScheduledJobRun | undefined
  onRun: () => void
  onEdit: () => void
  onDelete: () => void
  onToggle: (enabled: boolean) => void
  onViewRun: (run: ScheduledJobRun) => void
}

export const RotinaCard: FC<RotinaCardProps> = ({
  job,
  meta,
  lastRun,
  onRun,
  onEdit,
  onDelete,
  onToggle,
  onViewRun,
}) => {
  const manual = meta?.manual ?? false
  const stepCount = meta?.steps.length ?? 1
  const isWrite = (meta?.effects ?? 'write') === 'write'

  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm transition-shadow hover:shadow-md">
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate font-semibold">{job.name}</h3>
            <Badge variant="secondary">{describeSchedule(job, manual)}</Badge>
            <Badge variant="outline" className="gap-1">
              {isWrite ? (
                <Send className="h-3 w-3" />
              ) : (
                <Eye className="h-3 w-3" />
              )}
              {isWrite ? 'Envia ou altera' : 'Só consulta'}
            </Badge>
          </div>
          <p className="mt-1 line-clamp-2 text-muted-foreground text-sm">
            {meta?.description ?? meta?.steps[0] ?? job.query}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-3 text-muted-foreground text-xs">
            <span className="inline-flex items-center gap-1">
              <ListOrdered className="h-3.5 w-3.5" />
              {stepCount === 1 ? '1 passo' : `${stepCount} passos`}
            </span>
            {lastRun && (
              <button
                type="button"
                onClick={() => onViewRun(lastRun)}
                className="inline-flex items-center gap-1 hover:text-foreground"
              >
                {lastRun.status === 'running' ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : lastRun.status === 'completed' ? (
                  <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
                ) : (
                  <XCircle className="h-3.5 w-3.5 text-destructive" />
                )}
                {lastRun.status === 'running'
                  ? 'Rodando agora'
                  : `Última execução ${dayjs(lastRun.startedAt).locale('pt-br').fromNow()}`}
              </button>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1">
          {!manual && (
            <Switch
              checked={job.enabled}
              onCheckedChange={onToggle}
              aria-label={
                job.enabled ? 'Pausar agendamento' : 'Ativar agendamento'
              }
              className="mr-2"
            />
          )}
          <Button
            size="sm"
            onClick={onRun}
            disabled={lastRun?.status === 'running'}
          >
            <Play className="h-4 w-4" />
            Rodar
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Editar"
            onClick={onEdit}
          >
            <Pencil className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Excluir"
            onClick={onDelete}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  )
}
