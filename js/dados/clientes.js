/**
 * Clientes da barbearia.
 *
 * O id do documento é o telefone só com dígitos. É a chave natural do
 * cliente numa barbearia e evita cadastro duplicado sem precisar de
 * consulta prévia — quem agenda pelo link público duas vezes cai no
 * mesmo documento.
 */

import {
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  serverTimestamp,
} from "../config/firebase.js";
import { colClientes, refCliente, paraLista, paraObjeto } from "./base.js";
import { digitos } from "../lib/formato.js";
import { exigirContaAtiva } from "./situacao.js";

export async function listarClientes(bid) {
  const snap = await getDocs(query(colClientes(bid), orderBy("nome"), limit(500)));
  return paraLista(snap);
}

export async function obterCliente(bid, id) {
  return paraObjeto(await getDoc(refCliente(bid, id)));
}

/**
 * Cria ou atualiza pelo telefone. Devolve o id (o próprio telefone).
 * `merge` preserva o histórico acumulado (visitas, total gasto).
 */
export async function salvarCliente(bid, dados) {
  exigirContaAtiva();

  const telefone = digitos(dados.telefone);
  const nome = String(dados.nome ?? "").trim();

  if (nome.length < 2) throw new Error("Informe o nome do cliente.");
  if (telefone.length < 10) throw new Error("Informe um telefone com DDD.");

  const existente = await getDoc(refCliente(bid, telefone));

  await setDoc(
    refCliente(bid, telefone),
    {
      nome,
      telefone,
      email: dados.email || null,
      nascimento: dados.nascimento || null,
      observacoes: dados.observacoes || null,
      ...(existente.exists()
        ? {}
        : {
            totalVisitas: 0,
            totalGastoCentavos: 0,
            ultimaVisitaDia: null,
            criadoEm: serverTimestamp(),
          }),
    },
    { merge: true },
  );

  return telefone;
}

/**
 * Versão usada pelo link público: só grava o nome se o cliente for novo,
 * para que alguém de fora não consiga sobrescrever a ficha de outra
 * pessoa apenas sabendo o telefone.
 */
export async function registrarClientePublico(bid, nome, telefoneBruto) {
  const telefone = digitos(telefoneBruto);
  try {
    await setDoc(
      refCliente(bid, telefone),
      {
        nome: String(nome).trim(),
        telefone,
        totalVisitas: 0,
        totalGastoCentavos: 0,
        ultimaVisitaDia: null,
        criadoEm: serverTimestamp(),
      },
      // sem merge: se já existe, a regra recusa e o catch abaixo segue em frente
    );
  } catch (erro) {
    if (erro?.code !== "permission-denied") throw erro;
  }
  return telefone;
}

/** Chamado quando um atendimento é marcado como realizado. */
export async function registrarVisita(bid, clienteId, { dia, precoCentavos }) {
  const atual = await getDoc(refCliente(bid, clienteId));
  if (!atual.exists()) return;

  const dados = atual.data();
  await updateDoc(refCliente(bid, clienteId), {
    totalVisitas: (dados.totalVisitas ?? 0) + 1,
    totalGastoCentavos: (dados.totalGastoCentavos ?? 0) + (precoCentavos ?? 0),
    ultimaVisitaDia:
      !dados.ultimaVisitaDia || dia > dados.ultimaVisitaDia ? dia : dados.ultimaVisitaDia,
  });
}

/** Clientes que já vieram mas sumiram — a lista para puxar retorno. */
export async function clientesSemRetorno(bid, diaLimite) {
  // O piso "2000-01-01" não é decorativo: no Firestore null ordena antes
  // de qualquer string, então sem ele a consulta traria também quem nunca
  // veio — exatamente o oposto de "não retorna há X dias".
  const snap = await getDocs(
    query(
      colClientes(bid),
      where("ultimaVisitaDia", ">=", "2000-01-01"),
      where("ultimaVisitaDia", "<", diaLimite),
      orderBy("ultimaVisitaDia"),
      limit(100),
    ),
  );
  return paraLista(snap);
}

export async function excluirCliente(bid, id) {
  await deleteDoc(refCliente(bid, id));
}

/** Busca local por nome ou telefone — a lista já vem inteira do Firestore. */
export function filtrarClientes(clientes, termo) {
  const t = String(termo ?? "").trim().toLowerCase();
  if (!t) return clientes;
  const soDigitos = digitos(t);
  return clientes.filter(
    (c) =>
      c.nome?.toLowerCase().includes(t) ||
      (soDigitos && String(c.telefone ?? "").includes(soDigitos)),
  );
}
