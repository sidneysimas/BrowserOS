# Rotinas

Uma rotina é uma tarefa que você escreve uma vez e o assistente repete: um resumo de notícias
toda manhã, a consulta de um processo, a comparação de preços de um produto.

## Criar

No menu lateral, abra **Rotinas** e clique em criar (ou parta de um modelo pronto).

- **Passos:** escreva em ordem, como explicaria a uma pessoa. Ex.: "Abra o site X", "Pesquise
  pelo número informado", "Me traga o andamento mais recente".
- **Campos:** escreva `{{nome}}` dentro de um passo para criar um campo, como `{{cnpj}}` ou
  `{{produto}}`. Ele é perguntado na hora de rodar. Rotinas agendadas usam o valor padrão.
- **O que a rotina faz:**
  - *Só consulta*: o assistente apenas lê e pesquisa.
  - *Envia ou altera*: a rotina pode preencher, enviar ou apagar algo.
- **Sites permitidos:** opcional. O assistente se limita a esses endereços.
- **Quando roda:** manual, todo dia em um horário, ou a cada N horas ou minutos.

## Segurança

- Uma rotina que **envia ou altera** algo nunca conclui o envio quando roda sozinha, no horário
  agendado. Ela deixa tudo preparado e lista o que ficou pendente.
- Quando você roda uma rotina desse tipo na mão, ela abre no painel lateral e pede a sua
  confirmação antes de enviar.

## Resultados

A aba **Resultados** mostra cada execução e a resposta do assistente. Rotinas agendadas só
rodam com o MaestroOS aberto.
