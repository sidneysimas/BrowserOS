import type { ScheduledJob } from '@/lib/schedules/scheduleTypes'

/**
 * MaestroOS "Rotinas": repeatable tasks with ordered steps, named inputs and a
 * declared effect, built on top of upstream scheduled jobs (see
 * maestroos/docs/kits-e-rotinas.md).
 *
 * The server keeps the job row unchanged (name, cadence, provider and a
 * `query`). The rotina-specific fields live in extension storage keyed by the
 * job id (rotina-storage.ts), and this module compiles them into the prompt the
 * agent receives. On save, `query` is set to the scheduled-mode prompt with
 * default inputs, so alarms keep running through the upstream path even if the
 * extension metadata is lost; manual runs compile a fresh prompt with the
 * values typed for that run. No server migration is needed, which keeps the
 * fork clear of upstream's migration sequence.
 */

/** 'read' only looks things up; 'write' submits, posts, pays or deletes. */
export type RotinaEffect = 'read' | 'write'

export interface RotinaMeta {
  description?: string
  steps: string[]
  /** Default value per `{{input}}` name used in the steps. */
  inputDefaults: Record<string, string>
  effects: RotinaEffect
  /** Hosts the agent is told to stay on; empty means no restriction. */
  hosts: string[]
  /** Manual rotinas are stored as disabled jobs so no alarm is created. */
  manual: boolean
}

export type RotinaRunMode = 'scheduled' | 'manual'

const INPUT_PATTERN = /\{\{\s*([a-z0-9_]+)\s*\}\}/gi

/** Input names referenced as `{{name}}` in the steps, in first-use order. */
export function extractInputNames(steps: readonly string[]): string[] {
  const names: string[] = []
  for (const step of steps) {
    for (const match of step.matchAll(INPUT_PATTERN)) {
      const name = match[1].toLowerCase()
      if (!names.includes(name)) names.push(name)
    }
  }
  return names
}

function fillInputs(text: string, values: Record<string, string>): string {
  return text.replace(INPUT_PATTERN, (whole, name: string) => {
    const value = values[name.toLowerCase()]?.trim()
    return value ? `"${value}"` : whole
  })
}

/**
 * The prompt for one run. Scheduled runs have nobody watching, so a 'write'
 * rotina is told to prepare but never commit; manual runs from the side panel
 * can ask the user to confirm instead.
 */
export function compileRotinaPrompt(
  name: string,
  meta: RotinaMeta,
  mode: RotinaRunMode,
  values: Record<string, string> = meta.inputDefaults,
): string {
  const lines = [`Execute a rotina "${name}".`]
  if (meta.description?.trim()) lines.push(meta.description.trim())
  lines.push('', 'Siga estes passos, em ordem:')
  meta.steps.forEach((step, index) => {
    lines.push(`${index + 1}. ${fillInputs(step.trim(), values)}`)
  })

  lines.push('', 'Regras:')
  if (meta.hosts.length > 0) {
    lines.push(`- Use apenas estes sites: ${meta.hosts.join(', ')}.`)
  }
  if (meta.effects === 'read') {
    lines.push(
      '- Esta rotina só consulta informações: não envie formulários, não publique e não altere dados.',
    )
  } else if (mode === 'scheduled') {
    lines.push(
      '- Esta execução é automática e não há ninguém para confirmar: NÃO envie, publique, pague, assine nem apague nada. Deixe tudo preparado e liste o que ficou pendente de confirmação.',
    )
  } else {
    lines.push(
      '- Antes de qualquer ação que envie, publique, pague, assine ou apague algo, pare e peça minha confirmação.',
    )
  }
  lines.push(
    '- Se um site mudou e um passo não puder ser feito como descrito, adapte com bom senso e explique o que fez.',
    '',
    'Ao final, responda em português com um resumo do resultado.',
  )
  return lines.join('\n')
}

/** Short pt-BR description of when a rotina runs. */
export function describeSchedule(
  job: Pick<ScheduledJob, 'scheduleType' | 'scheduleTime' | 'scheduleInterval'>,
  manual: boolean,
): string {
  if (manual) return 'Manual'
  if (job.scheduleType === 'daily') return `Todo dia às ${job.scheduleTime}`
  const interval = job.scheduleInterval ?? 1
  if (job.scheduleType === 'hourly') {
    return interval === 1 ? 'A cada hora' : `A cada ${interval} horas`
  }
  return interval === 1 ? 'A cada minuto' : `A cada ${interval} minutos`
}

/** Hosts from free text ("a.com, https://b.com/x"), lowercased and unique. */
export function parseHosts(text: string): string[] {
  const hosts: string[] = []
  for (const raw of text.split(/[\s,;]+/)) {
    const entry = raw.trim()
    if (!entry) continue
    let host = entry
    try {
      host = new URL(entry.includes('://') ? entry : `https://${entry}`).host
    } catch {
      continue
    }
    host = host.toLowerCase()
    if (!hosts.includes(host)) hosts.push(host)
  }
  return hosts
}
