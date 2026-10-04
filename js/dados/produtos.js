/**
 * Produtos à venda no balcão: pomada, shampoo, esmalte, o que for.
 *
 * É VITRINE, NÃO É LOJA
 * Não há carrinho, estoque nem pagamento. O catálogo existe para o
 * cliente ver o que o estabelecimento vende antes de chegar lá, e para a
 * equipe ter o preço à mão. Vender de verdade exigiria pagamento,
 * entrega e devolução — três problemas que não se resolvem de lado.
 *
 * A FOTO MORA NO DOCUMENTO
 * Mesmo caminho da logo e da foto do profissional: a imagem é reduzida no
 * navegador e gravada como data URI (ver `lib/imagem.js`). Por isso o
 * perfil do produto é menor que o de uma foto de verdade — um catálogo
 * com trinta itens baixa trinta imagens de uma vez na página pública.
 */

import {
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
} from "../config/firebase.js";
import { colProdutos, refProduto, paraLista, porOrdem } from "./base.js";
import { paraCentavos } from "../lib/formato.js";
import { exigirContaAtiva } from "./situacao.js";

export async function listarProdutos(bid, { somenteAtivos = false } = {}) {
  const lista = paraLista(await getDocs(colProdutos(bid))).sort(porOrdem);
  return somenteAtivos ? lista.filter((p) => p.ativo) : lista;
}

function normalizar(dados) {
  return {
    nome: String(dados.nome ?? "").trim(),
    descricao: String(dados.descricao ?? "").trim() || null,
    // Preço zero é permitido de propósito: brinde e cortesia também
    // aparecem no balcão, e "R$ 0,00" é mais honesto do que esconder.
    precoCentavos: Math.max(0, paraCentavos(dados.preco)),
    fotoUrl: dados.fotoUrl ?? null,
    ativo: dados.ativo !== false,
    ordem: Number(dados.ordem) || 0,
  };
}

export async function salvarProduto(bid, id, dados) {
  exigirContaAtiva();

  const registro = normalizar(dados);
  if (registro.nome.length < 2) throw new Error("Informe o nome do produto.");
  if (registro.descricao && registro.descricao.length > 300) {
    throw new Error("A descrição precisa ter até 300 caracteres.");
  }

  if (id) {
    await updateDoc(refProduto(bid, id), registro);
    return id;
  }

  const ref = await addDoc(colProdutos(bid), {
    ...registro,
    criadoEm: serverTimestamp(),
  });
  return ref.id;
}

export async function excluirProduto(bid, id) {
  exigirContaAtiva();
  await deleteDoc(refProduto(bid, id));
}
