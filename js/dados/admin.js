/**
 * Camada de dados do administrador da plataforma.
 *
 * ESCOPO, DE PROPÓSITO ESTREITO
 * O administrador enxerga a barbearia como *conta*: nome, contato, plano,
 * situação, tamanho e último acesso. Não enxerga agenda, clientes nem
 * faturamento — esses dados são dos clientes das barbearias, não seus.
 * As regras do Firestore reforçam isso: nem se este arquivo pedisse, o
 * banco entregaria.
 *
 * O que ele pode escrever é igualmente estreito: `plano` e `ativa`. A
 * regra usa `hasOnly` nesses dois campos, então um erro de programação
 * aqui não consegue renomear a barbearia de ninguém.
 */

import {
  db,
  auth,
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
} from "../config/firebase.js";
import { colBarbeiros, colServicos, refBarbearia, paraLista } from "./base.js";

export const refAdmin = (uid) => doc(db, "admins", uid);

/** O documento `admins/{uid}` é a permissão. Criado à mão, nunca pelo app. */
export async function ehAdministrador(uid) {
  if (!uid) return false;
  try {
    return (await getDoc(refAdmin(uid))).exists();
  } catch {
    // sem permissão de leitura = não é admin
    return false;
  }
}

export async function souAdministrador() {
  return ehAdministrador(auth.currentUser?.uid);
}

/**
 * Lista as contas com os números que o administrador precisa.
 *
 * A contagem de barbeiros e serviços vem de coleções que já são de
 * leitura pública (o link de agendamento depende delas), então nada de
 * privado é acessado aqui. São duas leituras por barbearia: aceitável na
 * escala de dezenas ou centenas de contas, que é o horizonte real.
 */
export async function listarContas() {
  const snap = await getDocs(collection(db, "barbearias"));
  const barbearias = paraLista(snap);

  const contas = await Promise.all(
    barbearias.map(async (b) => {
      const [barbeiros, servicos] = await Promise.all([
        getDocs(colBarbeiros(b.id)),
        getDocs(colServicos(b.id)),
      ]);

      const listaBarbeiros = paraLista(barbeiros);

      return {
        id: b.id,
        nome: b.nome,
        slug: b.slug,
        email: b.email ?? null,
        telefone: b.telefone ?? null,
        logoUrl: b.logoUrl ?? null,
        // O painel descreve cada conta no vocabulário do segmento dela.
        // Sem este campo, `termos()` cai no padrão e a lista inteira
        // aparece como barbearia — exatamente o que a plataforma não é.
        segmento: b.segmento ?? null,
        plano: b.plano ?? "basico",
        ativa: b.ativa !== false,
        // Conta antiga, sem o campo, conta como aprovada: um cadastro
        // que já funcionava não pode cair na fila por falta de um campo.
        aprovacao: b.aprovacao ?? "aprovada",
        motivoRejeicao: b.motivoRejeicao ?? null,
        solicitadaEm: b.solicitadaEm ?? b.criadoEm ?? null,
        criadoEm: b.criadoEm ?? null,
        ultimoAcessoEm: b.ultimoAcessoEm ?? null,
        qtdBarbeiros: listaBarbeiros.length,
        qtdBarbeirosAtivos: listaBarbeiros.filter((x) => x.ativo).length,
        qtdServicos: paraLista(servicos).length,
      };
    }),
  );

  return contas.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}

export async function definirPlano(barbeariaId, plano) {
  await updateDoc(refBarbearia(barbeariaId), { plano });
}

/**
 * Suspender NÃO apaga nem esconde o histórico da barbearia: ela continua
 * entrando e consultando. O que para é a gravação de coisas novas e o
 * link público. Tirar o acesso ao próprio dado de quem atrasou uma
 * mensalidade seria desproporcional — e péssimo para reconquistar o
 * cliente depois.
 */
export async function definirSituacao(barbeariaId, ativa) {
  await updateDoc(refBarbearia(barbeariaId), { ativa });
}

/* ------------------------------------------------------------------ */
/* Aprovação de cadastro                                               */
/* ------------------------------------------------------------------ */

export const APROVACOES = {
  pendente: { id: "pendente", nome: "Pendente", etiqueta: "etiqueta-pendente" },
  aprovada: { id: "aprovada", nome: "Aprovada", etiqueta: "etiqueta-realizado" },
  rejeitada: { id: "rejeitada", nome: "Rejeitada", etiqueta: "etiqueta-cancelado" },
};

/** Contas antigas, sem o campo, contam como aprovadas. */
export const situacaoAprovacao = (conta) => conta?.aprovacao ?? "aprovada";

/**
 * Aprova ou rejeita um cadastro.
 *
 * Rejeitar não apaga nada: a conta continua existindo, o dono continua
 * entrando e vendo o que preencheu, e a decisão pode ser revertida. Apagar
 * cadastro de terceiro por decisão unilateral seria desproporcional — e
 * impediria de reconsiderar depois de uma conversa.
 */
export async function definirAprovacao(barbeariaId, aprovacao, motivo = null) {
  if (!APROVACOES[aprovacao]) throw new Error("Situação de aprovação inválida.");

  await updateDoc(refBarbearia(barbeariaId), {
    aprovacao,
    aprovadaEm: serverTimestamp(),
    aprovadaPor: auth.currentUser?.uid ?? null,
    motivoRejeicao: aprovacao === "rejeitada" ? (motivo || null) : null,
  });
}

/**
 * Troca o segmento de uma conta.
 *
 * Só a administração faz isto, e a regra do Firestore exige a permissão
 * `podeAlterarSegmento` — não basta a tela deixar. O segmento define o
 * vocabulário do sistema inteiro para aquele cliente; mudar é o tipo de
 * coisa que se faz depois de uma conversa, não por engano num seletor.
 */
export async function definirSegmento(barbeariaId, segmento) {
  await updateDoc(refBarbearia(barbeariaId), { segmento });
}

/* ------------------------------------------------------------------ */
/* Permissões de cadastro — quem administra os administradores         */
/* ------------------------------------------------------------------ */

/**
 * A ficha do administrador em uso, com as permissões dele.
 *
 * O principal tem tudo por definição; os demais, só o que estiver
 * marcado. Devolve `null` para quem não é administrador.
 */
export async function minhaFichaAdmin() {
  const uid = auth.currentUser?.uid;
  if (!uid) return null;

  try {
    const snap = await getDoc(refAdmin(uid));
    if (!snap.exists()) return null;

    const dados = snap.data();
    const principal = dados.principal === true;

    return {
      uid,
      ...dados,
      principal,
      podeAprovar: principal || dados.podeAprovar === true,
      podeAlterarSegmento: principal || dados.podeAlterarSegmento === true,
    };
  } catch {
    return null;
  }
}

export async function listarAdministradores() {
  const snap = await getDocs(collection(db, "admins"));
  return paraLista(snap).sort((a, b) =>
    Number(b.principal === true) - Number(a.principal === true) ||
    String(a.nome ?? a.email ?? a.id).localeCompare(String(b.nome ?? b.email ?? b.id), "pt-BR"),
  );
}

/**
 * Cria ou ajusta um administrador auxiliar.
 *
 * `principal` NUNCA é gravado por aqui: a regra do Firestore recusa. Um
 * administrador principal é decisão de console, para que revogar o acesso
 * de alguém seja sempre suficiente — se o app pudesse criar principais,
 * bastaria uma senha vazada para fabricar outro.
 */
export async function salvarAdministrador(uid, { nome, email, podeAprovar, podeAlterarSegmento }) {
  const limpo = String(uid ?? "").trim();
  if (limpo.length < 10) {
    throw new Error("Informe o UID do usuário (Authentication › Users, no console do Firebase).");
  }

  await setDoc(
    refAdmin(limpo),
    {
      nome: String(nome ?? "").trim() || null,
      email: String(email ?? "").trim().toLowerCase() || null,
      podeAprovar: Boolean(podeAprovar),
      podeAlterarSegmento: Boolean(podeAlterarSegmento),
      atualizadoEm: serverTimestamp(),
    },
    { merge: true },
  );
}

export async function removerAdministrador(uid) {
  await deleteDoc(refAdmin(uid));
}

/**
 * Marca que a conta teve uso. Escrito pelo painel da própria barbearia,
 * não pelo admin — é a única forma de o administrador saber quem está
 * vivo sem bisbilhotar a agenda.
 */
export async function registrarAcesso(barbeariaId) {
  await updateDoc(refBarbearia(barbeariaId), { ultimoAcessoEm: serverTimestamp() });
}

/** Números do topo do painel do administrador. */
export function resumoPlataforma(contas) {
  const ativas = contas.filter((c) => c.ativa);
  const porPlano = {};
  for (const c of contas) porPlano[c.plano] = (porPlano[c.plano] ?? 0) + 1;

  return {
    total: contas.length,
    ativas: ativas.length,
    suspensas: contas.length - ativas.length,
    pendentes: contas.filter((c) => situacaoAprovacao(c) === "pendente").length,
    rejeitadas: contas.filter((c) => situacaoAprovacao(c) === "rejeitada").length,
    semBarbeiro: contas.filter((c) => c.qtdBarbeirosAtivos === 0).length,
    porPlano,
  };
}
