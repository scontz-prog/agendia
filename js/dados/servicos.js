/** Serviços oferecidos: preço e duração definem os horários do link público. */

import {
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
} from "../config/firebase.js";
import { colServicos, refServico, paraLista, porOrdem } from "./base.js";
import { paraCentavos } from "../lib/formato.js";
import { exigirContaAtiva } from "./situacao.js";

export async function listarServicos(bid, { somenteAtivos = false } = {}) {
  const lista = paraLista(await getDocs(colServicos(bid))).sort(porOrdem);
  return somenteAtivos ? lista.filter((s) => s.ativo) : lista;
}

function normalizar(dados) {
  const duracao = Math.round(Number(dados.duracaoMin) || 0);
  return {
    nome: String(dados.nome ?? "").trim(),
    descricao: dados.descricao || null,
    precoCentavos: paraCentavos(dados.preco),
    duracaoMin: duracao,
    ativo: dados.ativo !== false,
    ordem: Number(dados.ordem) || 0,
  };
}

export async function salvarServico(bid, id, dados) {
  exigirContaAtiva();

  const registro = normalizar(dados);
  if (registro.nome.length < 2) throw new Error("Informe o nome do serviço.");
  if (registro.duracaoMin < 5 || registro.duracaoMin > 480) {
    throw new Error("A duração precisa ficar entre 5 e 480 minutos.");
  }

  if (id) {
    await updateDoc(refServico(bid, id), registro);
    return id;
  }
  const ref = await addDoc(colServicos(bid), {
    ...registro,
    criadoEm: serverTimestamp(),
  });
  return ref.id;
}

export async function excluirServico(bid, id) {
  await deleteDoc(refServico(bid, id));
}
