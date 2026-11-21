# Instalação

## Requisitos

- Windows 10 ou 11, 64 bits.
- Cerca de 1 GB livre em disco.
- Não é preciso ser administrador: o MaestroOS instala na pasta do usuário
  (`%LOCALAPPDATA%\MaestroOS`).

## Instalar

1. Baixe `MaestroOS_v<versão>_x64_installer.exe` (ou o `.zip` e extraia).
2. Dê dois cliques no instalador.
3. Se o Windows mostrar **"O Windows protegeu o computador"**, siga a seção abaixo.
4. Ao abrir pela primeira vez, escolha o kit do seu setor e conecte um
   [provedor de IA](provedores-de-ia.md).

## O aviso "O Windows protegeu o computador"

O instalador do MaestroOS ainda não tem assinatura digital de uma autoridade certificadora. Por
isso, o Windows SmartScreen avisa ao abrir um arquivo baixado da internet. O aviso não significa
que o arquivo tenha vírus; significa que o Windows não conhece quem o publicou.

Para instalar:

1. Clique em **Mais informações**.
2. Confira se o nome do arquivo é o instalador do MaestroOS.
3. Clique em **Executar assim mesmo**.

O aviso volta a aparecer a cada versão nova.

## Conferir se o instalador é o original

Cada versão é publicada com a sua impressão digital (hash SHA-256). Para conferir, abra o
PowerShell na pasta do arquivo e rode:

```powershell
Get-FileHash .\MaestroOS_v0.53.0_x64_installer.exe -Algorithm SHA256
```

O resultado precisa ser idêntico ao hash publicado nas [novidades](novidades.md) da versão. Se
for diferente, não instale: o arquivo foi alterado ou corrompido no caminho.

## Para equipes de TI

- O aviso do SmartScreen só aparece para arquivos baixados pela internet. Copiar o instalador
  por pasta de rede, pendrive ou ferramenta de distribuição (GPO, Intune, SCCM) evita o aviso.
- Antivírus e AppLocker podem liberar o instalador pelo hash SHA-256 da versão.
- O navegador roda um servidor local (`browseros_server.exe`) que só escuta no próprio
  computador. Ele precisa poder abrir conexões em `127.0.0.1`.
- O MaestroOS não se atualiza sozinho. Cada versão nova é um instalador novo, que pode ser
  instalado por cima da anterior sem perder dados.

## Desinstalar

Configurações do Windows → Aplicativos → MaestroOS → Desinstalar. Os dados do usuário ficam em
`%LOCALAPPDATA%\MaestroOS\User Data`; apague essa pasta se quiser remover tudo.
