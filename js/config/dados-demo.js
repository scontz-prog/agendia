/**
 * Dados de demonstração do modo local.
 *
 * Monta um estabelecimento inteiro já em funcionamento — com histórico do
 * mês, agenda cheia hoje e horários futuros — para que dashboard, agenda e
 * relatórios possam ser avaliados com números reais em vez de telas vazias.
 *
 * A conta principal é uma barbearia porque foi de onde o sistema nasceu e
 * porque serviço curto e repetido dá a agenda mais densa para demonstrar.
 * As outras duas são de segmentos diferentes, para o painel da plataforma
 * mostrar a variedade em vez de só afirmá-la.
 *
 * Não importa nada de `js/dados/` de propósito: aquele módulo importa o
 * driver, e o driver importa este arquivo. Duplicar quatro linhas de
 * cálculo de blocos é mais barato do que uma importação circular.
 */

const PASSO_MIN = 15;

export const CONTA_DEMO = {
  uid: "demo-dono",
  email: "demo@agendia.local",
  senha: "123456",
  nome: "Raoni (demonstração)",
};

/** Administrador da plataforma — enxerga as contas, não os dados delas. */
export const CONTA_ADMIN = {
  uid: "demo-admin",
  email: "admin@agendia.local",
  senha: "123456",
  nome: "Administração Agendia",
};

/**
 * Caminhos que a atualização da demonstração deve REFAZER, não apenas
 * completar.
 *
 * A regra geral é nunca sobrescrever documento existente — quem testou
 * antes não pode perder o que criou. Estes são a exceção: existem só para
 * povoar o painel da plataforma, ninguém tem login neles e ninguém os
 * edita.
 *
 * Fica DEPOIS das constantes de conta de propósito: como é uma constante
 * avaliada na carga do módulo, referenciar `CONTA_ADMIN` antes da
 * declaração dele derruba o arquivo inteiro na zona morta temporal.
 */
export const CAMINHOS_A_REFAZER = [
  "barbearias/demo-beta",
  "barbearias/demo-gama",
  "barbearias/demo-pendente",
  "slugs/barbearia-beta",
  "slugs/studio-corte-cia",
  // A ficha do administrador ganhou `principal` — sem refazer, quem já
  // testou o sistema não veria a tela de Permissões de cadastro.
  `admins/${CONTA_ADMIN.uid}`,
];

/**
 * Fichas de exemplo que também são refeitas na atualização.
 *
 * São listadas UMA A UMA, e não pela coleção inteira: o cliente cadastrado
 * testando o link público mora na mesma coleção, e apagar por prefixo
 * levaria esse teste junto.
 */
export function fichasDeExemplo() {
  return CLIENTES.map((c) => `barbearias/${BARBEARIA_ID}/clientes/${c.telefone}`);
}

/** Barbeiro com acesso restrito — só enxerga a própria agenda. */
export const CONTA_BARBEIRO = {
  uid: "demo-barbeiro",
  email: "barbeiro@agendia.local",
  senha: "123456",
  nome: "João",
  barbeiroId: "barbeiro-joao",
};

const BARBEARIA_ID = "demo-barbearia";
const SLUG = "barbearia-alpha";

const BARBEIROS = [
  { id: "barbeiro-joao", nome: "João", telefone: "79999110001", comissao: 40, cor: "#eca202", ordem: 1 },
  { id: "barbeiro-pedro", nome: "Pedro", telefone: "79999110002", comissao: 45, cor: "#8e6bc8", ordem: 2 },
  { id: "barbeiro-lucas", nome: "Lucas", telefone: "79999110003", comissao: 50, cor: "#45c98a", ordem: 3 },
];

const SERVICOS = [
  { id: "srv-corte", nome: "Corte", descricao: "Máquina, tesoura e acabamento", precoCentavos: 4000, duracaoMin: 30, ordem: 1 },
  { id: "srv-barba", nome: "Barba", descricao: "Toalha quente e navalha", precoCentavos: 3000, duracaoMin: 30, ordem: 2 },
  { id: "srv-combo", nome: "Corte + Barba", descricao: "O combo da casa", precoCentavos: 6500, duracaoMin: 60, ordem: 3 },
  { id: "srv-infantil", nome: "Corte infantil", descricao: "Até 10 anos", precoCentavos: 3500, duracaoMin: 30, ordem: 4 },
  { id: "srv-pezinho", nome: "Pezinho", descricao: "Acabamento rápido", precoCentavos: 1500, duracaoMin: 15, ordem: 5 },
];

/**
 * Só parte dos clientes tem e-mail — de propósito.
 *
 * Na vida real quase ninguém deixa e-mail na barbearia, e a tela de
 * mensagens precisa mostrar isso: ao escolher o canal e-mail, quem não
 * tem endereço aparece apagado e não entra na conta. Uma demonstração com
 * e-mail em todo mundo esconderia justamente o caso que dá trabalho.
 */
const CLIENTES = [
  { telefone: "79988110001", nome: "Carlos Menezes", email: "carlos.menezes@exemplo.com" },
  { telefone: "79988110002", nome: "Marcos Andrade" },
  { telefone: "79988110003", nome: "Rafael Souza", email: "rafael.souza@exemplo.com", observacoes: "Máquina 2 nas laterais, não gosta de navalha no pescoço." },
  { telefone: "79988110004", nome: "Bruno Lima", email: "bruno.lima@exemplo.com" },
  { telefone: "79988110005", nome: "Diego Fontes" },
  { telefone: "79988110006", nome: "Anderson Reis", email: "anderson.reis@exemplo.com" },
  { telefone: "79988110007", nome: "Thiago Melo" },
  { telefone: "79988110008", nome: "Wesley Barros", email: "wesley.barros@exemplo.com" },
];

/* ------------------------------------------------------------------ */
/* Auxiliares de data (sem dependências)                               */
/* ------------------------------------------------------------------ */
function paraDia(data) {
  return `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, "0")}-${String(
    data.getDate(),
  ).padStart(2, "0")}`;
}

function somar(dias) {
  const d = new Date();
  d.setDate(d.getDate() + dias);
  return d;
}

function blocos(inicioMin, duracaoMin) {
  const primeiro = Math.floor(inicioMin / PASSO_MIN) * PASSO_MIN;
  const lista = [];
  for (let m = primeiro; m < inicioMin + duracaoMin; m += PASSO_MIN) lista.push(m);
  return lista;
}

/** Gerador previsível: a demonstração é sempre a mesma a cada recriação. */
function sorteio(semente) {
  let valor = semente;
  return (limite) => {
    valor = (valor * 1103515245 + 12345) % 2147483648;
    return Math.floor((valor / 2147483648) * limite);
  };
}

/* ------------------------------------------------------------------ */
/* Construção                                                          */
/* ------------------------------------------------------------------ */

/**
 * Devolve { documentos, usuarios } — documentos no formato
 * "caminho/do/doc": { …campos } que o driver local consome direto.
 */
export function construirDemo() {
  const documentos = {};
  const agora = new Date().toISOString();
  const bid = BARBEARIA_ID;
  const hoje = paraDia(new Date());

  const horarios = {};
  for (let dia = 0; dia <= 6; dia++) {
    horarios[dia] = {
      ativo: dia >= 1 && dia <= 6,
      abre: dia === 6 ? "08:00" : "09:00",
      fecha: dia === 6 ? "17:00" : "19:00",
    };
  }

  documentos[`barbearias/${bid}`] = {
    nome: "Barbearia Alpha",
    slug: SLUG,
    telefone: "79999990000",
    whatsapp: "79999990000",
    email: CONTA_DEMO.email,
    endereco: "Rua das Palmeiras, 120 — Centro",
    instagram: "barbeariaalpha",
    logo_url: null,
    timezone: "America/Sao_Paulo",
    segmento: "barbearia",
    plano: "profissional",
    aprovacao: "aprovada",
    ativa: true,
    horarios,
    criadoEm: new Date(Date.now() - 86400000 * 120).toISOString(),
    ultimoAcessoEm: agora,
  };

  documentos[`slugs/${SLUG}`] = { barbeariaId: bid };

  // O administrador não tem documento em `usuarios`: ele não pertence a
  // barbearia nenhuma. A permissão é o documento em `admins`, que no
  // Firebase se cria à mão pelo console — nunca pelo aplicativo.
  documentos[`admins/${CONTA_ADMIN.uid}`] = {
    nome: CONTA_ADMIN.nome,
    email: CONTA_ADMIN.email,
    // Administrador PRINCIPAL: é quem enxerga a tela de Permissões de
    // cadastro e cria os auxiliares. No Firebase esse campo é marcado à
    // mão no console — nenhuma regra permite criar outro principal pelo
    // aplicativo, para que revogar um acesso seja sempre suficiente.
    principal: true,
    criadoEm: agora,
  };

  // Mais duas contas, para o painel do administrador ter o que mostrar.
  // Elas são de SEGMENTOS DIFERENTES de propósito: a plataforma não é de
  // barbearia, e uma lista com três barbearias diria o contrário de tudo
  // o que a página inicial promete.
  documentos["barbearias/demo-beta"] = {
    nome: "Salão Bella Vita",
    slug: "salao-bella-vita",
    telefone: "79988887777",
    whatsapp: "79988887777",
    email: "contato@bellavita.local",
    endereco: "Av. Central, 45 — São José",
    instagram: null,
    logo_url: null,
    timezone: "America/Sao_Paulo",
    segmento: "salao",
    plano: "basico",
    aprovacao: "aprovada",
    ativa: true,
    horarios,
    criadoEm: new Date(Date.now() - 86400000 * 40).toISOString(),
    ultimoAcessoEm: new Date(Date.now() - 86400000 * 3).toISOString(),
  };
  documentos["slugs/salao-bella-vita"] = { barbeariaId: "demo-beta" };
  documentos["barbearias/demo-beta/barbeiros/beta-renata"] = {
    nome: "Renata",
    telefone: "79988887788",
    comissao: 35,
    cor: "#d14d8b",
    ativo: true,
    ordem: 1,
    criadoEm: agora,
  };
  documentos["barbearias/demo-beta/servicos/beta-escova"] = {
    nome: "Escova",
    descricao: "Lavagem e finalização",
    precoCentavos: 5500,
    duracaoMin: 45,
    ativo: true,
    ordem: 1,
    criadoEm: agora,
  };

  // Suspensa e sem nenhum profissional: é o caso de conta que se cadastrou
  // e nunca saiu do papel, que o painel da plataforma precisa saber
  // destacar.
  documentos["barbearias/demo-gama"] = {
    nome: "Clínica Vitalis",
    slug: "clinica-vitalis",
    telefone: "79977776666",
    whatsapp: null,
    email: "contato@vitalis.local",
    endereco: null,
    instagram: null,
    logo_url: null,
    timezone: "America/Sao_Paulo",
    segmento: "clinica",
    plano: "premium",
    aprovacao: "aprovada",
    ativa: false,
    horarios,
    criadoEm: new Date(Date.now() - 86400000 * 75).toISOString(),
    ultimoAcessoEm: new Date(Date.now() - 86400000 * 62).toISOString(),
  };
  documentos["slugs/clinica-vitalis"] = { barbeariaId: "demo-gama" };

  // Uma conta esperando aprovação, para a fila do painel do administrador
  // não nascer vazia — é a primeira coisa que ele precisa ver funcionando.
  documentos["barbearias/demo-pendente"] = {
    nome: "Estúdio Lumine",
    slug: "estudio-lumine",
    telefone: "79966554433",
    whatsapp: "79966554433",
    email: "contato@lumine.local",
    endereco: null,
    instagram: null,
    logo_url: null,
    timezone: "America/Sao_Paulo",
    segmento: "estetica",
    plano: "basico",
    aprovacao: "pendente",
    ativa: true,
    horarios,
    criadoEm: new Date(Date.now() - 86400000 * 2).toISOString(),
    solicitadaEm: new Date(Date.now() - 86400000 * 2).toISOString(),
    ultimoAcessoEm: new Date(Date.now() - 86400000 * 1).toISOString(),
  };
  documentos["slugs/estudio-lumine"] = { barbeariaId: "demo-pendente" };


  documentos[`usuarios/${CONTA_DEMO.uid}`] = {
    barbeariaId: bid,
    nome: CONTA_DEMO.nome,
    email: CONTA_DEMO.email,
    papel: "dono",
    barbeiroId: null,
    criadoEm: agora,
  };

  // Acesso restrito de exemplo: entra no mesmo endereço da barbearia e
  // enxerga só a agenda do João.
  documentos[`usuarios/${CONTA_BARBEIRO.uid}`] = {
    barbeariaId: bid,
    nome: CONTA_BARBEIRO.nome,
    email: CONTA_BARBEIRO.email,
    papel: "barbeiro",
    barbeiroId: CONTA_BARBEIRO.barbeiroId,
    criadoEm: agora,
  };

  for (const b of BARBEIROS) {
    documentos[`barbearias/${bid}/barbeiros/${b.id}`] = {
      nome: b.nome,
      telefone: b.telefone,
      comissao: b.comissao,
      cor: b.cor,
      ativo: true,
      ordem: b.ordem,
      criadoEm: agora,
    };
  }

  for (const s of SERVICOS) {
    documentos[`barbearias/${bid}/servicos/${s.id}`] = {
      nome: s.nome,
      descricao: s.descricao,
      precoCentavos: s.precoCentavos,
      duracaoMin: s.duracaoMin,
      ativo: true,
      ordem: s.ordem,
      criadoEm: agora,
    };
  }

  const fichas = new Map();
  for (const c of CLIENTES) {
    fichas.set(c.telefone, {
      nome: c.nome,
      telefone: c.telefone,
      email: c.email ?? null,
      nascimento: null,
      observacoes: c.observacoes ?? null,
      totalVisitas: 0,
      totalGastoCentavos: 0,
      ultimaVisitaDia: null,
      criadoEm: agora,
    });
  }

  const proximo = sorteio(20260811);
  let sequencia = 0;

  function lancar({ dia, inicioMin, barbeiro, servico, cliente, status, origem = "painel" }) {
    const id = `ag-demo-${String(++sequencia).padStart(3, "0")}`;
    const usados = blocos(inicioMin, servico.duracaoMin);

    documentos[`barbearias/${bid}/agendamentos/${id}`] = {
      dia,
      inicioMin,
      fimMin: inicioMin + servico.duracaoMin,
      duracaoMin: servico.duracaoMin,
      barbeiroId: barbeiro.id,
      barbeiroNome: barbeiro.nome,
      barbeiroCor: barbeiro.cor,
      clienteId: cliente.telefone,
      clienteNome: cliente.nome,
      clienteTelefone: cliente.telefone,
      servicoId: servico.id,
      servicoNome: servico.nome,
      precoCentavos: servico.precoCentavos,
      comissaoPercentual: barbeiro.comissao,
      status,
      origem,
      observacoes: null,
      blocos: usados,
      criadoEm: agora,
    };

    // Cancelado e falta liberam o horário — a reserva não fica presa.
    if (status !== "cancelado" && status !== "faltou") {
      for (const m of usados) {
        documentos[`barbearias/${bid}/reservas/${barbeiro.id}__${dia}__${String(m).padStart(4, "0")}`] =
          { agendamentoId: id, barbeiroId: barbeiro.id, dia };
      }
    }

    if (status === "realizado") {
      const ficha = fichas.get(cliente.telefone);
      ficha.totalVisitas += 1;
      ficha.totalGastoCentavos += servico.precoCentavos;
      if (!ficha.ultimaVisitaDia || dia > ficha.ultimaVisitaDia) ficha.ultimaVisitaDia = dia;
    }
  }

  /* --- histórico: dias anteriores do mês corrente ------------------ */
  for (let recuo = 25; recuo >= 1; recuo--) {
    const data = somar(-recuo);
    if (data.getDay() === 0) continue; // domingo fechado
    if (paraDia(data).slice(0, 7) !== hoje.slice(0, 7)) continue; // só o mês atual

    const quantos = 3 + proximo(4);
    for (let i = 0; i < quantos; i++) {
      const barbeiro = BARBEIROS[proximo(BARBEIROS.length)];
      const servico = SERVICOS[proximo(SERVICOS.length)];
      const cliente = CLIENTES[proximo(CLIENTES.length)];
      const inicioMin = (9 + proximo(9)) * 60 + (proximo(2) ? 0 : 30);

      // não empilha dois no mesmo barbeiro e horário
      const ocupado = blocos(inicioMin, servico.duracaoMin).some(
        (m) =>
          documentos[
            `barbearias/${bid}/reservas/${barbeiro.id}__${paraDia(data)}__${String(m).padStart(4, "0")}`
          ],
      );
      if (ocupado) continue;

      const sorte = proximo(10);
      const status = sorte === 0 ? "cancelado" : sorte === 1 ? "faltou" : "realizado";
      lancar({ dia: paraDia(data), inicioMin, barbeiro, servico, cliente, status });
    }
  }

  /* --- hoje: agenda cheia, com todos os estados -------------------- */
  const hojeSemana = new Date().getDay();
  if (hojeSemana !== 0) {
    const roteiro = [
      { h: 9 * 60, b: 0, s: 0, c: 0, st: "realizado" },
      { h: 9 * 60 + 30, b: 1, s: 2, c: 1, st: "realizado" },
      { h: 10 * 60, b: 0, s: 1, c: 2, st: "realizado" },
      { h: 11 * 60, b: 2, s: 0, c: 3, st: "confirmado" },
      { h: 14 * 60, b: 1, s: 0, c: 4, st: "confirmado" },
      { h: 15 * 60, b: 0, s: 2, c: 5, st: "agendado", origem: "publico" },
      { h: 16 * 60, b: 2, s: 4, c: 6, st: "agendado", origem: "publico" },
      { h: 17 * 60, b: 1, s: 3, c: 7, st: "cancelado" },
    ];

    for (const r of roteiro) {
      lancar({
        dia: hoje,
        inicioMin: r.h,
        barbeiro: BARBEIROS[r.b],
        servico: SERVICOS[r.s],
        cliente: CLIENTES[r.c],
        status: r.st,
        origem: r.origem ?? "painel",
      });
    }
  }

  /* --- próximos dias ----------------------------------------------- */
  for (let avanco = 1; avanco <= 4; avanco++) {
    const data = somar(avanco);
    if (data.getDay() === 0) continue;
    const quantos = 2 + proximo(3);
    for (let i = 0; i < quantos; i++) {
      const barbeiro = BARBEIROS[proximo(BARBEIROS.length)];
      const servico = SERVICOS[proximo(SERVICOS.length)];
      const cliente = CLIENTES[proximo(CLIENTES.length)];
      const inicioMin = (9 + proximo(8)) * 60;

      const ocupado = blocos(inicioMin, servico.duracaoMin).some(
        (m) =>
          documentos[
            `barbearias/${bid}/reservas/${barbeiro.id}__${paraDia(data)}__${String(m).padStart(4, "0")}`
          ],
      );
      if (ocupado) continue;

      lancar({
        dia: paraDia(data),
        inicioMin,
        barbeiro,
        servico,
        cliente,
        status: "confirmado",
        origem: i % 2 ? "publico" : "painel",
      });
    }
  }

  /* --- um cliente sumido, para a marcação aparecer ------------------ */
  const sumido = fichas.get("79988110008");
  sumido.totalVisitas = Math.max(1, sumido.totalVisitas);
  sumido.totalGastoCentavos = Math.max(6500, sumido.totalGastoCentavos);
  sumido.ultimaVisitaDia = paraDia(somar(-95));

  /* --- feriado/folga de exemplo ------------------------------------ */
  const folga = paraDia(somar(6));
  documentos[`barbearias/${bid}/bloqueios/blq-demo-1`] = {
    barbeiroId: BARBEIROS[0].id,
    dia: folga,
    inicioMin: 0,
    fimMin: 1439,
    motivo: "Folga do João",
    criadoEm: agora,
  };

  for (const [telefone, ficha] of fichas) {
    documentos[`barbearias/${bid}/clientes/${telefone}`] = ficha;
  }

  return {
    documentos,
    usuarios: [
      {
        uid: CONTA_DEMO.uid,
        email: CONTA_DEMO.email,
        senha: CONTA_DEMO.senha,
        displayName: CONTA_DEMO.nome,
      },
      {
        uid: CONTA_BARBEIRO.uid,
        email: CONTA_BARBEIRO.email,
        senha: CONTA_BARBEIRO.senha,
        displayName: CONTA_BARBEIRO.nome,
      },
      {
        uid: CONTA_ADMIN.uid,
        email: CONTA_ADMIN.email,
        senha: CONTA_ADMIN.senha,
        displayName: CONTA_ADMIN.nome,
      },
    ],
  };
}
