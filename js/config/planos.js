/**
 * Planos da plataforma.
 *
 * O limite de profissionais é aplicado no aplicativo, ao salvar. Vale
 * registrar o que isso significa: em site estático, quem abrir o console do
 * navegador consegue driblar a checagem. As regras do Firestore não
 * conseguem contar documentos de uma coleção, então uma trava de verdade
 * exigiria Cloud Functions — que não é hospedagem estática.
 *
 * Na prática isso é aceitável: o limite existe para orientar a escolha do
 * plano de um cliente honesto, não para conter um invasor. O que precisa
 * ser inviolável — isolamento entre contas e trava de horário — está nas
 * regras, não aqui.
 *
 * O campo continua se chamando `maxBarbeiros` porque é assim que está
 * gravado; o que o cliente lê são os textos abaixo.
 */

export const PLANOS = {
  basico: {
    id: "basico",
    nome: "Básico",
    precoCentavos: 3000,
    maxBarbeiros: 1,
    resumo: "1 profissional, agenda e link de agendamento",
  },
  profissional: {
    id: "profissional",
    nome: "Profissional",
    precoCentavos: 5000,
    maxBarbeiros: 5,
    resumo: "Até 5 profissionais, relatórios e controle financeiro",
  },
  premium: {
    id: "premium",
    nome: "Premium",
    precoCentavos: 8000,
    maxBarbeiros: null, // sem limite
    resumo: "Profissionais ilimitados, comissões e relatórios avançados",
  },
};

export const LISTA_PLANOS = Object.values(PLANOS);

export function plano(id) {
  return PLANOS[id] ?? PLANOS.basico;
}

export function limiteBarbeiros(id) {
  return plano(id).maxBarbeiros;
}

/** null quando o plano é ilimitado. */
export function rotuloLimite(id) {
  const max = limiteBarbeiros(id);
  return max === null ? "ilimitados" : `até ${max}`;
}
