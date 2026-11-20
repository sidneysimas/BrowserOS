import { describe, expect, it } from 'bun:test'
import type { ScheduledJob } from '@/lib/schedules/scheduleTypes'
import {
  EMPTY_ROTINA_FORM,
  rotinaFormFromJob,
  rotinaFormSchema,
  rotinaFromForm,
} from './rotina-form'

const legacyJob: ScheduledJob = {
  id: 'job-1',
  name: 'Notícias',
  query: 'Resuma as notícias do dia',
  scheduleType: 'daily',
  scheduleTime: '08:00',
  enabled: true,
  providerId: 'prov-1',
  createdAt: '2026-11-20T00:00:00.000Z',
  updatedAt: '2026-11-20T00:00:00.000Z',
}

describe('rotinaFormSchema', () => {
  it('drops blank steps and requires at least one', () => {
    const result = rotinaFormSchema.safeParse({
      ...EMPTY_ROTINA_FORM,
      name: 'X',
      steps: [{ text: '  ' }],
    })
    expect(result.success).toBe(false)
  })

  it('requires defaults for inputs of scheduled rotinas only', () => {
    const base = {
      ...EMPTY_ROTINA_FORM,
      name: 'X',
      steps: [{ text: 'Consulte {{cpf}}' }],
    }
    expect(rotinaFormSchema.safeParse(base).success).toBe(true)
    expect(
      rotinaFormSchema.safeParse({ ...base, schedule: 'daily' }).success,
    ).toBe(false)
    expect(
      rotinaFormSchema.safeParse({
        ...base,
        schedule: 'daily',
        inputDefaults: { cpf: '123' },
      }).success,
    ).toBe(true)
  })

  it('validates the cadence', () => {
    const base = { ...EMPTY_ROTINA_FORM, name: 'X', steps: [{ text: 'a' }] }
    expect(
      rotinaFormSchema.safeParse({
        ...base,
        schedule: 'daily',
        scheduleTime: '9h',
      }).success,
    ).toBe(false)
    expect(
      rotinaFormSchema.safeParse({
        ...base,
        schedule: 'hourly',
        scheduleInterval: 0,
      }).success,
    ).toBe(false)
  })
})

describe('rotinaFromForm', () => {
  it('stores a manual rotina as a disabled job with a valid cadence', () => {
    const values = rotinaFormSchema.parse({
      ...EMPTY_ROTINA_FORM,
      name: ' CPF ',
      steps: [{ text: 'Consulte {{cpf}}' }, { text: '' }],
      inputDefaults: { cpf: '123', unused: 'x' },
      hosts: 'https://www.gov.br/x',
    })
    const { job, meta } = rotinaFromForm(values, null)
    expect(job.enabled).toBe(false)
    expect(job.scheduleType).toBe('daily')
    expect(job.name).toBe('CPF')
    expect(meta).toEqual({
      description: undefined,
      steps: ['Consulte {{cpf}}'],
      inputDefaults: { cpf: '123' },
      effects: 'read',
      hosts: ['www.gov.br'],
      manual: true,
    })
    expect(job.query).toContain('1. Consulte "123"')
  })

  it('keeps provider, last run and enabled state of an edited job', () => {
    const values = rotinaFormSchema.parse(
      rotinaFormFromJob(legacyJob, undefined),
    )
    const { job } = rotinaFromForm(values, legacyJob)
    expect(job.providerId).toBe('prov-1')
    expect(job.enabled).toBe(true)
    expect(job.scheduleTime).toBe('08:00')
  })
})

describe('rotinaFormFromJob', () => {
  it('turns a plain scheduled task into a one-step write rotina', () => {
    const form = rotinaFormFromJob(legacyJob, undefined)
    expect(form.steps).toEqual([{ text: 'Resuma as notícias do dia' }])
    expect(form.effects).toBe('write')
    expect(form.schedule).toBe('daily')
  })
})
