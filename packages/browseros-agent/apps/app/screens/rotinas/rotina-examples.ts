import type { RotinaFormInput } from './rotina-form'

/** Starter rotinas shown on the empty Rotinas page. Sector-specific ones will
 * come from the kits (lib/kits) in a later phase. */
export const ROTINA_EXAMPLES: { title: string; form: RotinaFormInput }[] = [
  {
    title: 'Resumo diário de notícias',
    form: {
      name: 'Resumo diário de notícias',
      description: 'As notícias mais relevantes do dia sobre um tema.',
      steps: [
        { text: 'Pesquise as notícias de hoje sobre {{tema}}' },
        { text: 'Escolha as 5 mais relevantes, de fontes confiáveis' },
        { text: 'Resuma cada uma em até duas linhas, com o link' },
      ],
      inputDefaults: { tema: 'o meu setor de trabalho' },
      effects: 'read',
      hosts: '',
      schedule: 'daily',
      scheduleTime: '08:00',
      scheduleInterval: 1,
    },
  },
  {
    title: 'Comparar preços',
    form: {
      name: 'Comparar preços',
      description: 'Encontra o menor preço de um produto.',
      steps: [
        {
          text: 'Pesquise o preço de {{produto}} no Google Shopping e no Mercado Livre',
        },
        { text: 'Monte uma tabela com loja, preço, frete e link' },
        { text: 'Destaque a opção mais barata considerando o frete' },
      ],
      inputDefaults: {},
      effects: 'read',
      hosts: '',
      schedule: 'manual',
      scheduleTime: '09:00',
      scheduleInterval: 1,
    },
  },
  {
    title: 'Preencher um formulário',
    form: {
      name: 'Preencher formulário',
      description: 'Preenche um formulário web com os dados informados.',
      steps: [
        { text: 'Abra o endereço {{site}}' },
        { text: 'Preencha o formulário com estes dados: {{dados}}' },
        { text: 'Revise os campos e me mostre o resumo antes de enviar' },
      ],
      inputDefaults: {},
      effects: 'write',
      hosts: '',
      schedule: 'manual',
      scheduleTime: '09:00',
      scheduleInterval: 1,
    },
  },
]
