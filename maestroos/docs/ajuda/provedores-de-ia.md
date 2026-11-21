# Conectar um provedor de IA

O assistente do MaestroOS usa um modelo de IA escolhido por você. Não há conta MaestroOS nem
cobrança nossa: você usa a sua própria assinatura ou chave de API, e o provedor cobra direto.

Para conectar: **Configurações → AI & Agents**, escolha o provedor e preencha os dados. Na
primeira abertura, o MaestroOS também leva você direto a essa tela.

## Assinaturas que você já tem

### ChatGPT Pro

Use a sua assinatura do ChatGPT (Plus ou Pro). Clique em conectar e faça login na página da
OpenAI que abrir. Nenhuma chave de API é necessária.

### GitHub Copilot

Use a sua assinatura do Copilot. Ao conectar, o MaestroOS mostra um código. Abra a página do
GitHub indicada, digite o código e autorize.

### Qwen Code

Funciona como o Copilot: ao conectar aparece um código para digitar na página da Qwen.

## Chave de API

Nestes provedores você cria uma chave de API no site deles e cola no MaestroOS. Guarde a chave
como uma senha.

### OpenAI

Crie a chave em [platform.openai.com/api-keys](https://platform.openai.com/api-keys). A conta
precisa ter créditos.

### Anthropic (Claude)

Crie a chave em [console.anthropic.com/settings/keys](https://console.anthropic.com/settings/keys).

### Google (Gemini)

Crie a chave em [aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey). Há uma
cota gratuita para testar.

### OpenRouter

Uma única chave dá acesso a modelos de vários fornecedores. Crie em
[openrouter.ai/keys](https://openrouter.ai/keys).

## Modelos no seu computador

Rodar o modelo localmente mantém tudo na sua máquina, mas exige um computador com bastante
memória (de preferência com placa de vídeo). Modelos pequenos podem errar mais em tarefas longas.

### Ollama

1. Instale o Ollama ([ollama.com/download](https://ollama.com/download)).
2. Baixe um modelo, por exemplo `ollama pull llama3.2`.
3. No MaestroOS, escolha Ollama. O endereço padrão é `http://localhost:11434/v1`.

### LM Studio

1. Instale o LM Studio ([lmstudio.ai](https://lmstudio.ai)) e baixe um modelo.
2. Na aba de desenvolvedor do LM Studio, inicie o servidor local.
3. No MaestroOS, escolha LM Studio. O endereço padrão é `http://localhost:1234/v1`.

## Se não funcionar

Veja [Problemas de conexão](problemas-de-conexao.md).
