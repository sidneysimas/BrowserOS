import { describe, expect, it } from 'bun:test'
import {
  compileRotinaPrompt,
  describeSchedule,
  extractInputNames,
  parseHosts,
  type RotinaMeta,
} from './rotinas'

const meta: RotinaMeta = {
  description: 'Confere a situação de um CNPJ.',
  steps: [
    'Abra a consulta de CNPJ da Receita',
    'Pesquise o CNPJ {{cnpj}} da empresa {{ Empresa }}',
    'Anote a situação cadastral de {{cnpj}}',
  ],
  inputDefaults: { cnpj: '00.000.000/0001-00' },
  effects: 'read',
  hosts: ['solucoes.receita.fazenda.gov.br'],
  manual: true,
}

describe('extractInputNames', () => {
  it('lists each {{input}} once, lowercased, in first-use order', () => {
    expect(extractInputNames(meta.steps)).toEqual(['cnpj', 'empresa'])
  })
})

describe('compileRotinaPrompt', () => {
  it('numbers the steps and fills inputs, leaving unknown ones visible', () => {
    const prompt = compileRotinaPrompt('CNPJ', meta, 'manual')
    expect(prompt).toContain('1. Abra a consulta de CNPJ da Receita')
    expect(prompt).toContain(
      '2. Pesquise o CNPJ "00.000.000/0001-00" da empresa {{ Empresa }}',
    )
    expect(prompt).toContain(
      'Use apenas estes sites: solucoes.receita.fazenda.gov.br',
    )
    expect(prompt).toContain('só consulta informações')
  })

  it('uses the values typed for the run over the defaults', () => {
    const prompt = compileRotinaPrompt('CNPJ', meta, 'manual', {
      cnpj: '11.111.111/0001-11',
      empresa: 'ACME',
    })
    expect(prompt).toContain('"11.111.111/0001-11" da empresa "ACME"')
  })

  it('forbids committing write actions when nobody is watching', () => {
    const write = { ...meta, effects: 'write' as const }
    expect(compileRotinaPrompt('X', write, 'scheduled')).toContain(
      'NÃO envie, publique, pague',
    )
    expect(compileRotinaPrompt('X', write, 'manual')).toContain(
      'pare e peça minha confirmação',
    )
  })

  it('omits the site rule when no hosts are set', () => {
    const prompt = compileRotinaPrompt('X', { ...meta, hosts: [] }, 'manual')
    expect(prompt).not.toContain('Use apenas estes sites')
  })
})

describe('describeSchedule', () => {
  it('describes every cadence in pt-BR', () => {
    const base = { scheduleType: 'daily' as const, scheduleTime: '09:00' }
    expect(describeSchedule(base, true)).toBe('Manual')
    expect(describeSchedule(base, false)).toBe('Todo dia às 09:00')
    expect(
      describeSchedule({ scheduleType: 'hourly', scheduleInterval: 2 }, false),
    ).toBe('A cada 2 horas')
    expect(
      describeSchedule({ scheduleType: 'minutes', scheduleInterval: 1 }, false),
    ).toBe('A cada minuto')
  })
})

describe('parseHosts', () => {
  it('accepts hosts or urls separated by commas, spaces or lines', () => {
    expect(
      parseHosts('https://www.gov.br/x, Jusbrasil.com.br\nwww.gov.br ;'),
    ).toEqual(['www.gov.br', 'jusbrasil.com.br'])
  })
})
