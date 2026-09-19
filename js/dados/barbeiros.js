/** Barbeiros da barbearia. */

import {
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
} from "../config/firebase.js";
import { colBarbeiros, refBarbeiro, paraLista, porOrdem } from "./base.js";
import { digitos } from "../lib/formato.js";
import { obterBarbearia } from "./barbearias.js";
import { limiteBarbeiros, plano as obterPlano } from "../config/planos.js";
import { exigirContaAtiva } from "./situacao.js";

export const CORES = [
  "#eca202",
  "#8e6bc8",
  "#d14d8b",
  "#e8643c",
  "#45c98a",
  "#c9a227",
  "#3fa9c9",
  "#e05252",
];

export async function listarBarbeiros(bid, { somenteAtivos = false } = {}) {
  const lista = paraLista(await getDocs(colBarbeiros(bid))).sort(porOrdem);
  return somenteAtivos ? lista.filter((b) => b.ativo) : lista;
}

function normalizar(dados) {
  const comissao = Number(String(dados.comissao ?? 0).replace(",", "."));
  return {
    nome: String(dados.nome ?? "").trim(),
    telefone: digitos(dados.telefone) || null,
    comissao: Number.isFinite(comissao) ? Math.min(100, Math.max(0, comissao)) : 0,
    cor: dados.cor || CORES[0],
    // data URI já reduzido por lib/imagem.js; null quando não há foto
    fotoUrl: dados.fotoUrl || null,
    ativo: dados.ativo !== false,
    ordem: Number(dados.ordem) || 0,
  };
}

export async function salvarBarbeiro(bid, id, dados) {
  exigirContaAtiva();

  const registro = normalizar(dados);
  if (registro.nome.length < 2) throw new Error("Informe o nome do barbeiro.");

  await conferirLimiteDoPlano(bid, id, registro);

  if (id) {
    await updateDoc(refBarbeiro(bid, id), registro);
    return id;
  }
  const ref = await addDoc(colBarbeiros(bid), {
    ...registro,
    criadoEm: serverTimestamp(),
  });
  return ref.id;
}

export async function excluirBarbeiro(bid, id) {
  await deleteDoc(refBarbeiro(bid, id));
}

/**
 * Limite de barbeiros ativos por plano.
 *
 * Conta só os ATIVOS: quem saiu da equipe fica no cadastro para o
 * histórico não perder o nome de quem atendeu, e não deve pesar no
 * limite comercial.
 *
 * Esta checagem vive no aplicativo, não nas regras — o Firestore não
 * sabe contar documentos de uma coleção dentro de uma regra. Ou seja: é
 * contornável por quem abrir o console. Serve para orientar um cliente
 * honesto na escolha do plano, não para conter um invasor. O que precisa
 * ser inviolável está no firestore.rules.
 */
async function conferirLimiteDoPlano(bid, id, registro) {
  if (!registro.ativo) return;

  const barbearia = await obterBarbearia(bid);
  const max = limiteBarbeiros(barbearia?.plano);
  if (max === null) return;

  const jaAtivos = (await listarBarbeiros(bid)).filter((b) => b.ativo && b.id !== id);
  if (jaAtivos.length < max) return;

  const nome = obterPlano(barbearia?.plano).nome;
  throw new Error(
    `O plano ${nome} permite ${max} barbeiro(s) ativo(s). ` +
      "Desative outro barbeiro ou fale com a plataforma para mudar de plano.",
  );
}
