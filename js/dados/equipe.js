/**
 * Quem tem acesso ao painel da barbearia.
 *
 * O MODELO
 * Ter conta de autenticação não abre o painel. O que abre é existir um
 * documento em `usuarios/{uid}` apontando para a barbearia. Isso separa
 * "ter login" de "ter acesso", e é o que permite revogar alguém sem
 * apagar a conta dele: some o documento, o login continua existindo e
 * simplesmente deixa de abrir o painel.
 *
 * QUEM CRIA
 * O dono não pede para o barbeiro se cadastrar — ele libera o acesso
 * daqui, com e-mail e senha. Autocadastro numa barbearia seria um buraco:
 * qualquer um que descobrisse o link entraria na equipe.
 *
 * PAPÉIS
 *   dono     — criado no cadastro da barbearia; não pode ser alterado nem
 *              removido por esta tela, para ninguém ficar sem acesso
 *   gerente  — mesma visão do dono
 *   barbeiro — só a própria agenda
 */

import {
  collection,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  db,
  serverTimestamp,
  criarLoginSemTrocarSessao,
} from "../config/firebase.js";
import { refUsuario, paraLista } from "./base.js";
import { exigirContaAtiva } from "./situacao.js";
import { termos, maiuscula, SEGMENTO_PADRAO } from "../config/segmentos.js";

/**
 * O ID DO PAPEL NÃO ACOMPANHA O SEGMENTO.
 *
 * "barbeiro" é o valor gravado em `usuarios/{uid}` e é por ele que as
 * regras do Firestore decidem o que a pessoa enxerga. Numa clínica a tela
 * mostra "Especialista", mas o banco continua com "barbeiro" — traduzir o
 * id derrubaria todo acesso já concedido, e as regras junto.
 */
export function papeisDoSegmento(origem) {
  const T = termos(origem);
  return {
    dono: {
      id: "dono",
      nome: "Dono",
      descricao: `Vê tudo e gerencia ${T.estabelecimentoArtigo}`,
    },
    gerente: { id: "gerente", nome: "Gerente", descricao: "Vê tudo, menos os acessos" },
    barbeiro: {
      id: "barbeiro",
      nome: maiuscula(T.profissional),
      descricao: "Vê apenas a própria agenda",
    },
  };
}

/** Papéis que o dono pode conceder. "dono" não está aqui de propósito. */
export function papeisConcediveis(origem) {
  const papeis = papeisDoSegmento(origem);
  return [papeis.gerente, papeis.barbeiro];
}

export const rotuloPapel = (papel, origem) =>
  papeisDoSegmento(origem)[papel]?.nome ?? papel;

const PAPEIS_VALIDOS = new Set(["gerente", "barbeiro"]);

export async function listarEquipe(barbeariaId) {
  const snap = await getDocs(
    query(collection(db, "usuarios"), where("barbeariaId", "==", barbeariaId)),
  );
  const ordem = { dono: 0, gerente: 1, barbeiro: 2 };
  return paraLista(snap).sort(
    (a, b) =>
      (ordem[a.papel] ?? 9) - (ordem[b.papel] ?? 9) ||
      String(a.nome).localeCompare(String(b.nome), "pt-BR"),
  );
}

/**
 * Libera acesso a alguém. Cria a conta de autenticação e o documento de
 * permissão — nessa ordem, porque sem o uid não há documento a criar.
 */
export async function liberarAcesso(barbeariaId, { nome, email, senha, papel, barbeiroId }) {
  exigirContaAtiva();

  const nomeLimpo = String(nome ?? "").trim();
  const emailLimpo = String(email ?? "").trim().toLowerCase();

  if (nomeLimpo.length < 2) throw new Error("Informe o nome da pessoa.");
  if (!emailLimpo.includes("@")) throw new Error("Informe um e-mail válido.");
  if (String(senha ?? "").length < 6) {
    throw new Error("A senha precisa ter ao menos 6 caracteres.");
  }
  if (!PAPEIS_VALIDOS.has(papel)) {
    throw new Error("Nível de acesso inválido.");
  }
  if (papel === "barbeiro" && !barbeiroId) {
    throw new Error("Escolha a qual cadastro esse acesso pertence.");
  }

  const uid = await criarLoginSemTrocarSessao(emailLimpo, senha);

  await setDoc(refUsuario(uid), {
    barbeariaId,
    nome: nomeLimpo,
    email: emailLimpo,
    papel,
    barbeiroId: papel === "barbeiro" ? barbeiroId : null,
    criadoEm: serverTimestamp(),
  });

  return uid;
}

export async function mudarPapel(uid, papel, barbeiroId = null) {
  exigirContaAtiva();
  if (!PAPEIS_VALIDOS.has(papel)) {
    throw new Error("Nível de acesso inválido.");
  }
  await updateDoc(refUsuario(uid), {
    papel,
    barbeiroId: papel === "barbeiro" ? barbeiroId : null,
  });
}

/**
 * Tira o acesso. A conta de autenticação continua existindo — só o
 * documento de permissão some. É o suficiente: sem ele o painel não abre.
 */
export async function revogarAcesso(uid) {
  exigirContaAtiva();
  await deleteDoc(refUsuario(uid));
}

/** Vincula o acesso a outro barbeiro cadastrado. */
export async function vincularBarbeiro(uid, barbeiroId) {
  exigirContaAtiva();
  await updateDoc(refUsuario(uid), { barbeiroId: barbeiroId || null });
}
