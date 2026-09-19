/**
 * Caminhos do Firestore e utilidades comuns da camada de dados.
 *
 * MODELO MULTIEMPRESA
 * Tudo que pertence a uma barbearia mora embaixo de `barbearias/{id}/…`.
 * Não é enfeite de organização: é o que permite escrever a regra de
 * segurança uma única vez, por prefixo de caminho, em vez de repetir
 * "confira o campo barbeariaId" em cada coleção e um dia esquecer.
 *
 * GRADE DE 15 MINUTOS
 * Horários começam de 15 em 15 minutos. Um serviço ocupa todos os blocos
 * de 15 que ele toca — um corte de 20 min começando 09:00 reserva 09:00 e
 * 09:15. Por isso durações múltiplas de 15 aproveitam melhor a agenda.
 */

import { db, collection, doc } from "../config/firebase.js";

export const PASSO_MIN = 15;

export const colUsuarios = () => collection(db, "usuarios");
export const refUsuario = (uid) => doc(db, "usuarios", uid);

export const colSlugs = () => collection(db, "slugs");
export const refSlug = (slug) => doc(db, "slugs", slug);

export const colBarbearias = () => collection(db, "barbearias");
export const refBarbearia = (bid) => doc(db, "barbearias", bid);

const sub = (bid, nome) => collection(db, "barbearias", bid, nome);
const subDoc = (bid, nome, id) => doc(db, "barbearias", bid, nome, id);

export const colBarbeiros = (bid) => sub(bid, "barbeiros");
export const refBarbeiro = (bid, id) => subDoc(bid, "barbeiros", id);

export const colServicos = (bid) => sub(bid, "servicos");
export const refServico = (bid, id) => subDoc(bid, "servicos", id);

export const colClientes = (bid) => sub(bid, "clientes");
export const refCliente = (bid, id) => subDoc(bid, "clientes", id);

export const colBloqueios = (bid) => sub(bid, "bloqueios");
export const refBloqueio = (bid, id) => subDoc(bid, "bloqueios", id);

export const colAgendamentos = (bid) => sub(bid, "agendamentos");
export const refAgendamento = (bid, id) => subDoc(bid, "agendamentos", id);

export const colReservas = (bid) => sub(bid, "reservas");
export const refReserva = (bid, chave) => subDoc(bid, "reservas", chave);

export const colModelos = (bid) => sub(bid, "modelos");
export const refModelo = (bid, id) => subDoc(bid, "modelos", id);

export const colComunicacoes = (bid) => sub(bid, "comunicacoes");
export const refComunicacao = (bid, id) => subDoc(bid, "comunicacoes", id);

/** Chave do bloco reservado: um barbeiro, um dia, um horário. */
export const chaveReserva = (barbeiroId, dia, minutos) =>
  `${barbeiroId}__${dia}__${String(minutos).padStart(4, "0")}`;

/** Blocos de 15 min que um atendimento ocupa. */
export function blocosOcupados(inicioMin, duracaoMin) {
  const primeiro = Math.floor(inicioMin / PASSO_MIN) * PASSO_MIN;
  const fim = inicioMin + duracaoMin;
  const blocos = [];
  for (let m = primeiro; m < fim; m += PASSO_MIN) blocos.push(m);
  return blocos;
}

/** Converte um QuerySnapshot em array de objetos com id. */
export const paraLista = (snap) => snap.docs.map((d) => ({ id: d.id, ...d.data() }));

/** Converte um DocumentSnapshot em objeto com id, ou null. */
export const paraObjeto = (snap) => (snap.exists() ? { id: snap.id, ...snap.data() } : null);

/** Ordenação estável por `ordem` e depois por nome. */
export const porOrdem = (a, b) =>
  (a.ordem ?? 0) - (b.ordem ?? 0) || String(a.nome).localeCompare(String(b.nome), "pt-BR");
