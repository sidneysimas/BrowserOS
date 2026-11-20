# Desenho: Kits por setor e Rotinas

Status: aprovado em 2026-11-20. Fases 1 (kits), 2 (comandos `m` e tela Meu kit) e 3 (Rotinas escritas) implementadas; nome escolhido: "Rotinas"; telas novas em pt-BR.

As duas funções ficam quase inteiras na extensão do agente (`packages/browseros-agent/apps/app`)
e no servidor local (`apps/server`). Nenhuma delas exige patch no Chromium. Para desenvolver,
basta carregar a extensão sem empacotar. Para distribuir, é preciso rodar `maestroos/build.sh`,
porque o CRX vai embutido no instalador.

Os caminhos abaixo são relativos a `packages/browseros-agent/`.

---

## 1. Kits por setor

### Ideia

Um kit é um pacote de configuração pensado para um público. Na primeira execução, o usuário
escolhe um kit, e o MaestroOS já abre pronto para o trabalho dele. Depois, ele pode trocar de
kit ou editar qualquer item.

Sugestão de kits para a v1:

| Kit | Público |
|---|---|
| Essencial | Uso geral, pessoal e escritório |
| Jurídico | Advocacia, tribunais, órgãos públicos |
| Saúde | Clínicas e consultórios |
| Educação | Professores e escolas |
| Comércio | Lojas, e-commerce, MEI |

### O que um kit contém

```jsonc
{
  "id": "juridico",
  "version": 1,
  "name": "Jurídico",
  "description": "Tribunais, diários oficiais e rotinas de processo",
  "icon": "scale",
  // Fixed tiles on the new tab, shown before the recent sites.
  "sites": [
    { "title": "Consulta processual", "url": "https://..." }
  ],
  // Address bar commands: "m proc 123" opens the url with {q} replaced.
  "commands": [
    { "keyword": "proc", "title": "Processo", "url": "https://...?numero={q}" }
  ],
  // Pre-filled "Personalize" text, injected into the agent's system prompt.
  "personalization": "Sou advogado(a). Prefiro respostas objetivas, com base legal...",
  // Rotina templates offered on first run (section 2).
  "rotinas": [ /* Rotina */ ],
  // Optional modules turned on by this kit.
  "modules": ["evidence", "page-watch"]
}
```

Os kits ficam em `apps/app/lib/kits/kits.ts`, como código TypeScript tipado. O exemplo JSON acima
mostra o formato completo. Hoje existem `sites`, `commands` e `personalization`. `rotinas` e `modules`
entram nas fases seguintes.

### Onde cada item se encaixa no código existente

| Item do kit | Onde entra | O que já existe |
|---|---|---|
| Escolha do kit | Novo passo em `screens/onboarding-ai/OnboardingAiPage.tsx` (`/onboarding/ai`), antes de escolher o provedor de IA | A página de primeira execução já existe e grava em `chrome.storage` |
| Kit ativo | `lib/kits/kitStorage.ts` (`local:maestroKit`, que guarda id, versão e itens editados pelo usuário) | Mesmo padrão de `lib/onboarding/onboardingStorage.ts` |
| `sites` | Novo componente `PinnedSites` na nova aba (`screens/agent-command/AgentCommandHome.tsx`), antes de `RecentSites` | `RecentSites` vem só de `chrome.topSites`, e hoje não há blocos fixos |
| `commands` | API `chrome.omnibox` com a palavra-chave `m`. O usuário digita `m proc 123` e cai no site certo | Não existe nada parecido. Funciona sem mexer no Chromium |
| `personalization` | Preenche `local:personalization` quando o campo está vazio. Nunca sobrescreve o que o usuário já escreveu | `lib/personalization/personalizationStorage.ts` já é injetado no prompt (`apps/server/src/agent/prompt.ts`) |
| `rotinas` | Cria as rotinas-modelo no servidor (seção 2) | Tabela `scheduled_jobs` no SQLite do servidor |
| `modules` | Liga recursos opcionais, como Modo Evidência e Vigia de páginas, que ficam para fases futuras | — |

### Trocar de kit e editar

- Em Configurações, uma nova tela "Meu kit" permite:
  - trocar de kit;
  - adicionar, remover ou reordenar sites e comandos;
  - restaurar o padrão do kit.
- Trocar de kit **soma** os itens do novo kit e marca a origem de cada um. Nada que o usuário
  criou é apagado.

### Empresas: kit definido pelo TI

O manifesto da extensão passa a declarar `storage.managed_schema`. Assim o TI define o kit por
política do Windows (registro ou GPO), sem recompilar:

```
HKLM\Software\Policies\MaestroOS\3rdparty\extensions\fnjlkojakafednoamkkhgbibdgpckjmc\policy
  kit            = "juridico"
  kitLocked      = 1          ; o usuário não pode trocar de kit
  extraSites     = JSON
  extraCommands  = JSON
```

> O caminho exato da chave de política depende do nome de política do produto no Chromium
> (`policy_path`). Confirmar no build antes de documentar para clientes.

Os itens que vêm de `chrome.storage.managed` aparecem com um cadeado e não podem ser removidos.
Para favoritos travados na barra, o Chromium já oferece a política `ManagedBookmarks`, e não é
preciso código.

---

## 2. Rotinas

### Ideia

Uma rotina é uma tarefa que o assistente sabe repetir, com nome, entradas, passos e
(opcionalmente) horário. O objetivo é que qualquer pessoa automatize uma rotina **sem
escrever prompt**: ela mostra uma vez como se faz, e o MaestroOS aprende.

Exemplos:
- "Baixar as notas fiscais do mês no portal X e salvar na pasta Y"
- "Toda segunda, consultar estes 10 processos e me resumir o que mudou"
- "Publicar este texto no Instagram e no LinkedIn"

### O ponto de partida: tarefas agendadas

O assistente já tem tarefas agendadas:

- **Tipo:** `ScheduledJob` em `lib/schedules/scheduleTypes.ts`.
- **Armazenamento:** SQLite em `apps/server/src/lib/db/schema/scheduled-jobs.ts`.
- **Disparo:** `chrome.alarms` em `entrypoints/background/scheduledJobRuns.ts`.
- **Execução:** chat normal com o agente (`lib/schedules/getChatServerResponse.ts`).
- **Histórico:** `ScheduledJobRun`, com o log de ferramentas usadas.

Mas hoje a tarefa é **só um prompt**: não tem passos, entradas, execução manual nem gravação. A
rotina estende esse modelo, em vez de criar outro.

### Modelo de dados

> **Implementado de outro jeito:** em vez de colunas novas em `scheduled_jobs`, os campos da
> rotina ficam na extensão (`local:rotinas`, por id da tarefa). Uma migração própria colidiria
> com as migrações futuras do upstream, porque o Drizzle aplica por data e pularia migrações
> mais antigas que a nossa. O `query` da tarefa recebe o prompt já montado, então os alarmes
> seguem funcionando pelo caminho original. Veja `apps/app/lib/rotinas/rotinas.ts`.

O formato lógico continua o descrito abaixo.

```ts
interface Rotina extends ScheduledJob {
  description?: string
  // Natural-language steps the agent follows in order, adapting when a page changes.
  steps?: string[]
  // Values asked before each run and substituted as {{name}} in steps.
  inputs?: { name: string; label: string; default?: string }[]
  // Sites the rotina may touch; the agent is told to stay inside them.
  hosts?: string[]
  // 'read' only reads/copies; 'write' submits forms, posts, pays. Write requires confirmation.
  effects: 'read' | 'write'
  scheduleType: 'manual' | 'daily' | 'hourly' | 'minutes'   // 'manual' is new
  origin: 'recorded' | 'manual' | 'kit'
  kitId?: string
}
```

Na execução, `getChatServerResponse` monta o prompt a partir de `steps` + `inputs` (com as
entradas já substituídas), em vez de usar `query`. O resto da execução e do histórico não
muda.

### Como o usuário cria uma rotina

**A. Gravando ("ensine uma vez")**, que é o diferencial:

1. No painel lateral, o usuário clica em **Gravar rotina**.
2. Ele faz a tarefa normalmente. Um *content script* registra **ações com significado**, não o
   DOM inteiro:
   - navegou para a URL;
   - clicou no botão "Emitir boleto";
   - digitou no campo "CPF";
   - baixou um arquivo.

   Cada ação guarda o texto visível, o papel e o rótulo do elemento, para o agente achá-lo de
   novo mesmo se o layout mudar.
3. Campos de senha e cartão são mascarados **na captura** e nunca saem da aba.
4. Ao parar, o assistente transforma a gravação em passos em português e propõe as entradas.
   Por exemplo, o CPF digitado vira a entrada `{{cpf}}`.
5. O usuário revisa, edita, dá nome e, se quiser, agenda.

**B. Escrevendo:** um formulário com nome, passos e entradas, para quem prefere.

**C. Do kit:** os modelos do kit escolhido aparecem prontos para ajustar.

**D. Sugerida pelo assistente:** a ferramenta `suggest_schedule`
(`apps/server/src/agent/nudge-tools.ts`) já sugere agendar uma tarefa depois de uma conversa.
Ela pode passar a sugerir "salvar como rotina".

### Reaproveitamento do produto "claw" do upstream

O repositório tem outro produto (`apps/claw-app` + `apps/claw-server`, em Rust) que já resolve
partes disto. A ideia é usá-lo como referência, sem depender dele:

| Peça | Onde está | Uso |
|---|---|---|
| Gravador com máscara de campos | `apps/claw-app/entrypoints/recorder.content.ts`, `modules/recorder/recorder-mask.ts` | Base da máscara. A gravação lá é rrweb (DOM completo, feita para assistir), e aqui queremos ações |
| Skills em `SKILL.md` com passos | `apps/claw-server/src/services/skills.rs` | Formato de exportação/importação de rotinas |
| Fluxos verificados com `effects` e consentimento | `apps/claw-server/src/services/flow/*` | O modelo `read`/`write`, com escrita desligada por padrão |

### Segurança

- Rotinas `write` pedem confirmação antes de cada ação de envio, como em `flow/consent`. O
  usuário pode liberar a confirmação só para execuções manuais, nunca para as agendadas, na v1.
- O agente recebe `hosts` e é instruído a não sair desses sites.
- Gravações brutas não são guardadas depois de virarem passos.
- Rotinas importadas de terceiros entram desativadas e mostram os passos antes de rodar.

### Telas

| Tela | Onde |
|---|---|
| Biblioteca de rotinas (rodar, editar, agendar, histórico) | Evolução de `screens/scheduled-tasks/*` (rota `/scheduled`), renomeada para "Rotinas" |
| Gravação (barra flutuante "Gravando… Parar") | Painel lateral + content script novo |
| Revisão pós-gravação | Diálogo novo, baseado em `NewScheduledTaskDialog` |
| Atalho na nova aba | `ScheduleResults` passa a mostrar também "Rotinas rápidas" |

---

## 3. Fases

| Fase | Entrega | Tamanho |
|---|---|---|
| 1 | Kits: schema, 5 kits iniciais, escolha na primeira execução, sites fixos na nova aba, personalização pré-preenchida | Pequeno |
| 2 | Comandos `m <palavra>` na barra e tela "Meu kit" | Pequeno |
| 3 | Rotinas escritas: modelo de dados, execução manual, entradas, biblioteca | Médio |
| 4 | Gravação "ensine uma vez" e conversão em passos | Grande |
| 5 | Kit por política (`managed_schema`), exportar/importar rotinas, rotinas nos kits | Médio |

As fases 1 a 3 já entregam um produto diferente do BrowserOS. A fase 4 (gravação) é a que mais
justifica o nome "Maestro".

## 4. Decisões em aberto

1. **Conteúdo dos kits.** A primeira versão está em `apps/app/lib/kits/kits.ts` e precisa
   da revisão de quem conhece cada público.
2. ~~Idioma~~: decidido, telas novas em pt-BR; tradução do restante numa fase própria.
3. ~~Nome~~: decidido, "Rotinas".
