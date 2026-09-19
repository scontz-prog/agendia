/**
 * Vocabulário por segmento.
 *
 * POR QUE ISTO EXISTE
 * O sistema é uma agenda com profissionais, serviços e clientes. Nada na
 * estrutura é específico de barbearia — só as palavras eram. Enquanto
 * "barbeiro" estivesse escrito na unha em vinte telas, atender uma
 * clínica exigiria caçar string por string, e o primeiro esquecimento
 * apareceria para o cliente como "escolha seu barbeiro" num consultório.
 *
 * Aqui os nomes ficam num lugar só. Trocar o segmento de uma conta muda
 * a interface inteira sem tocar em modelo de dados, regra de segurança
 * nem consulta — os documentos continuam se chamando `barbeiros`,
 * `servicos`, `clientes`. Renomear coleção seria migração de banco por
 * motivo cosmético.
 *
 * PARA ACRESCENTAR UM SEGMENTO
 * Basta uma entrada nova neste arquivo. Nenhuma tela precisa mudar.
 */

/** Termos padrão. Cada segmento sobrescreve só o que for diferente. */
const BASE = {
  /* Ícones do menu. Ficam aqui e não no HTML porque a tesoura de
     "Serviços" e o poste de "Barbeiros" dizem barbearia tão alto quanto
     as palavras — numa clínica seriam uma tesoura ao lado de
     "Procedimentos". */
  iconeProfissionais: "💈",
  iconeServicos: "✂️",
  estabelecimento: "estabelecimento",
  estabelecimentoArtigo: "o estabelecimento",
  profissional: "profissional",
  profissionais: "profissionais",
  oProfissional: "o profissional",
  cliente: "cliente",
  clientes: "clientes",
  servico: "serviço",
  servicos: "serviços",
  atendimento: "atendimento",
  atendimentos: "atendimentos",
  agenda: "agenda",
};

export const SEGMENTOS = {
  barbearia: {
    id: "barbearia",
    nome: "Barbearia",
    emblema: "💈",
    termos: {
      estabelecimento: "barbearia",
      estabelecimentoArtigo: "a barbearia",
      profissional: "barbeiro",
      profissionais: "barbeiros",
      oProfissional: "o barbeiro",
    },
  },

  salao: {
    id: "salao",
    nome: "Salão de beleza",
    emblema: "💇",
    termos: {
      iconeProfissionais: "💇",
      estabelecimento: "salão",
      estabelecimentoArtigo: "o salão",
      profissional: "profissional",
      profissionais: "profissionais",
      oProfissional: "o profissional",
    },
  },

  clinica: {
    id: "clinica",
    nome: "Clínica ou consultório",
    emblema: "🩺",
    termos: {
      iconeProfissionais: "🩺",
      iconeServicos: "📋",
      estabelecimento: "clínica",
      estabelecimentoArtigo: "a clínica",
      profissional: "especialista",
      profissionais: "especialistas",
      oProfissional: "o especialista",
      cliente: "paciente",
      clientes: "pacientes",
      servico: "procedimento",
      servicos: "procedimentos",
      atendimento: "consulta",
      atendimentos: "consultas",
    },
  },

  estetica: {
    id: "estetica",
    nome: "Estética",
    emblema: "✨",
    termos: {
      iconeProfissionais: "✨",
      iconeServicos: "📋",
      estabelecimento: "estúdio",
      estabelecimentoArtigo: "o estúdio",
      profissional: "especialista",
      profissionais: "especialistas",
      oProfissional: "o especialista",
      servico: "procedimento",
      servicos: "procedimentos",
      atendimento: "sessão",
      atendimentos: "sessões",
    },
  },

  outro: {
    id: "outro",
    nome: "Outro segmento",
    emblema: "🗓️",
    termos: {
      iconeProfissionais: "🧑",
      iconeServicos: "📋",
    },
  },
};

export const LISTA_SEGMENTOS = Object.values(SEGMENTOS);

export const SEGMENTO_PADRAO = "barbearia";

/**
 * Termos de um estabelecimento. Aceita o documento inteiro ou só o id do
 * segmento, e sempre devolve algo utilizável — conta antiga, sem o campo
 * `segmento`, cai no padrão em vez de mostrar "undefined" na tela.
 */
export function termos(origem) {
  const id = typeof origem === "string" ? origem : origem?.segmento;
  const segmento = SEGMENTOS[id] ?? SEGMENTOS[SEGMENTO_PADRAO];
  return { ...BASE, ...segmento.termos, segmento };
}

/**
 * Flexões do nome do estabelecimento.
 *
 * O gênero muda de um segmento para o outro — "a barbearia", "o salão" —
 * e meia dúzia de telas precisa escrever "da clínica", "seu salão", "o
 * estúdio". Sem isto cada tela acabaria com o seu próprio jeito de
 * adivinhar o gênero, e uma delas erraria.
 */
export function flexoes(origem) {
  const T = termos(origem);
  const feminino = /^a\s/i.test(T.estabelecimentoArtigo);
  const nome = T.estabelecimento;
  return {
    feminino,
    nome,
    o: `${feminino ? "a" : "o"} ${nome}`,
    de: `${feminino ? "da" : "do"} ${nome}`,
    seu: `${feminino ? "sua" : "seu"} ${nome}`,
    /** "barbearia inteira" / "salão inteiro" */
    inteiro: `${nome} inteir${feminino ? "a" : "o"}`,
  };
}

/** "barbeiro" -> "Barbeiro". Para começo de frase e título de tela. */
export function maiuscula(palavra) {
  const t = String(palavra ?? "");
  return t.charAt(0).toUpperCase() + t.slice(1);
}
