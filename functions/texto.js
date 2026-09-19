/**
 * Relógio, formatação e variáveis — a parte que não fala com ninguém.
 *
 * Está separada de `index.js` por dois motivos:
 *
 *  1. É o que tem mais chance de estar sutilmente errado (fuso, virada
 *     de mês, plural de moeda) e o que menos aparece em teste manual —
 *     um erro de um dia no cálculo da véspera só se descobre quando o
 *     cliente não é avisado. Isolada assim, dá para rodar `node teste.js`
 *     e conferir os casos de borda em um segundo.
 *
 *  2. Não depende do firebase-admin, então roda sem credencial nenhuma.
 *
 * É espelho de `js/lib/fuso.js` e `js/lib/formato.js` do painel. Duplicado
 * de propósito: o deploy envia só a pasta `functions/`, e importar de
 * `../js/` quebraria em produção. São poucas linhas — mais barato repetir
 * do que criar uma etapa de build num projeto que não tem nenhuma.
 */

/** { dia: "2026-09-08", hora: 18 } no fuso informado. */
export function agoraNoFuso(timeZone = "America/Sao_Paulo", agora = new Date()) {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

  const p = Object.fromEntries(
    fmt.formatToParts(agora).map((x) => [x.type, x.value]),
  );

  const hora = Number(p.hour) % 24; // "24" aparece à meia-noite em algumas engines
  return {
    dia: `${p.year}-${p.month}-${p.day}`,
    hora,
    minutos: hora * 60 + Number(p.minute),
  };
}

/** Dias corridos de `de` até `ate` ("2026-09-19" → "2026-09-20" = 1). */
export function diasEntre(de, ate) {
  const a = Date.UTC(...de.split("-").map((n, i) => Number(n) - (i === 1 ? 1 : 0)));
  const b = Date.UTC(...ate.split("-").map((n, i) => Number(n) - (i === 1 ? 1 : 0)));
  return Math.round((b - a) / 86400000);
}

/**
 * Quantos minutos faltam, no relógio do estabelecimento, para um
 * atendimento marcado em `dia` às `inicioMin`. Negativo se já passou.
 *
 * Tudo em hora local: o agendamento é gravado assim (dia + minutos desde
 * a meia-noite), e `agora` vem de `agoraNoFuso` no fuso da conta.
 */
export function minutosAte(agora, dia, inicioMin) {
  return diasEntre(agora.dia, dia) * 1440 + Number(inicioMin) - agora.minutos;
}

/**
 * "2026-09-08" + 1 -> "2026-09-09".
 *
 * O meio-dia UTC no meio não é enfeite: ancorar à meia-noite faria a
 * conta cair no dia anterior em qualquer fuso a oeste de Greenwich — que
 * é o caso do Brasil inteiro.
 */
export function somarDias(dia, n) {
  const d = new Date(`${dia}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + Number(n));
  return d.toISOString().slice(0, 10);
}

const DIAS = [
  "Domingo", "Segunda-feira", "Terça-feira", "Quarta-feira",
  "Quinta-feira", "Sexta-feira", "Sábado",
];

const MESES = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

/**
 * "Quarta-feira, 09 de setembro".
 *
 * O dia vai com dois dígitos porque é assim que o painel escreve
 * (`dataLonga` em js/lib/formato.js usa `day: "2-digit"`). A prévia que o
 * dono aprova e o e-mail que o cliente recebe têm que ser a mesma frase —
 * diferença aqui faz parecer que são dois sistemas.
 */
export function dataLonga(dia) {
  const d = new Date(`${dia}T12:00:00Z`);
  const numero = String(d.getUTCDate()).padStart(2, "0");
  return `${DIAS[d.getUTCDay()]}, ${numero} de ${MESES[d.getUTCMonth()]}`;
}

export function minutosParaHora(min) {
  const h = Math.floor(Number(min) / 60);
  const m = Number(min) % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function moeda(centavos) {
  return (Number(centavos ?? 0) / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

export function telefoneFormatado(numero) {
  const d = String(numero ?? "").replace(/\D/g, "");
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return d;
}

/**
 * Troca {variavel} pelo valor. Variável desconhecida sai como está —
 * some do texto seria pior: ninguém descobriria que escreveu errado.
 */
export function aplicarVariaveis(texto, valores) {
  return String(texto ?? "").replace(/\{(\w+)\}/g, (original, chave) =>
    chave in valores ? valores[chave] : original,
  );
}

/** Os valores das variáveis para um agendamento. */
export function valoresDo(agendamento, cliente, barbearia, link = "") {
  const nomeCompleto = String(cliente?.nome ?? agendamento.clienteNome ?? "").trim();

  return {
    nome: nomeCompleto.split(/\s+/)[0] ?? "",
    nome_completo: nomeCompleto,
    estabelecimento: barbearia?.nome ?? "",
    link,
    data: dataLonga(agendamento.dia),
    hora: minutosParaHora(agendamento.inicioMin),
    servico: agendamento.servicoNome ?? "",
    profissional: agendamento.barbeiroNome ?? "",
    valor: moeda(agendamento.precoCentavos),
    telefone_estabelecimento: telefoneFormatado(
      barbearia?.whatsapp || barbearia?.telefone,
    ),
  };
}

/* ------------------------------------------------------------------ */
/* Textos padrão                                                       */
/*                                                                     */
/* Usados quando a conta não escolheu um modelo próprio. Sem nome de    */
/* procedimento no assunto: em clínica, o assunto do e-mail aparece na  */
/* tela bloqueada do celular de quem estiver por perto.                 */
/* ------------------------------------------------------------------ */

export const TEXTO_CONFIRMACAO = {
  assunto: "Horário confirmado — {estabelecimento}",
  texto: [
    "Olá, {nome}!",
    "",
    "Seu horário na {estabelecimento} está marcado:",
    "",
    "{data} às {hora}",
    "{servico} com {profissional}",
    "",
    "Se precisar cancelar ou remarcar, use o mesmo link em que você agendou " +
      "ou fale com a gente pelo {telefone_estabelecimento}.",
    "",
    "{estabelecimento}",
  ].join("\n"),
};

export const TEXTO_LEMBRETE = {
  assunto: "Lembrete do seu horário — {estabelecimento}",
  texto: [
    "Olá, {nome}!",
    "",
    "Passando para lembrar do seu horário na {estabelecimento}:",
    "",
    "{data} às {hora}",
    "{servico} com {profissional}",
    "",
    "Se não puder comparecer, avise pelo {telefone_estabelecimento}.",
    "",
    "{estabelecimento}",
  ].join("\n"),
};

/** Aviso para o estabelecimento: vai para quem trabalha, então é direto. */
export function textoAvisoEmpresa(a, barbearia) {
  const quando = `${dataLonga(a.dia)} às ${minutosParaHora(a.inicioMin)}`;
  return {
    assunto: `Novo agendamento: ${a.clienteNome ?? "cliente"} — ${quando}`,
    texto: [
      `Novo agendamento pelo link de ${barbearia?.nome ?? "seu estabelecimento"}.`,
      "",
      `Cliente: ${a.clienteNome ?? "—"}`,
      `Telefone: ${telefoneFormatado(a.clienteTelefone) || "—"}`,
      `E-mail: ${a.clienteEmail ?? "—"}`,
      "",
      `${a.servicoNome ?? ""} com ${a.barbeiroNome ?? ""}`,
      quando,
      `Valor: ${moeda(a.precoCentavos)}`,
      ...(a.observacoes ? ["", `Observação do cliente: ${a.observacoes}`] : []),
      "",
      "O atendimento já está na agenda do painel.",
    ].join("\n"),
  };
}
