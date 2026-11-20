import { z } from 'zod/v3'
import {
  compileRotinaPrompt,
  extractInputNames,
  parseHosts,
  type RotinaMeta,
} from '@/lib/rotinas/rotinas'
import type { ScheduledJob } from '@/lib/schedules/scheduleTypes'

/**
 * Form model for the Rotina editor and its mapping to the two places a rotina
 * is stored: the upstream scheduled-job row (server) and RotinaMeta (extension
 * storage). Kept pure so the mapping is unit-tested without rendering.
 */

const HH_MM = /^([01]\d|2[0-3]):[0-5]\d$/

export const rotinaFormSchema = z
  .object({
    name: z.string().trim().min(1, 'Dê um nome à rotina').max(80),
    description: z.string().trim().max(500).optional(),
    steps: z
      .array(z.object({ text: z.string() }))
      .transform((steps) => steps.filter((step) => step.text.trim()))
      .refine((steps) => steps.length > 0, 'Escreva pelo menos um passo'),
    inputDefaults: z.record(z.string()),
    effects: z.enum(['read', 'write']),
    hosts: z.string(),
    schedule: z.enum(['manual', 'daily', 'hourly', 'minutes']),
    scheduleTime: z.string(),
    scheduleInterval: z.coerce.number(),
  })
  .superRefine((values, ctx) => {
    if (values.schedule === 'daily' && !HH_MM.test(values.scheduleTime)) {
      ctx.addIssue({
        code: 'custom',
        path: ['scheduleTime'],
        message: 'Use o formato HH:MM',
      })
    }
    if (
      (values.schedule === 'hourly' || values.schedule === 'minutes') &&
      !(
        Number.isInteger(values.scheduleInterval) &&
        values.scheduleInterval >= 1 &&
        values.scheduleInterval <= 60
      )
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['scheduleInterval'],
        message: 'Um número inteiro de 1 a 60',
      })
    }
    // Scheduled runs have nobody to type the inputs, so each needs a default.
    if (values.schedule !== 'manual') {
      const missing = extractInputNames(
        values.steps.map((step) => step.text),
      ).filter((name) => !values.inputDefaults[name]?.trim())
      if (missing.length > 0) {
        ctx.addIssue({
          code: 'custom',
          path: ['schedule'],
          message: `Rotinas agendadas precisam de valor padrão para: ${missing.join(', ')}`,
        })
      }
    }
  })

export type RotinaFormInput = z.input<typeof rotinaFormSchema>
export type RotinaFormValues = z.output<typeof rotinaFormSchema>

export const EMPTY_ROTINA_FORM: RotinaFormInput = {
  name: '',
  description: '',
  steps: [{ text: '' }],
  inputDefaults: {},
  effects: 'read',
  hosts: '',
  schedule: 'manual',
  scheduleTime: '09:00',
  scheduleInterval: 1,
}

/** Form values for an existing job. A job without metadata is a plain upstream
 * scheduled task: its prompt becomes the single step, and it is treated as
 * 'write' so editing it never loosens what it was allowed to do unattended. */
export function rotinaFormFromJob(
  job: ScheduledJob,
  meta: RotinaMeta | undefined,
): RotinaFormInput {
  const manual = meta?.manual ?? false
  return {
    name: job.name,
    description: meta?.description ?? '',
    steps: (meta?.steps ?? [job.query]).map((text) => ({ text })),
    inputDefaults: meta?.inputDefaults ?? {},
    effects: meta?.effects ?? 'write',
    hosts: (meta?.hosts ?? []).join(', '),
    schedule: manual ? 'manual' : job.scheduleType,
    scheduleTime: job.scheduleTime ?? '09:00',
    scheduleInterval: job.scheduleInterval ?? 1,
  }
}

/** Splits validated form values into the job row and the rotina metadata. */
export function rotinaFromForm(
  values: RotinaFormValues,
  existing: ScheduledJob | null,
): {
  job: Omit<ScheduledJob, 'id' | 'createdAt' | 'updatedAt'>
  meta: RotinaMeta
} {
  const steps = values.steps.map((step) => step.text.trim())
  const used = extractInputNames(steps)
  const meta: RotinaMeta = {
    description: values.description?.trim() || undefined,
    steps,
    inputDefaults: Object.fromEntries(
      used
        .map((name) => [name, values.inputDefaults[name]?.trim() ?? ''])
        .filter(([, value]) => value),
    ),
    effects: values.effects,
    hosts: parseHosts(values.hosts),
    manual: values.schedule === 'manual',
  }
  const name = values.name.trim()
  return {
    meta,
    job: {
      name,
      // What alarms run: the unattended prompt with default inputs.
      query: compileRotinaPrompt(name, meta, 'scheduled'),
      // Manual rotinas keep a valid cadence for the server but stay disabled,
      // which is what keeps the background from creating an alarm.
      scheduleType: values.schedule === 'manual' ? 'daily' : values.schedule,
      scheduleTime: values.scheduleTime,
      scheduleInterval: values.scheduleInterval,
      enabled: meta.manual ? false : (existing?.enabled ?? true),
      providerId: existing?.providerId,
      lastRunAt: existing?.lastRunAt,
    },
  }
}
