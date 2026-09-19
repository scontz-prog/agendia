/** Folgas, feriados, férias e intervalos. barbeiroId nulo = barbearia inteira. */

import {
  getDocs,
  addDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  serverTimestamp,
} from "../config/firebase.js";
import { colBloqueios, refBloqueio, paraLista } from "./base.js";
import { horaParaMinutos } from "../lib/formato.js";
import { exigirContaAtiva } from "./situacao.js";

export async function listarBloqueiosDoDia(bid, dia) {
  const snap = await getDocs(query(colBloqueios(bid), where("dia", "==", dia)));
  return paraLista(snap);
}

/** Bloqueios de hoje em diante, para a tela de configurações. */
export async function listarBloqueiosFuturos(bid, aPartirDe) {
  const snap = await getDocs(
    query(colBloqueios(bid), where("dia", ">=", aPartirDe), orderBy("dia"), limit(60)),
  );
  return paraLista(snap);
}

export async function criarBloqueio(bid, dados) {
  exigirContaAtiva();

  const inicioMin = horaParaMinutos(dados.inicio || "00:00");
  const fimMin = horaParaMinutos(dados.fim || "23:59");

  if (!dados.dia) throw new Error("Escolha a data.");
  if (fimMin <= inicioMin) throw new Error("O fim precisa ser depois do início.");

  await addDoc(colBloqueios(bid), {
    barbeiroId: dados.barbeiroId || null,
    dia: dados.dia,
    inicioMin,
    fimMin,
    motivo: dados.motivo || null,
    criadoEm: serverTimestamp(),
  });
}

export async function excluirBloqueio(bid, id) {
  await deleteDoc(refBloqueio(bid, id));
}

/** true se o intervalo [inicio, fim) esbarra em algum bloqueio do barbeiro. */
export function bloqueado(bloqueios, barbeiroId, inicioMin, fimMin) {
  return bloqueios.some(
    (b) =>
      (b.barbeiroId === null || b.barbeiroId === undefined || b.barbeiroId === barbeiroId) &&
      inicioMin < b.fimMin &&
      fimMin > b.inicioMin,
  );
}
