# Agendia — agenda e gestão para empresas de serviços

Sistema multiempresa em **HTML, CSS e JavaScript puros**, com **Firebase**
(Authentication + Cloud Firestore). Sem build, sem framework, sem servidor
próprio: os arquivos são servidos como estão, o que o torna publicável no
**GitHub Pages**.

Atende salões, clínicas e consultórios, estúdios de estética, barbearias e
profissionais autônomos. O segmento é escolhido no cadastro, define o
vocabulário do sistema inteiro para aquela conta e depois só a administração
da plataforma altera — ver
[Vocabulário por segmento](#vocabulário-por-segmento).

- **Painel do estabelecimento** (`painel.html`) — agenda, clientes, serviços, profissionais, configurações e números do mês.
- **Link público** (`agendar.html?b=sua-empresa`) — o cliente escolhe serviço → profissional → dia → horário e confirma, sem instalar nada e sem criar conta.
- **Administração da plataforma** (`admin.html`) — a fila de cadastros esperando aprovação, o segmento e o plano de cada conta, e os botões de suspender, reativar e dar permissão a outros administradores.

Cada empresa que se cadastra ganha o próprio espaço e o próprio link. Uma
não enxerga nada da outra, e isso é imposto pelo banco de dados, não pelo
código da tela.

Feito **Mobile First**: a base do CSS é a tela do celular, e as telas maiores
recebem ajustes por `@media (min-width: …)` — nunca o contrário. No celular a
navegação fica embaixo, no alcance do polegar; a partir de 900px vira coluna
lateral.

---

## Etapa 1 — Rodar e testar tudo localmente (você está aqui)

O sistema já vem em **modo local**: os dados ficam no `localStorage` do
navegador, com uma conta de demonstração montada — profissionais, serviços,
clientes, histórico do mês e agenda do dia. **Não precisa de Firebase, de
conta, nem de internet.**

O sistema usa **módulos ES** (`import`/`export`), e o navegador bloqueia
módulos abertos com duplo clique (`file://`). É preciso servir por HTTP.
No Windows, dois cliques em **`iniciar.bat`** resolvem: ele sobe o servidor
na porta 8124 e abre o navegador. A janela preta *é* o servidor — deixe
aberta enquanto estiver usando.

Por baixo o `.bat` chama `servidor.py`, que é o `http.server` do Python com
uma diferença que importa durante o desenvolvimento: manda `no-store` nos
cabeçalhos. O `http.server` puro não manda cabeçalho de cache nenhum, e o
navegador então decide sozinho por quanto tempo guardar cada arquivo — com
módulos ES isso vira armadilha, porque você edita um `.js`, recarrega, e o
navegador continua executando a versão antiga sem avisar.

```bash
python servidor.py 8124
```

Abra <http://localhost:8124>, clique em **Entrar** e escolha um dos
acessos de demonstração:

| Acesso | Credenciais | O que abre |
|---|---|---|
| Dono do estabelecimento | `demo@agendia.local` / `123456` | `painel.html` — a Barbearia Alpha, com agenda cheia e histórico do mês |
| Acesso restrito | `barbeiro@agendia.local` / `123456` | `painel.html` — só a agenda do João, sem mais nada |
| Administrador da plataforma | `admin@agendia.local` / `123456` | `admin.html` — as contas cadastradas |

As contas da demonstração são de **segmentos diferentes** de propósito —
Barbearia Alpha, Salão Bella Vita e Clínica Vitalis (suspensa). O painel da
plataforma precisa mostrar essa variedade, não só afirmá-la; e a conta
principal é uma barbearia porque serviço curto e repetido dá a agenda mais
densa para demonstrar.

Uma faixa amarela **MODO LOCAL** fica visível em todas as telas — é
proposital, para nunca haver dúvida se aquilo está salvo na nuvem ou só neste
navegador.

### O que dá para testar

Tudo. Dashboard com números reais, agenda em grade, criar e mudar status de
atendimento, CRUD de clientes/serviços/barbeiros, horário de funcionamento,
folgas, e o link público de agendamento ponta a ponta (Configurações › Link de
agendamento › Abrir). Inclusive a trava que impede dois clientes no mesmo
horário — tente marcar dois atendimentos sobrepostos para o mesmo barbeiro.

### Recomeçar do zero

Em **Configurações › Modo local**, ou pelo console do navegador (F12):

```js
agendia.resetar()   // apaga tudo e recria a demonstração
agendia.limpar()    // deixa o sistema em branco, como instalação nova
agendia.dados()     // despeja o banco inteiro para inspeção
```

### Ao editar o código

O navegador guarda os módulos em cache. Depois de alterar um `.js`, recarregue
com **Ctrl+Shift+R** (ou F5 com o DevTools aberto e "Disable cache" marcado),
senão a versão antiga continua rodando.

### Limites do modo local

- Os dados vivem neste navegador, neste computador. Outro navegador, outra máquina ou uma aba anônima começam do zero.
- Limpar os dados do site apaga tudo.
- Não há sincronia entre dispositivos e não há backup.
- A senha da conta fica em texto puro no `localStorage` — aceitável porque nada sai da máquina e a conta é fictícia. No modo Firebase quem cuida disso é o Authentication.

---

## Etapa 2 — Criar o projeto no Firebase

1. Em [console.firebase.google.com](https://console.firebase.google.com), crie um projeto.
2. **Authentication › Sign-in method**: ative **E-mail/senha** (login do painel) e **Anônimo** (visitantes do link público).
3. **Firestore Database**: crie o banco e escolha a região `southamerica-east1` (São Paulo) — latência menor para o Brasil.
4. **Configurações do projeto › Seus aplicativos › Web (`</>`)**: registre um app e copie o objeto de configuração.
5. Cole os valores em `js/config/firebase-config.js` **e troque a chave de modo**:

```js
export const MODO = "firebase";   // era "local"
```

É o único ajuste. Nenhum outro arquivo muda: `local-db.js` e `firebase-real.js`
expõem exatamente a mesma interface, e todo o sistema importa de
`js/config/firebase.js`, que escolhe entre os dois.

> Essas chaves são **públicas por natureza** — ficam no navegador de quem abre
> o site e não há como escondê-las num site estático. Quem protege os dados
> são as regras do Firestore. Nunca coloque aqui chave de conta de serviço.

Os dados de demonstração **não migram** para o Firebase — o modo local é
bancada de teste. No Firebase você cria sua conta e sua barbearia de verdade.

## Etapa 3 — Publicar as regras de segurança

### Criar o primeiro administrador

Depois de publicar as regras, no **Firestore Database** crie manualmente a
coleção `admins` com um documento cujo **ID é o seu UID** (pegue em
Authentication › Users, depois de criar sua conta pelo sistema):

```json
{ "nome": "Seu nome", "email": "voce@…", "principal": true }
```

**`principal: true` não é opcional.** Sem ele o documento abre a
administração, mas não abre nada dentro dela: você não aprova cadastros nem
vê a tela de Permissões — e a plataforma fica com uma fila que ninguém
consegue atender.

Este primeiro passo é manual de propósito, e continua sendo o único jeito de
criar um administrador **principal**. Do painel, um principal cria
administradores auxiliares e marca o que cada um alcança, mas nunca outro
principal: é o que garante que revogar um acesso seja sempre suficiente.

### Publicar as regras

Copie o conteúdo de `firestore.rules` em **Firestore Database › Regras** e
publique. Ou, com a CLI:

```bash
firebase deploy --only firestore:rules
```

**Não pule este passo.** O Firestore criado no modo de teste libera leitura e
escrita para qualquer pessoa e expira em 30 dias. Sem as regras deste
repositório, uma barbearia enxerga os clientes da outra.

## Etapa 4 — Usar

Abra o sistema, clique em **Criar conta** e, na tela seguinte, escolha o
segmento e cadastre o estabelecimento. O horário de funcionamento já nasce
preenchido (segunda a sábado, 09:00–19:00).

**A conta nasce pendente**, inclusive a sua. Entre na administração
(`admin-entrar.html`) e aprove na fila — antes disso o link público responde
"temporariamente indisponível", e é fácil achar que o sistema quebrou.

Ordem sugerida para o link público começar a funcionar:
**aprovar a conta → Profissionais → Serviços → copiar o link em
Configurações.**

## Etapa 5 — Lembrete automático por e-mail (opcional)

O painel é estático: fechado o navegador, nada dele roda. Quem envia o
lembrete da véspera é uma **Cloud Function** — código seu, hospedado no
Google, que acorda de hora em hora. O site continua igual, no GitHub
Pages; ele só grava a configuração.

Pule esta etapa se ainda não quiser envio automático. Todo o resto
funciona sem ela.

### O que é preciso ter antes

| | Por quê |
|---|---|
| Plano **Blaze** no Firebase | Cloud Functions e o agendador exigem. Na prática a fatura fica em zero: são ~2.900 execuções/mês contra uma franquia de milhões |
| Conta num serviço de e-mail | O código usa **Resend**; trocar por SendGrid, SES ou Postmark é mexer só em `enviarEmail()` |
| **Um domínio seu**, com SPF e DKIM | É o que decide se o e-mail chega. Sem domínio verificado, lembrete cai em spam — e lembrete em spam é pior do que nenhum: o dono acha que avisou |

### Publicar

```bash
cd functions && npm install && cd ..
firebase functions:secrets:set RESEND_API_KEY
firebase deploy --only functions
```

O remetente vai em `EMAIL_REMETENTE` (formato `Agendia <avisos@seudominio.com.br>`),
pedido no primeiro deploy. A resposta do cliente vai para o e-mail do
estabelecimento, não para a plataforma — quem responde "posso remarcar?"
está falando com o salão.

### Ligar numa conta

**Configurações › Lembrete automático por e-mail**: escolher o modelo (só
aparecem os de canal E-mail), quando (véspera, dois dias antes ou no mesmo
dia) e a que horas. A hora é a do fuso da conta.

### O que a função garante

- **Ninguém é lembrado duas vezes.** O registro em `comunicacoes` usa id
  derivado do agendamento (`lembrete_{id}`) e é gravado **antes** do envio,
  com `create` — que falha se já existir. Marcar depois arriscaria enviar
  em duplicidade numa reexecução, que é o erro que o cliente percebe.
- **Cancelado não recebe**, nem quem tem `aceitaMensagens: false` na ficha.
- **Conta suspensa não fala com a carteira dela** — suspender para o que
  sai em nome do estabelecimento, não só o link público.
- **Cada conta no fuso dela.** A varredura é horária e o filtro é por
  conta, e não pelo cron — por isso Manaus e Aracaju funcionam juntas.

### Conferir a lógica sem publicar nada

```bash
cd functions && node teste.js
```

Cobre virada de mês, de ano, ano bissexto, fuso e substituição de
variáveis — o que não dá para verificar a olho e que só apareceria com o
cliente não avisado.

## Etapa 6 — Publicar no GitHub Pages

```bash
git init
git add .
git commit -m "Agendia: agenda e gestao para empresas de servicos"
git branch -M main
git remote add origin https://github.com/SEU-USUARIO/SEU-REPO.git
git push -u origin main
```

No repositório: **Settings › Pages › Source: Deploy from a branch › main /
(root)**. Em um ou dois minutos o site sai em
`https://SEU-USUARIO.github.io/SEU-REPO/`.

Dois detalhes já resolvidos no projeto:

- **`.nojekyll`** — impede o GitHub Pages de processar os arquivos com Jekyll, que ignora pastas iniciadas por `_` e pode quebrar caminhos.
- **Caminhos relativos** — nada aponta para `/js/...`, sempre `js/...`, então o site funciona em subpasta (`/SEU-REPO/`) sem ajuste.

Depois do primeiro deploy, adicione o domínio do Pages em **Firebase ›
Authentication › Settings › Domínios autorizados** — senão o login é recusado
fora do `localhost`.

---

## Estrutura

```
index.html            vitrine
entrar.html           login, criação de conta e cadastro da barbearia
painel.html           painel da barbearia (rotas por hash: #/agenda, #/clientes…)
agendar.html          link público de agendamento
admin.html            administração da plataforma

css/
  base.css            reset, variáveis de cor, tipografia
  componentes.css     botões, campos, cartões, modal, toast
  layout.css          vitrine, painel, página pública, responsivo
  agenda.css          grade horário × barbeiro

js/
  config/
    firebase-config.js  a chave de modo e suas chaves (único arquivo a editar)
    firebase.js         escolhe o driver e repassa a mesma interface
    firebase-real.js    driver de produção (SDK do Firebase pelo CDN)
    local-db.js         driver local (Firestore e Auth emulados)
    dados-demo.js       barbearia de demonstração do modo local
  lib/
    dom.js              el(), render() — a interface é montada em DOM puro
    formato.js          moeda, telefone, datas e horas em pt-BR
    fuso.js             que horas são agora na barbearia
    ui.js               modal, toast, confirmação, tradução de erros
    router.js           roteador por hash
  dados/
    base.js             caminhos do Firestore e a grade de 15 minutos
    sessao.js           autenticação e contexto do usuário
    barbearias.js       onboarding, dados e expediente
    barbeiros.js  servicos.js  clientes.js  bloqueios.js
    agendamentos.js     agendamentos, horários livres e a trava de horário
  paginas/              uma tela do painel por arquivo
  entrar.js  painel.js  agendar.js    pontos de entrada

firestore.rules       a segurança do sistema
```

---

## Decisões que valem conhecer antes de mexer

### Imagens sem servidor de arquivos

A logo de cada barbearia e a foto de cada barbeiro são reduzidas **no
próprio navegador** (canvas → WebP) e gravadas como data URI dentro do
documento do Firestore. Não há Firebase Storage envolvido.

O motivo é o teto: um documento do Firestore não passa de 1 MiB, e base64
infla o arquivo em cerca de 33%. Por isso nada é enviado como veio — a
imagem é redimensionada e a qualidade cai em degraus até caber com folga.
Em teste, um PNG de 2,6 MB virou 4 KB. A regra `imagemOk()` no
`firestore.rules` é a rede embaixo: recusa qualquer campo de imagem acima
de 200 mil caracteres ou que não seja um data URI de imagem.

Isso serve para marca e avatar. Se um dia entrarem galerias de fotos de
corte, aí é Storage de verdade — este atalho não escala para isso.

### Quem tem acesso ao painel

O modelo é o mesmo do checklist financeiro: **ter conta de autenticação
não abre o painel.** O que abre é existir um documento em
`usuarios/{uid}` apontando para a barbearia. Isso separa "ter login" de
"ter acesso" — e é o que permite revogar alguém sem apagar a conta dele:
some o documento, o login continua existindo e simplesmente deixa de
abrir o painel, na hora.

O dono não pede para o barbeiro se cadastrar: ele **libera o acesso** em
*Acessos*, informando nome, e-mail e uma senha provisória. Autocadastro
numa barbearia seria um buraco — qualquer um que descobrisse o link
entraria na equipe.

| Papel | Alcance |
|---|---|
| `dono` | Tudo, e é o único que distribui acesso |
| `gerente` | Tudo, menos a tela de acessos |
| `barbeiro` | Só a própria agenda |

Duas decisões que valem registrar:

**Criar login usa um app secundário do Firebase.** O SDK troca a sessão
para o usuário recém-criado — sem esse truque, o dono seria expulso do
próprio painel ao liberar acesso a alguém, e voltaria logado como o
barbeiro. `criarLoginSemTrocarSessao()` cria numa instância paralela e a
destrói em seguida.

**Só o dono distribui acesso, nem o gerente.** Quem pode criar login pode
criar um para si mesmo com o alcance que quiser; isso tem que parar em
uma pessoa. As regras também recusam criar alguém com papel `dono` e
impedem o dono de apagar o próprio acesso — a barbearia não pode ficar
sem quem a administre.

**O barbeiro não tem as outras telas — elas não existem para ele.** As
rotas nem são registradas, então digitar `#/config` na barra de endereço
cai na agenda. Esconder o item de menu e deixar a rota viva seria
proteção de fachada.

### Vocabulário por segmento

A estrutura é uma agenda com profissionais, serviços e clientes — nada
nela é específico de barbearia. Só as palavras eram, e elas agora moram
num lugar só: `js/config/segmentos.js`.

### Aprovação de cadastro

Quem se cadastra entra numa **fila**, não na plataforma. A conta nasce
`aprovacao: "pendente"`, aparece no painel do administrador e só passa a
receber agendamentos depois de aprovada.

Enquanto espera, o dono **entra e monta tudo** — profissionais, serviços,
horários — com um aviso fixo no topo. O que não funciona é o link público:
o cliente final vê "temporariamente indisponível", sem saber que há uma
análise em curso, porque isso é assunto entre a plataforma e o
estabelecimento.

Rejeitar **não apaga nada**. A conta continua existindo, o dono continua
entrando e vendo o que preencheu, e a decisão pode ser revertida depois de
uma conversa. Apagar cadastro de terceiro por decisão unilateral seria
desproporcional.

**O segmento não se edita mais no painel do cliente.** Ele é escolhido no
cadastro e depois só a administração altera — e a trava está na regra do
Firestore, não na tela:

```
request.resource.data.get('segmento', null) == resource.data.get('segmento', null)
```

Esconder o campo resolveria só para quem usa a tela. Com a regra, quem
chamar a API na mão recebe a mesma recusa.

### Permissões de cadastro

O painel do administrador tem uma área onde o **administrador principal**
cria administradores auxiliares e marca o que cada um alcança: *aprovar e
rejeitar cadastros* e *alterar o segmento de uma conta*.

O principal é definido **no console do Firebase** (`principal: true` em
`admins/{uid}`) e não pode ser criado pelo aplicativo — a regra recusa. É o
que garante que revogar um acesso seja sempre suficiente: se o app pudesse
fabricar principais, bastaria uma senha vazada para criar outro. Pelo mesmo
motivo, ninguém edita nem apaga a própria ficha.

### O sistema não é só de barbearia

O segmento é escolhido **no cadastro**, junto do nome — e não depois, numa
tela de configuração. Quem abre um consultório não devia cair num painel
escrito "Barbeiros" e ter que descobrir sozinho onde se corrige isso, logo
no primeiro minuto de uso. O próprio formulário já responde à escolha: o
título vira "Cadastre sua clínica", o campo vira "Nome da clínica" e a
prévia do link diz "Seus pacientes vão agendar em". Depois disso ainda dá
para trocar em **Configurações › Segmento**.

Trocar o segmento muda a interface inteira. Numa clínica o menu passa a
dizer "Especialistas", "Procedimentos" e "Pacientes", a Visão geral
pergunta "O paciente veio?" e as comissões são "a pagar aos
especialistas". Já vêm prontos barbearia, salão, clínica e estética.

O gênero do substantivo muda entre os segmentos — "a barbearia", "o
salão" — e meia dúzia de telas precisa escrever "da clínica", "seu salão",
"salão inteiro". Isso está resolvido num lugar só, em `flexoes()`. Sem
isso cada tela acabaria com o seu próprio jeito de adivinhar o gênero, e
uma delas erraria.

**Os ícones seguem junto**, e pelo mesmo motivo das palavras: uma tesoura
ao lado de "Procedimentos", ou um poste de barbeiro na página pública de
uma clínica, entregam que o sistema foi feito para outra coisa. O menu de
uma clínica mostra 🩺 e 📋; o de um salão, 💇.

**O banco não muda junto, de propósito.** As coleções continuam se
chamando `barbeiros`, `servicos`, `clientes`. Renomear documento por
motivo de rótulo seria migração de dados para não ganhar nada — e
quebraria toda conta existente no meio do caminho. Para acrescentar um
segmento novo, basta uma entrada no arquivo; nenhuma tela precisa mudar.

**Pelo mesmo motivo, o id do papel não acompanha o segmento.** Na tela de
Acessos lê-se "Especialista", mas o valor gravado em `usuarios/{uid}`
continua sendo `barbeiro` — é por ele que as regras do Firestore decidem o
que a pessoa enxerga, e traduzi-lo derrubaria todo acesso já concedido.

### Central de mensagens — e por que o envio é manual

Em **Mensagens** o dono escolhe um modelo, filtra os clientes (*atendimento
amanhã*, *sem retorno há 30 dias*, *aniversariantes do mês*) e dispara por
WhatsApp ou e-mail. Os modelos ficam em **Configurações › Modelos de
mensagem**, com variáveis clicáveis: `{nome}`, `{data}`, `{hora}`,
`{servico}`, `{profissional}`, `{valor}`, `{link}`.

**O envio é manual, e isso é limite de arquitetura, não desleixo.** O
sistema é estático: quando ninguém está com o navegador aberto, nada dele
está rodando — e lembrete às 8h da manhã exige um serviço acordado às 8h
da manhã. Disparar pela API oficial do WhatsApp exige, além disso, uma
chave secreta, que em JavaScript de navegador qualquer um lê no console e
passa a mandar mensagem no nome do estabelecimento (e na conta dele).

Então o sistema faz tudo o que dá para fazer sem servidor: monta o texto,
abre o WhatsApp ou o e-mail preenchido e registra o que saiu. Quem aperta
enviar é a pessoa.

- **WhatsApp** vai um a um, numa fila. Não existe abrir trinta conversas
  de uma vez — e nem seria bom: número que dispara em rajada é banido.
- **E-mail** vai num clique só, com todo mundo em **cópia oculta**. Um
  cliente receber a lista de e-mails dos outros vazaria a carteira inteira.
- **O histórico registra o que foi disparado**, não o que foi entregue.
  Por este caminho o WhatsApp não devolve confirmação nenhuma, e a tela
  diz isso em vez de fingir um status que não tem.

O que falta para o automático (agendado, recorrente, status de entrega) é
um serviço fora do site — Cloud Function com agendador, guardando as
chaves. O painel continuaria estático: ele só gravaria na fila, e a função
dispararia. Modelos, variáveis e histórico já estão no formato que esse
dia vai pedir.

### Cancelamento pelo cliente

Na página pública, quem agendou vê "Seus horários marcados" e pode
cancelar com no mínimo **2 horas** de antecedência. A conta usa o relógio
do estabelecimento, não o do aparelho de quem cancela — um cliente
viajando teria a janela deslocada.

O navegador guarda o id do que ele mesmo agendou; a regra do Firestore
libera `get` de um agendamento por id, mas nunca `list`. Essa separação é
o que torna a funcionalidade possível sem abrir a agenda: o id é
aleatório de 20 caracteres e só chega a quem agendou — o mesmo modelo do
"acompanhe seu pedido" de qualquer loja.

A alternativa óbvia seria listar por telefone. Foi descartada: bastaria
digitar o número de outra pessoa para ver com quem ela se consulta e a
que horas. Numa clínica, isso é dado de saúde. O custo da escolha é que
trocar de aparelho perde a lista — aí o cliente liga para o
estabelecimento.

### Fechamento do atendimento fica na Visão geral

A agenda serve para **consultar**: horários, quem vem, o que foi feito.
Dizer se o cliente compareceu acontece na Visão geral, onde os pendentes
aparecem reunidos e em vermelho. Marcar um a um caçando bloco na grade
era o caminho mais fácil de esquecer metade — e o que não é marcado não
entra no faturamento.

### Duas portas de entrada

| Porta | Quem entra | Vai para |
|---|---|---|
| `entrar.html` | barbearias | `painel.html` |
| `admin-entrar.html` | administração da plataforma | `admin.html` |

Cada tela diz em que área a pessoa está antes do formulário, e a porta da
administração tem fundo próprio — duas telas de login quase idênticas sem
rótulo seriam um convite a digitar a senha na errada.

Quem erra a porta não bate numa parede: a tela explica o que aconteceu e
oferece o caminho certo, com opção de sair e entrar com outra conta.

**A separação é de interface, não de segurança.** O que impede um dono de
barbearia de ler dados da plataforma é o `firestore.rules`, não o fato de
existirem duas páginas. Trocar a URL na barra de endereço não abre nada.

### Paleta: verde escuro e laranja

| Cor | Onde |
|---|---|
| `#062A20` | fundo e menus |
| `#0B3D2E` | superfícies e marca |
| `#F28C28` | ação e destaque |
| off-white | texto |

Os degraus entre `#062A20` e `#0B3D2E` (superfícies 2 e 3, bordas) não são
enfeite: sem eles, cartão, campo e borda cairiam na mesma cor e a tela
viraria uma chapa verde só.

**O laranja aparece pouco de propósito.** Ele é o que diz "clique aqui";
espalhado por toda parte deixa de significar isso. Regra prática: botão
principal, item de menu ativo e o número que importa. Por isso o nome
"AGENDIA" é off-white, não laranja — gasto no logotipo, que aparece em
toda tela, o acento perderia a função.

Vermelho de perigo é distinto do laranja de ação: se fossem parecidos,
"cancelar" e "confirmar" ficariam do mesmo tom. E ele é bem claro
(`#FF9D94`) porque precisa passar 4,5:1 também sobre as superfícies mais
claras, não só sobre o fundo — é ali que a pendência aparece.

Todos os tons translúcidos usam `color-mix` sobre as variáveis, e não
`rgb()` fixo. Foi o que permitiu trocar a paleta inteira sem deixar
resíduo da anterior espalhado pelo CSS.

**Contraste conferido:** o pior par ficou em 4,19:1 e todos os textos de
corpo passam WCAG AA.

### A logo e o que precisou de conserto

A arte (agenda + relógio + checklist + caneta) já vem em verde e laranja,
alinhada à paleta. Ela também já vinha **com transparência** — diferente
das anteriores, que traziam o xadrez desenhado nos pixels. Mas trouxe
quatro problemas que só aparecem ao olhar os dados:

**1. Halo em volta de tudo.** A arte tinha um brilho suave embutido —
invisível sobre branco, um contorno claro sobre verde escuro. Medindo um
corte transversal, o alpha ia de 13 direto para 243: não existia
transição real entre 14 e 242. Ou seja, aquela franja não era borda
antisserrilhada do desenho. Como havia esse vão limpo nos dados, cortar
em 60 removeu o halo inteiro sem encostar em nenhuma borda de verdade.

**2. RGB de lixo sob os pixels transparentes** (cinza ~92,91,81).
Invisível no tamanho original, e a causa mais comum de "contorno sujo" ao
reduzir: o reamostrador mistura os vizinhos **sem olhar o alpha**, e o
lixo escuro vaza para dentro da borda. A correção é sangrar a cor das
bordas para fora antes de redimensionar.

**3. Um fragmento laranja cortado na borda esquerda** — sobra de uma
forma cujo corpo ficou fora do quadro. Sobre fundo escuro lê como erro de
renderização.

**4. Nenhum pixel chegava a alpha 255** (o máximo era 254), o que deixava
a arte inteira levemente translúcida.

Resultado: 1,03% de halo claro e 3,99% de franja escura na borda — e
esses são a borda antisserrilhada legítima dos objetos escuros.

### O tamanho mínimo em que a marca funciona

Esta arte é uma **ilustração**, não um ícone: quatro objetos com volume,
sombra e profundidade. Testada a 26, 40 e 72px, ela vira mancha a 26px —
não dá para saber o que é.

Por isso os usos pequenos subiram para 32–36px (canto do painel,
assinatura da página pública). Abaixo disso o desenho não se sustenta, e
o problema é da arte, não do CSS.

No favicon (16px na aba) qualquer ilustração desse tipo reduz a um borrão
colorido — inerente ao formato. Se um dia isso incomodar, o caminho é uma
versão simplificada só para tamanhos pequenos: um objeto só, sem sombra.

### A marca Agendia é composta, não uma imagem

Só o desenho (caderno + relógio) vem de arquivo. **"AGENDIA" e o lema são
texto**, estilizados por CSS. Três consequências práticas:

- fica nítido em qualquer tamanho, sem exportar variação nenhuma;
- a cor muda com uma linha — é assim que o nome ficou prata, com gradiente metálico e reserva sólida para navegador que não recorte gradiente em texto;
- o nome do produto vira conteúdo de verdade para leitor de tela e busca.

Uma variável comanda o conjunto: mude `--marca-altura` e desenho, nome e
lema crescem juntos, sem desalinhar.

O símbolo vem de um PNG em que ele ocupa o quadro inteiro (512 px de
lado úteis), e não mais de um recorte do logotipo composto — quase o
triplo de resolução, que é o que resolve nitidez de verdade. Ampliar
arquivo não cria detalhe; só exibir abaixo do tamanho nativo cria.

### Hierarquia das marcas

Quem o cliente final precisa reconhecer é a barbearia, não a plataforma:

| Onde | Agendia | Barbearia |
|---|---|---|
| Vitrine e login | protagonista | — |
| Administração | protagonista | miniatura na lista |
| Painel da barbearia | símbolo pequeno no canto superior esquerdo | logo centralizada no topo |
| Link de agendamento | assinatura no rodapé, 55% de opacidade | logo grande no topo |

Inverter isso transformaria o link de agendamento numa propaganda da
plataforma em cima do cliente que a barbearia levou anos para conquistar.

Sem logo enviada, o nome da barbearia assume o lugar em tipografia. Sem
foto, o barbeiro aparece com as iniciais sobre a cor que ele já tem na
agenda — nunca uma silhueta cinza genérica.

### Sobre "melhorar a resolução" da logo

Não é possível inventar detalhe que o arquivo não tem: ampliar um PNG só
borra. O que dá nitidez de verdade, e é o que `assets/` entrega, é o
contrário — cada peça é exportada no dobro do tamanho em que será exibida,
então a tela nunca precisa ampliar. A marca do cabeçalho, por exemplo,
aparece com 130 px de largura a partir de um arquivo de 560 px.

O PNG original também veio em RGB, com o xadrez de "transparência"
desenhado nos pixels. Ele foi removido por preenchimento a partir das
bordas — não por limiar de cor — para preservar o creme do papel e do
mostrador, que são internos.

### O administrador administra contas, não barbearias

O painel da plataforma mostra nome, contato, plano, situação, quantidade de
barbeiros e serviços e o último acesso. **Não mostra agenda, clientes nem
faturamento de ninguém** — e isso não é omissão de tela: a regra
`allow read: if daBarbearia(bid)` recusa a leitura mesmo que o código do
painel pedisse.

A escolha é deliberada. A carteira de clientes é o ativo da barbearia, não de
quem hospeda o sistema; um painel que a expõe é passivo jurídico disfarçado de
funcionalidade. O que o administrador precisa saber para cobrar e dar suporte —
a conta está viva? cabe no plano? — é respondido sem abrir a porta.

Suspender também é deliberadamente parcial: o link público sai do ar e nada
novo é gravado, mas a barbearia continua entrando e consultando o histórico.
Tirar de alguém o acesso ao próprio dado por causa de uma mensalidade atrasada
seria desproporcional — e inviabilizaria reconquistar o cliente depois.

A permissão de administrador é o documento `admins/{uid}`, criado **à mão no
console do Firebase**. Nenhuma regra permite criá-lo pelo aplicativo, então
não existe caminho para alguém se promover a administrador se cadastrando.

### Dois drivers, uma interface

`local-db.js` e `firebase-real.js` exportam exatamente os mesmos nomes
(`collection`, `doc`, `getDocs`, `runTransaction`, `signInWithEmailAndPassword`
e companhia). Todo o resto do sistema importa de `firebase.js`, que escolhe um
dos dois em tempo de carregamento.

Foi assim de propósito: a alternativa — espalhar `if (modoLocal)` pela camada
de dados — deixaria dois caminhos de código para manter e a certeza de que um
deles ficaria para trás. Aqui o modo local é um driver descartável, e nada em
`js/dados/` ou `js/paginas/` sabe que ele existe. O que você testar localmente
é literalmente o mesmo código que vai rodar no Firebase.

O driver local inclusive **reproduz a regra crítica**: documento de reserva é
create-only, e tentar sobrescrever um horário já tomado falha do mesmo jeito
que falharia no Firestore.

### Dois clientes não conseguem pegar o mesmo horário

É o problema mais difícil de um site estático. Não existe servidor seu para
arbitrar quem chegou primeiro: se dois celulares confirmarem as 15:00 com o
mesmo barbeiro no mesmo segundo, checar "está livre?" antes de gravar não
resolve — os dois leem "livre" e os dois gravam.

A solução tem duas camadas independentes:

1. Cada bloco de 15 minutos vira um documento na coleção `reservas`, com id
   determinístico (`barbeiroId__dia__horário`). A gravação acontece dentro de
   uma **transação** do Firestore, que aborta se alguém tocou nos mesmos
   documentos no meio do caminho.
2. As regras permitem `create` nesses documentos mas **proíbem `update`**. Um
   documento de reserva que já existe não pode ser sobrescrito por ninguém —
   nem por quem chamar a API na mão pelo console do navegador.

Quem chega em segundo recebe recusa do banco, não um aviso de tela.

### O visitante do link público nunca lê a tabela de clientes

A página pública precisa saber quais horários estão ocupados. Se ela lesse os
agendamentos, leria junto nome e telefone de todo mundo. Por isso a
disponibilidade é montada a partir de `reservas`, que só carrega ids e
horários — nenhum dado pessoal. Os agendamentos em si só são legíveis por quem
pertence à barbearia.

### Horário é hora local da barbearia, não UTC

Agendamentos são gravados como `dia` (`"2026-08-11"`) e `inicioMin` (minutos
desde a meia-noite). A barbearia é um lugar físico com um fuso só e o cliente
vai até lá — converter para UTC e de volta apenas cria oportunidade de errar
uma hora. O fuso configurado é usado só para responder "que horas são agora na
barbearia", o necessário para esconder horários já passados.

### Preço e comissão ficam congelados no agendamento

Cada agendamento guarda o preço, a duração e o percentual de comissão vigentes
no momento da marcação. Reajustar a tabela em março não reescreve o
faturamento de fevereiro.

### Nenhuma consulta precisa de índice composto

Todas as consultas filtram ou ordenam por **um único campo**, o que o Firestore
resolve com os índices automáticos. Foi de propósito: assim ninguém precisa
rodar a CLI para publicar índices antes de o sistema funcionar. A ordenação
fina acontece em JavaScript, sobre listas do tamanho de um dia de barbearia.

### Grade de 15 minutos

Os horários começam de 15 em 15 minutos e um serviço ocupa todos os blocos que
toca. Um corte de 20 minutos às 09:00 reserva 09:00 e 09:15 — na prática
ocupando meia hora. Durações múltiplas de 15 aproveitam melhor a agenda.

---

## Limites conhecidos

1. **Spam no link público.** Um visitante anônimo pode criar agendamentos em
   série e sujar a agenda. As regras validam preço, duração, serviço e
   barbeiro, mas não têm como limitar frequência. A defesa certa é ativar o
   **Firebase App Check** (reCAPTCHA v3) antes de divulgar o link em escala —
   é configuração de console, não exige mudar o código.
2. **Nada é enviado automaticamente.** A central de mensagens monta o texto e
   abre o WhatsApp ou o e-mail; quem aperta enviar é a pessoa. Lembrete
   automático, agendado ou recorrente exige um serviço rodando fora do
   navegador. **A decisão tomada foi:** o WhatsApp fica manual como está, e o
   automático será por **e-mail** — que não tem aprovação de template, não
   corre risco de banimento e custa uma fração do WhatsApp. Isso não muda a
   hospedagem: o painel continua estático no GitHub Pages, e o que entra é uma
   Cloud Function com agendador, guardando a chave do serviço de e-mail.
3. **Cobrança.** O limite de barbeiros por plano é aplicado, mas **no
   aplicativo, não nas regras** — o Firestore não sabe contar documentos de uma
   coleção dentro de uma regra, e Cloud Functions não roda em site estático.
   Ou seja: é contornável por quem abrir o console do navegador. Serve para
   orientar um cliente honesto, não para conter um invasor. Não há integração
   de pagamento: cobrar e marcar como pago ainda é processo manual seu.
4. **Senha provisória entregue à mão.** O dono cria o acesso com uma senha e
   passa para a pessoa — não há e-mail de convite, porque enviar e-mail exige
   servidor. A pessoa pode trocar depois por "Esqueci minha senha".
5. **Cancelamento pelo cliente.** O link público só cria agendamentos; cancelar
   e remarcar é feito pelo painel.
6. **Sem paginação.** As listas trazem até 500 clientes e o mês inteiro de
   agendamentos de uma vez. Para uma barbearia é folgado; para uma rede
   grande, precisaria paginar.
