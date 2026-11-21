# Problemas de conexão

O assistente conversa com um servidor que roda no seu próprio computador, e esse servidor
conversa com o provedor de IA. Um erro de conexão pode vir de qualquer um dos dois lados.

## "Unable to connect to MaestroOS agent"

O servidor local não respondeu.

1. Abra **Configurações → MaestroOS as MCP** e clique em reiniciar o servidor.
2. Se não resolver, feche **todas** as janelas do MaestroOS e abra de novo.
3. Antivírus ou firewall podem bloquear o `browseros_server.exe`, que fica na pasta de instalação
   do MaestroOS. Libere-o: ele só aceita conexões do próprio computador (`127.0.0.1`).
4. Se a porta estiver ocupada por outro programa, troque-a em **Configurações → MaestroOS as MCP**.

## "Connection failed" ou erro do provedor

O servidor local funciona, mas não alcançou o provedor de IA.

- **Internet ou proxy:** confira se você consegue abrir o site do provedor no próprio MaestroOS.
  Redes corporativas às vezes bloqueiam os endereços das APIs de IA.
- **Chave de API:** confira se a chave foi colada inteira e se ainda é válida.
- **Créditos ou cota:** a OpenAI e a Anthropic recusam pedidos de contas sem créditos.
- **Modelo local (Ollama, LM Studio):** o programa precisa estar aberto e com o servidor local
  ligado, e o endereço configurado precisa bater com o dele.

## Ainda não funciona?

Abra **Configurações → Diagnostics**, copie as informações e envie para quem dá suporte ao
MaestroOS na sua organização.
