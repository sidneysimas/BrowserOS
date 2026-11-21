# Usar o MaestroOS com outros programas (MCP)

O MaestroOS funciona como um servidor MCP (Model Context Protocol). Com isso, outros assistentes,
como Claude Code, Cursor ou Codex, podem abrir páginas, clicar e ler o conteúdo do navegador.

## Pegar o endereço

Abra **Configurações → MaestroOS as MCP** e copie o endereço do servidor. Ele é parecido com
`http://127.0.0.1:<porta>/mcp` e só funciona no próprio computador.

## Claude Code

No terminal:

```bash
claude mcp add --transport http maestroos http://127.0.0.1:<porta>/mcp
```

## Outros programas

Em programas que aceitam MCP por HTTP, adicione um servidor com o endereço copiado. O MaestroOS
precisa estar aberto enquanto o outro programa o usa.

## Cuidados

Qualquer programa conectado consegue agir no navegador com as suas sessões abertas (e-mail,
sistemas internos, bancos). Conecte apenas programas em que você confia.
