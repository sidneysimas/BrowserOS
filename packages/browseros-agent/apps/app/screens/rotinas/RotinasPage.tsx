import { Plus, Workflow } from 'lucide-react'
import { type FC, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router'
import { toast } from 'sonner'
import { RunResultDialog } from '@/components/ai-elements/run-result-dialog'
import { NoProviderNotice } from '@/components/chat/NoProviderNotice'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { createBrowserOSAction } from '@/lib/chat-actions/types'
import { openSidePanelWithSearch } from '@/lib/messaging/sidepanel/openSidepanelWithSearch'
import {
  removeRotinaMeta,
  saveRotinaMeta,
  useRotinaMetas,
} from '@/lib/rotinas/rotina-storage'
import {
  compileRotinaPrompt,
  extractInputNames,
  type RotinaMeta,
} from '@/lib/rotinas/rotinas'
import type {
  ScheduledJob,
  ScheduledJobRun,
} from '@/lib/schedules/scheduleTypes'
import { sentry } from '@/lib/sentry/sentry'
import { useAcpAgents } from '@/modules/agents/agents.hooks'
import { useLlmProviders } from '@/modules/llm-providers/llm-providers.hooks'
import {
  useScheduledJobRuns,
  useScheduledJobs,
} from '@/modules/schedules/schedules.hooks'
import { ScheduledTaskResults } from '@/screens/scheduled-tasks/ScheduledTaskResults'
import { RotinaCard } from './RotinaCard'
import { RotinaDialog } from './RotinaDialog'
import { type RotinaRunTarget, RunRotinaDialog } from './RunRotinaDialog'
import { ROTINA_EXAMPLES } from './rotina-examples'
import {
  EMPTY_ROTINA_FORM,
  type RotinaFormInput,
  type RotinaFormValues,
  rotinaFormFromJob,
  rotinaFromForm,
} from './rotina-form'

/**
 * MaestroOS Rotinas: the library of repeatable tasks, replacing the upstream
 * Scheduled Tasks page in the navigation (/scheduled redirects here). It reads
 * the same scheduled jobs and runs, and pairs each job with its RotinaMeta
 * (lib/rotinas); jobs without metadata are shown as one-step rotinas.
 *
 * Manual runs pick a place: unattended runs go through the background runner
 * (history under "Resultados") with the unattended prompt, while write
 * rotinas open in the side panel so the user can confirm before anything is
 * sent.
 */
export const RotinasPage: FC = () => {
  const { jobs, addJob, editJob, toggleJob, removeJob, runJob } =
    useScheduledJobs()
  const { jobRuns, cancelJobRun } = useScheduledJobRuns()
  const metas = useRotinaMetas() ?? {}
  const { providers, isLoading: isLoadingProviders } = useLlmProviders()
  const { agents, settled: agentsSettled } = useAcpAgents()
  const noTarget =
    !isLoadingProviders &&
    agentsSettled &&
    providers.length === 0 &&
    agents.length === 0

  const [tab, setTab] = useState('rotinas')
  const [editor, setEditor] = useState<{
    job: ScheduledJob | null
    values: RotinaFormInput
  } | null>(null)
  const [running, setRunning] = useState<{
    job: ScheduledJob
    meta: RotinaMeta
  } | null>(null)
  const [deleteJob, setDeleteJob] = useState<ScheduledJob | null>(null)
  const [viewingRunId, setViewingRunId] = useState<string | null>(null)
  const viewingRun = viewingRunId
    ? (jobRuns.find((run) => run.id === viewingRunId) ?? null)
    : null

  // The agent's "schedule this" suggestion links here (via /scheduled) with
  // the task prefilled; it becomes a one-step rotina.
  const [searchParams, setSearchParams] = useSearchParams()
  const prefillHandled = useRef(false)
  useEffect(() => {
    if (prefillHandled.current) return
    if (searchParams.get('openDialog') !== 'true') return
    prefillHandled.current = true
    const scheduleType = searchParams.get('scheduleType')
    setEditor({
      job: null,
      values: {
        ...EMPTY_ROTINA_FORM,
        name: searchParams.get('name') ?? '',
        steps: [{ text: searchParams.get('query') ?? '' }],
        schedule:
          scheduleType === 'hourly' || scheduleType === 'minutes'
            ? scheduleType
            : 'daily',
        scheduleTime: searchParams.get('scheduleTime') ?? '09:00',
      },
    })
    setSearchParams({}, { replace: true })
  }, [searchParams, setSearchParams])

  const lastRunOf = (jobId: string) =>
    jobRuns
      .filter((run) => run.jobId === jobId)
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0]

  const handleSave = async (values: RotinaFormValues) => {
    const existing = editor?.job ?? null
    const { job, meta } = rotinaFromForm(values, existing)
    try {
      const id = existing ? existing.id : await addJob(job)
      if (existing) await editJob(existing.id, job)
      await saveRotinaMeta(id, meta)
      toast.success(existing ? 'Rotina salva' : 'Rotina criada')
    } catch (error) {
      sentry.captureException(error, {
        extra: { message: 'Failed to save rotina' },
      })
      toast.error('Não foi possível salvar a rotina. O MaestroOS está rodando?')
      throw error
    }
  }

  const startRun = async (
    job: ScheduledJob,
    meta: RotinaMeta,
    values: Record<string, string>,
    target: RotinaRunTarget,
  ) => {
    if (target === 'panel') {
      const prompt = compileRotinaPrompt(job.name, meta, 'manual', values)
      await openSidePanelWithSearch('open', {
        query: prompt,
        mode: 'agent',
        action: createBrowserOSAction({ mode: 'agent', message: prompt }),
      })
      return
    }
    // Unattended: nobody can confirm, so the scheduled-mode rules apply.
    const prompt = compileRotinaPrompt(job.name, meta, 'scheduled', values)
    void runJob(job.id, prompt)
    toast.success(`"${job.name}" começou. O resultado aparece em Resultados.`)
    setTab('resultados')
  }

  const handleRun = (job: ScheduledJob) => {
    const meta = metas[job.id]
    if (!meta) {
      // Plain upstream task: run its stored prompt exactly as before.
      void runJob(job.id)
      toast.success(`"${job.name}" começou. O resultado aparece em Resultados.`)
      setTab('resultados')
      return
    }
    if (extractInputNames(meta.steps).length > 0) {
      setRunning({ job, meta })
      return
    }
    void startRun(
      job,
      meta,
      meta.inputDefaults,
      meta.effects === 'write' ? 'panel' : 'background',
    )
  }

  const confirmDelete = async () => {
    if (!deleteJob) return
    await removeJob(deleteJob.id)
    await removeRotinaMeta(deleteJob.id)
    setDeleteJob(null)
  }

  return (
    <div className="fade-in slide-in-from-bottom-5 animate-in space-y-6 duration-500">
      <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
        <div className="flex flex-wrap items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[var(--accent-orange)]/10">
            <Workflow className="h-6 w-6 text-[var(--accent-orange)]" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="mb-1 font-semibold text-xl">Rotinas</h2>
            <p className="text-muted-foreground text-sm">
              Tarefas que o assistente repete por você: escreva os passos uma
              vez e rode quando quiser ou num horário.
            </p>
          </div>
          <Button
            onClick={() => setEditor({ job: null, values: EMPTY_ROTINA_FORM })}
          >
            <Plus className="h-4 w-4" />
            Nova rotina
          </Button>
        </div>
      </div>

      {noTarget && <NoProviderNotice variant="inline" />}

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="rotinas">Minhas rotinas</TabsTrigger>
          <TabsTrigger value="resultados">Resultados</TabsTrigger>
        </TabsList>

        <TabsContent value="rotinas" className="space-y-3">
          {jobs.length === 0 ? (
            <div className="rounded-xl border border-dashed p-6 text-center">
              <p className="font-medium">Nenhuma rotina ainda</p>
              <p className="mb-4 text-muted-foreground text-sm">
                Comece do zero ou a partir de um exemplo:
              </p>
              <div className="flex flex-wrap justify-center gap-2">
                {ROTINA_EXAMPLES.map((example) => (
                  <Button
                    key={example.title}
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setEditor({ job: null, values: example.form })
                    }
                  >
                    {example.title}
                  </Button>
                ))}
              </div>
            </div>
          ) : (
            jobs.map((job) => (
              <RotinaCard
                key={job.id}
                job={job}
                meta={metas[job.id]}
                lastRun={lastRunOf(job.id)}
                onRun={() => handleRun(job)}
                onEdit={() =>
                  setEditor({
                    job,
                    values: rotinaFormFromJob(job, metas[job.id]),
                  })
                }
                onDelete={() => setDeleteJob(job)}
                onToggle={(enabled) => void toggleJob(job.id, enabled)}
                onViewRun={(run: ScheduledJobRun) => setViewingRunId(run.id)}
              />
            ))
          )}
        </TabsContent>

        <TabsContent value="resultados">
          <ScheduledTaskResults
            onViewRun={(run) => setViewingRunId(run.id)}
            onCancelRun={(runId) => void cancelJobRun(runId)}
            onRetryRun={(jobId) => {
              const job = jobs.find((entry) => entry.id === jobId)
              if (job) handleRun(job)
            }}
          />
        </TabsContent>
      </Tabs>

      <RotinaDialog
        open={editor !== null}
        onOpenChange={(open) => !open && setEditor(null)}
        initialValues={editor?.values ?? null}
        isEditing={Boolean(editor?.job)}
        onSave={handleSave}
      />

      <RunRotinaDialog
        rotina={running ? { name: running.job.name, meta: running.meta } : null}
        onOpenChange={(open) => !open && setRunning(null)}
        onRun={async (values, target) => {
          if (running) await startRun(running.job, running.meta, values, target)
        }}
      />

      <RunResultDialog
        run={viewingRun}
        jobName={
          viewingRun
            ? jobs.find((job) => job.id === viewingRun.jobId)?.name
            : undefined
        }
        onOpenChange={(open) => !open && setViewingRunId(null)}
        onCancelRun={(runId) => void cancelJobRun(runId)}
        onRetryRun={(jobId) => {
          const job = jobs.find((entry) => entry.id === jobId)
          if (job) handleRun(job)
          setViewingRunId(null)
        }}
      />

      <AlertDialog
        open={deleteJob !== null}
        onOpenChange={(open) => !open && setDeleteJob(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir rotina</AlertDialogTitle>
            <AlertDialogDescription>
              Excluir "{deleteJob?.name}"? O histórico de execuções também será
              apagado.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete}>
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
