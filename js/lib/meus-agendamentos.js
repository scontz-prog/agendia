/**
 * Memória local dos agendamentos que ESTE navegador fez.
 *
 * POR QUE NÃO CONSULTAR PELO TELEFONE
 * Seria o caminho óbvio: cliente digita o número, sistema lista os
 * horários dele. Só que a consulta corre no navegador de quem quiser —
 * bastaria digitar o telefone de outra pessoa para ver com quem ela se
 * consulta e a que horas. Numa clínica isso é dado de saúde.
 *
 * Então o navegador guarda o id do que ele mesmo agendou, e a regra do
 * Firestore libera a leitura de UM agendamento por id (nunca a listagem).
 * O id é aleatório de 20 caracteres: funciona como o link secreto de
 * "acompanhe seu pedido" de qualquer loja.
 *
 * O CUSTO
 * Trocou de aparelho ou limpou o navegador, perde a lista — aí liga para
 * o estabelecimento. É um preço pequeno perto de deixar a agenda de todo
 * mundo consultável com um telefone.
 */

const CHAVE = "agendia:meus-agendamentos";

function ler() {
  try {
    return JSON.parse(localStorage.getItem(CHAVE)) ?? {};
  } catch {
    return {};
  }
}

function gravar(tudo) {
  try {
    localStorage.setItem(CHAVE, JSON.stringify(tudo));
  } catch {
    // navegador em modo privado ou sem espaço: o agendamento continua
    // valendo, o cliente só não terá o atalho de cancelar por aqui
  }
}

/** Guarda o id de um agendamento recém-criado, por estabelecimento. */
export function lembrar(slug, id) {
  const tudo = ler();
  const doLocal = new Set(tudo[slug] ?? []);
  doLocal.add(id);
  // 20 é folga suficiente para qualquer cliente; sem teto, a lista
  // cresceria para sempre no aparelho de quem agenda toda semana
  tudo[slug] = [...doLocal].slice(-20);
  gravar(tudo);
}

export function idsGuardados(slug) {
  return ler()[slug] ?? [];
}

export function esquecer(slug, id) {
  const tudo = ler();
  tudo[slug] = (tudo[slug] ?? []).filter((x) => x !== id);
  gravar(tudo);
}
