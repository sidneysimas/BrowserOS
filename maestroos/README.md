# MaestroOS

MaestroOS é um fork do [BrowserOS](https://github.com/browseros-ai/BrowserOS) com marca própria.
O navegador é o mesmo. Mudam o nome, o logo, a extensão do agente (assinada com uma chave
própria) e as atualizações automáticas, que ficam desligadas.

O BrowserOS é licenciado sob AGPL-3.0, e a mesma licença vale para este fork. Quem distribui
o MaestroOS precisa disponibilizar o código-fonte das modificações (este repositório) e manter
os créditos ao projeto original.

## O que difere do BrowserOS

| Área | Mudança | Onde |
|---|---|---|
| Nome | Produto, empresa e instalador se chamam "MaestroOS" | `packages/browseros/bos_build/products/browseros/product.py`, `packages/browseros/chromium_files/products/browseros/**/BRANDING*` e `branding.gni` |
| Instalação no Windows | Pasta e perfil em `%LOCALAPPDATA%\MaestroOS`, nome do app e tipos de arquivo | `packages/browseros/chromium_patches/chrome/install_static/chromium_install_modes.h` |
| Logo | Ícones do navegador gerados a partir de `app_icon.png` | `packages/browseros/bos_build/scripts/icon_generation/source/app_icon.png` e `packages/browseros/resources/browseros/icons/` |
| Extensão do agente | Assinada com chave própria, com ID `fnjlkojakafednoamkkhgbibdgpckjmc`, sem `update_url` | `apps/app/wxt.config.ts`, `core/products.py`, `browseros_constants.h`, `bundled_extensions/BUILD.gn` |
| Servidor local | O navegador passa `BROWSEROS_TRUSTED_ORIGINS` com o novo ID, porque o servidor baixado do CDN só conhece o ID original | `chromium_patches/chrome/browser/browseros/server/server_process_launcher_win.cc` |
| Interface | Logo do robô, textos "MaestroOS" e banners do "BrowserOS neo" ocultos | `packages/browseros-agent/apps/app` e `apps/app-onboard` |
| Atualizações | O WinSparkle fica sempre desligado, para o appcast oficial não instalar o BrowserOS por cima | `chromium_patches/chrome/browser/win/winsparkle_glue.cc` |
| Servidor de IA | Compilado deste repositório sem chaves de telemetria e com o atualizador desligado, para o CDN não trocá-lo pela versão do upstream | `scripts/build/server/descriptor.ts` (`BROWSEROS_SERVER_TELEMETRY_OFF=1`) e `chromium_patches/.../server/browseros_server_config.cc` |
| Telemetria do navegador | Métricas (PostHog) sem chave, ou seja, desligadas. Relatórios de crash não são enviados, porque a URL é o Sentry do upstream | `chromium_patches/.../metrics/browseros_metrics_service.cc` e `chromium_patches/chrome/app/chrome_crash_reporter_client_win.cc` |
| Kits por setor | Escolha do kit na primeira execução, "Seus sites" na nova aba, comandos `m <palavra>` na barra de endereço e a tela Meu kit | `apps/app/lib/kits`, `screens/onboarding-kit`, `screens/my-kit`, `entrypoints/background/omniboxCommands.ts` |
| Rotinas | Substituem a página de tarefas agendadas (`/scheduled` redireciona para `/rotinas`). Passos, entradas e modo ficam na extensão, sem migração no banco do servidor | `apps/app/lib/rotinas`, `screens/rotinas`. A página antiga continua no código e é declarada como entrada no `.fallowrc.json`, para os merges com o upstream não gerarem conflito |
| Versão mínima do Chromium | `BROWSEROS_RELEASE_MIN_CHROMIUM_VERSION` = 155.0.8059.26 | `bos_build/config/` |
| Build | A etapa `bundled_extensions` aceita `codebase="file://..."` para usar um CRX local | `bos_build/steps/extensions/bundled_extensions.py` |
| Ambiente de desenvolvimento | O supervisor `tools/dev` funciona no Windows | `packages/browseros-agent/tools/dev` |

## A chave da extensão (importante)

O ID da extensão do agente é derivado da chave `agent_key.pem`, que **não está no repositório**.
Por padrão ela fica em `E:\chromium\keys\agent_key.pem`.

- **Faça backup em pelo menos dois lugares seguros, fora deste PC.**
- Se a chave se perder, a próxima versão terá outro ID. O navegador passa a tratá-la como outra
  extensão, e os usuários perdem configurações e histórico do assistente.
- Nunca faça commit da chave.

Para gerar uma chave nova (somente em um fork novo, nunca para substituir uma chave perdida em
produção):

```bash
openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out agent_key.pem
```

Depois disso, o novo ID precisa ser trocado em todos os lugares da tabela acima, e a chave
pública (`key`) atualizada em `wxt.config.ts`.

## Pré-requisitos (Windows)

- **Espaço:** cerca de 120 GB livres no disco do Chromium (padrão `E:\chromium`).
- **Visual Studio 2022:** com a carga "Desenvolvimento para desktop com C++" e o Windows SDK.
- **depot_tools:** em `E:\chromium\depot_tools`.
- **Ferramentas:**
  - Git for Windows (o script roda no Git Bash)
  - `uv` (instala o Python 3.12 sozinho)
  - Bun (`winget install Oven-sh.Bun`)
- **Checkout do Chromium em `E:\chromium\src`:** o comando `browseros source ensure` cria e
  mantém o checkout.

## Como compilar

No Git Bash, a partir da raiz do repositório:

```bash
bash maestroos/build.sh
```

O script:

1. baixa do CDN público os binários do servidor e o onboarding base (só na primeira vez);
2. compila o servidor de IA sem telemetria e o coloca no lugar do binário do CDN. Só o
   `third_party/bun.exe` continua vindo do CDN;
3. compila a extensão e o onboarding a partir deste repositório;
4. assina o CRX e confere se o ID bate com o do produto;
5. sincroniza a fonte do Chromium e compila. **Esta etapa leva de 3 a 4 horas.**

Saída: `packages/browseros/releases/<versão>/MaestroOS_v<versão>_x64_installer.exe`, e um log
completo se você redirecionar a saída (`bash maestroos/build.sh > build.log 2>&1`).

Para testar mudanças só na extensão ou no onboarding, sem compilar o Chromium:

```bash
bash maestroos/build.sh --prepare-only
```

### Variáveis opcionais

| Variável | Padrão | Uso |
|---|---|---|
| `CHROMIUM_ROOT` | `E:/chromium` | Raiz com `src/` e `depot_tools/` |
| `MAESTRO_AGENT_KEY` | `$CHROMIUM_ROOT/keys/agent_key.pem` | Chave da extensão |
| `MAESTRO_WORK` | `$CHROMIUM_ROOT/custom_ext` | Onde o CRX e o manifesto local são gerados |
| `CHROME_BINARY` | `chrome.exe` do último build | Navegador usado para assinar o CRX |

## Instalação e teste

1. Rode o instalador. Como ele não está assinado, o SmartScreen avisa: clique em
   **Mais informações → Executar assim mesmo**.
2. Confira:
   - o ícone do robô no atalho e na barra de tarefas;
   - o nome "MaestroOS" no título da janela, na tela "Sobre" e na barra lateral;
   - "Welcome to MaestroOS" no onboarding;
   - se o assistente de IA responde, o que confirma que o servidor aceitou o novo ID.

## Limitações conhecidas

- **Instalador sem assinatura.** O SmartScreen avisa até o instalador ser assinado.
- **Sem atualizações automáticas.** Novas versões precisam ser instaladas manualmente.
- **Dependências do upstream.** A nova aba e o agente usam APIs do `browseros.com`, e a lista
  remota de extensões vem de `cdn.browseros.com`.
- **Telemetria.** Está toda desligada (navegador, servidor e extensão), e não há relatórios de
  crash nem métricas. Para ter os seus próprios:
  - **Métricas:** coloque a chave do seu projeto PostHog em `kBrowserOSPostHogApiKey`.
  - **Crashes:** troque `kSentryMinidumpUrl` pelo seu projeto Sentry e devolva
    `GetCollectStatsConsent()` ao padrão do Chromium.
  - **Servidor:** compile sem `BROWSEROS_SERVER_TELEMETRY_OFF` e com `POSTHOG_API_KEY` e
    `SENTRY_DSN` próprios.
- **Idioma.** A interface da extensão está em inglês.
- **Testes de `bundled_extensions`.** Dois testes desse step comparam com o manifesto oficial do
  CDN e falham neste fork, como esperado.

## Atualizando a partir do BrowserOS

```bash
git remote add upstream https://github.com/browseros-ai/BrowserOS.git   # só na primeira vez
git fetch upstream
git merge upstream/main
```

Conflitos costumam aparecer nos arquivos da tabela "O que difere do BrowserOS". Mantenha sempre
o nosso ID da extensão, o nome MaestroOS e o updater desligado. Depois do merge, rode
`bash maestroos/build.sh`.
