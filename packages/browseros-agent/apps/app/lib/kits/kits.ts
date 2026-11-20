/**
 * MaestroOS sector kits: the presets someone picks on first run so the browser
 * opens ready for their kind of work (see maestroos/docs/kits-e-partituras.md).
 *
 * A kit only seeds user-editable state, pinned new-tab sites and the
 * personalization text the agent reads as its user system prompt, so picking
 * or switching kits never locks anything or deletes what the user created.
 * Kits are compiled in rather than fetched, so they work offline and need no
 * server; bump `version` when a kit's content changes.
 */

export type KitId = 'essencial' | 'juridico' | 'saude' | 'educacao' | 'comercio'

export interface KitSite {
  title: string
  url: string
}

/** An address-bar shortcut: typing `m <keyword> <text>` opens `url` with
 * `{q}` replaced by the URL-encoded text. */
export interface KitCommand {
  keyword: string
  title: string
  url: string
}

export interface Kit {
  id: KitId
  version: number
  name: string
  description: string
  sites: KitSite[]
  commands: KitCommand[]
  /** Seeded into the Personalize text only when that text is still empty. */
  personalization: string
}

export const KITS: readonly Kit[] = [
  {
    id: 'essencial',
    version: 1,
    name: 'Essencial',
    description: 'Uso geral: e-mail, documentos, agenda e serviços do governo.',
    sites: [
      { title: 'Gmail', url: 'https://mail.google.com' },
      { title: 'Outlook', url: 'https://outlook.live.com' },
      { title: 'Google Drive', url: 'https://drive.google.com' },
      { title: 'Agenda', url: 'https://calendar.google.com' },
      { title: 'WhatsApp', url: 'https://web.whatsapp.com' },
      { title: 'gov.br', url: 'https://www.gov.br' },
    ],
    commands: [
      {
        keyword: 'g',
        title: 'Google',
        url: 'https://www.google.com/search?q={q}',
      },
      {
        keyword: 'maps',
        title: 'Google Maps',
        url: 'https://www.google.com/maps/search/{q}',
      },
      {
        keyword: 'yt',
        title: 'YouTube',
        url: 'https://www.youtube.com/results?search_query={q}',
      },
      {
        keyword: 'trad',
        title: 'Tradutor',
        url: 'https://translate.google.com/?sl=auto&tl=pt&text={q}',
      },
      {
        keyword: 'wiki',
        title: 'Wikipédia',
        url: 'https://pt.wikipedia.org/w/index.php?search={q}',
      },
    ],
    personalization: [
      '## Sobre mim',
      'Uso o navegador para trabalho de escritório e tarefas do dia a dia.',
      '',
      '## Como prefiro as respostas',
      '- Em português do Brasil, objetivas e com passos numerados quando houver ação a fazer.',
      '- Antes de enviar formulários, fazer compras ou apagar algo, peça minha confirmação.',
    ].join('\n'),
  },
  {
    id: 'juridico',
    version: 1,
    name: 'Jurídico',
    description:
      'Advocacia e setor público: tribunais, legislação e diários oficiais.',
    sites: [
      { title: 'Jusbrasil', url: 'https://www.jusbrasil.com.br' },
      { title: 'Legislação', url: 'https://www4.planalto.gov.br/legislacao' },
      { title: 'STF', url: 'https://portal.stf.jus.br' },
      { title: 'STJ', url: 'https://www.stj.jus.br' },
      { title: 'Comunica PJe', url: 'https://comunica.pje.jus.br' },
      { title: 'Diário Oficial', url: 'https://www.in.gov.br' },
    ],
    commands: [
      {
        keyword: 'jus',
        title: 'Jusbrasil',
        url: 'https://www.jusbrasil.com.br/busca?q={q}',
      },
      {
        keyword: 'stf',
        title: 'Jurisprudência do STF',
        url: 'https://jurisprudencia.stf.jus.br/pages/search?base=acordaos&queryString={q}',
      },
      {
        keyword: 'stj',
        title: 'Jurisprudência do STJ',
        url: 'https://scon.stj.jus.br/SCON/pesquisar.jsp?livre={q}',
      },
      {
        keyword: 'dou',
        title: 'Diário Oficial da União',
        url: 'https://www.in.gov.br/consulta/-/buscar/dou?q={q}',
      },
      {
        keyword: 'g',
        title: 'Google',
        url: 'https://www.google.com/search?q={q}',
      },
    ],
    personalization: [
      '## Sobre mim',
      'Trabalho na área jurídica (processos, prazos, pesquisa de legislação e jurisprudência).',
      '',
      '## Como prefiro as respostas',
      '- Em português do Brasil, com linguagem técnica e citando a base legal (lei, artigo, súmula).',
      '- Sempre informe a fonte e a data das informações; diga quando não tiver certeza.',
      '- Nunca protocole, envie ou assine nada sem minha confirmação explícita.',
    ].join('\n'),
  },
  {
    id: 'saude',
    version: 1,
    name: 'Saúde',
    description:
      'Clínicas e consultórios: bulas, normas, pesquisa e conselhos.',
    sites: [
      {
        title: 'Bulário Anvisa',
        url: 'https://consultas.anvisa.gov.br/#/bulario/',
      },
      { title: 'Ministério da Saúde', url: 'https://www.gov.br/saude' },
      { title: 'CFM', url: 'https://portal.cfm.org.br' },
      { title: 'DATASUS', url: 'https://datasus.saude.gov.br' },
      { title: 'BVS', url: 'https://bvsalud.org' },
      { title: 'PubMed', url: 'https://pubmed.ncbi.nlm.nih.gov' },
    ],
    commands: [
      {
        keyword: 'pubmed',
        title: 'PubMed',
        url: 'https://pubmed.ncbi.nlm.nih.gov/?term={q}',
      },
      {
        keyword: 'bvs',
        title: 'BVS',
        url: 'https://pesquisa.bvsalud.org/portal/?q={q}',
      },
      {
        keyword: 'g',
        title: 'Google',
        url: 'https://www.google.com/search?q={q}',
      },
    ],
    personalization: [
      '## Sobre mim',
      'Trabalho na área da saúde (atendimento, gestão de clínica ou pesquisa).',
      '',
      '## Como prefiro as respostas',
      '- Em português do Brasil, com termos técnicos e referências a fontes oficiais ou científicas.',
      '- Não invente doses ou condutas: cite a fonte e avise quando a informação precisa de validação clínica.',
      '- Dados de pacientes são sigilosos (LGPD): não os envie para sites de terceiros.',
    ].join('\n'),
  },
  {
    id: 'educacao',
    version: 1,
    name: 'Educação',
    description: 'Professores e escolas: aulas, BNCC, pesquisa acadêmica.',
    sites: [
      { title: 'Classroom', url: 'https://classroom.google.com' },
      { title: 'BNCC', url: 'https://basenacionalcomum.mec.gov.br' },
      { title: 'INEP', url: 'https://www.gov.br/inep' },
      { title: 'Lattes', url: 'https://lattes.cnpq.br' },
      { title: 'Google Acadêmico', url: 'https://scholar.google.com.br' },
      { title: 'Khan Academy', url: 'https://pt.khanacademy.org' },
    ],
    commands: [
      {
        keyword: 'scholar',
        title: 'Google Acadêmico',
        url: 'https://scholar.google.com.br/scholar?q={q}',
      },
      {
        keyword: 'khan',
        title: 'Khan Academy',
        url: 'https://pt.khanacademy.org/search?page_search_query={q}',
      },
      {
        keyword: 'wiki',
        title: 'Wikipédia',
        url: 'https://pt.wikipedia.org/w/index.php?search={q}',
      },
      {
        keyword: 'g',
        title: 'Google',
        url: 'https://www.google.com/search?q={q}',
      },
    ],
    personalization: [
      '## Sobre mim',
      'Trabalho com educação (planejamento de aulas, materiais, correção e pesquisa).',
      '',
      '## Como prefiro as respostas',
      '- Em português do Brasil, com linguagem clara e adequada à faixa etária quando eu informar.',
      '- Ao planejar aulas, relacione com as habilidades da BNCC.',
      '- Indique as fontes dos conteúdos sugeridos.',
    ].join('\n'),
  },
  {
    id: 'comercio',
    version: 1,
    name: 'Comércio',
    description: 'Lojas, e-commerce e MEI: impostos, CNPJ, entregas e vendas.',
    sites: [
      {
        title: 'Portal do Empreendedor',
        url: 'https://www.gov.br/empresas-e-negocios/pt-br/empreendedor',
      },
      {
        title: 'Simples Nacional',
        url: 'https://www8.receita.fazenda.gov.br/SimplesNacional/',
      },
      {
        title: 'Consulta CNPJ',
        url: 'https://solucoes.receita.fazenda.gov.br/Servicos/cnpjreva/cnpjreva_solicitacao.asp',
      },
      { title: 'Correios', url: 'https://rastreamento.correios.com.br' },
      { title: 'Sebrae', url: 'https://sebrae.com.br' },
      { title: 'Mercado Livre', url: 'https://www.mercadolivre.com.br' },
    ],
    commands: [
      {
        keyword: 'ml',
        title: 'Mercado Livre',
        url: 'https://lista.mercadolivre.com.br/{q}',
      },
      {
        keyword: 'preco',
        title: 'Google Shopping',
        url: 'https://www.google.com/search?tbm=shop&q={q}',
      },
      {
        keyword: 'maps',
        title: 'Google Maps',
        url: 'https://www.google.com/maps/search/{q}',
      },
      {
        keyword: 'g',
        title: 'Google',
        url: 'https://www.google.com/search?q={q}',
      },
    ],
    personalization: [
      '## Sobre mim',
      'Tenho ou trabalho em um negócio (vendas, estoque, atendimento, impostos).',
      '',
      '## Como prefiro as respostas',
      '- Em português do Brasil, práticas e com valores em reais (R$).',
      '- Ao comparar preços ou fornecedores, monte uma tabela.',
      '- Nunca finalize compras, pagamentos ou publicações sem minha confirmação.',
    ].join('\n'),
  },
]

export function findKit(id: string | null | undefined): Kit | undefined {
  return KITS.find((kit) => kit.id === id)
}
