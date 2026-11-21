# Privacidade

Este texto descreve o que o MaestroOS faz com os seus dados, de acordo com o código desta versão.

## O que fica no seu computador

- Histórico, favoritos, senhas e dados de navegação, como em qualquer navegador baseado no
  Chromium.
- Conversas com o assistente, rotinas, kit escolhido, "Seus sites" e comandos.
- Chaves de API e logins dos provedores de IA.

Tudo isso fica em `%LOCALAPPDATA%\MaestroOS\User Data`. Não existe conta MaestroOS e nada disso
é enviado a um servidor nosso.

## O que é enviado

- **Para o provedor de IA que você escolheu:** quando você usa o assistente ou roda uma rotina,
  o seu pedido e o conteúdo das páginas necessárias para a tarefa (texto, e às vezes uma captura
  de tela) vão para esse provedor. O tratamento desses dados segue a política de privacidade
  dele. Com um modelo local (Ollama, LM Studio), nada sai do computador.
- **Para os sites que você visita:** como em qualquer navegador.

## O que o MaestroOS não faz

- **Sem telemetria:** não envia métricas de uso, nem relatórios de erro.
- **Sem atualização automática:** o navegador não baixa nada sozinho para se atualizar.
- **Sem integrações de terceiros por padrão:** as integrações prontas com Gmail, Slack e outros
  apps do BrowserOS passavam por um servidor externo e estão desligadas.

## Recursos que dependem do Chromium

O MaestroOS herda do Chromium recursos como verificação de ortografia e Navegação Segura. Eles
podem consultar serviços do Google, conforme as configurações de privacidade do navegador
(`chrome://settings/privacy`).
