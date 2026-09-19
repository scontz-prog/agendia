/** Barbearia: criação (onboarding), dados públicos e horário de funcionamento. */

import {
  db,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  query,
  where,
  limit,
  runTransaction,
  serverTimestamp,
} from "../config/firebase.js";
import {
  refBarbearia,
  refSlug,
  refUsuario,
  colBarbearias,
  paraObjeto,
  paraLista,
} from "./base.js";
import { paraSlug, digitos } from "../lib/formato.js";
import { exigirContaAtiva } from "./situacao.js";
import { SEGMENTOS, SEGMENTO_PADRAO } from "../config/segmentos.js";

/** Segunda a sábado, 09:00–19:00. Domingo fechado. */
export function horariosPadrao() {
  const horarios = {};
  for (let dia = 0; dia <= 6; dia++) {
    horarios[dia] = { ativo: dia >= 1 && dia <= 6, abre: "09:00", fecha: "19:00" };
  }
  return horarios;
}

/**
 * Cria a barbearia e vincula o usuário logado como dono.
 *
 * Roda numa transação com o documento `slugs/{slug}`: ele funciona como
 * índice do link público e, por ser criado dentro da transação, também
 * garante que duas barbearias não fiquem com o mesmo endereço.
 */
export async function criarBarbearia(usuario, { nome, slug, telefone, segmento }) {
  const base = paraSlug(slug || nome);
  if (base.length < 3) {
    throw new Error("Escolha um nome com pelo menos 3 letras.");
  }

  // O segmento vem de um seletor, mas quem chega por outro caminho não
  // pode gravar um valor que `termos()` não conhece — cairia no padrão em
  // toda tela e o campo ficaria mentindo no banco.
  const segmentoEscolhido = SEGMENTOS[segmento] ? segmento : SEGMENTO_PADRAO;

  const escolhido = await slugLivre(base);
  const bid = crypto.randomUUID();

  await runTransaction(db, async (tx) => {
    const slugSnap = await tx.get(refSlug(escolhido));
    if (slugSnap.exists()) {
      throw new Error("Esse endereço acabou de ser usado por outra barbearia.");
    }

    tx.set(refBarbearia(bid), {
      nome: nome.trim(),
      slug: escolhido,
      telefone: digitos(telefone) || null,
      whatsapp: digitos(telefone) || null,
      email: usuario.email ?? null,
      endereco: null,
      instagram: null,
      timezone: "America/Sao_Paulo",
      segmento: segmentoEscolhido,
      // O segmento é escolhido aqui e NÃO muda depois: numa clínica ele
      // define o vocabulário de tudo, e trocar de ramo é outro cadastro,
      // não uma edição. Só a administração da plataforma altera.
      plano: "basico",
      // Nasce pendente: quem se cadastra entra na fila de aprovação, não
      // na plataforma. A regra do Firestore exige este valor na criação,
      // então não adianta o aplicativo pedir outra coisa.
      aprovacao: "pendente",
      solicitadaEm: serverTimestamp(),
      ativa: true,
      horarios: horariosPadrao(),
      criadoEm: serverTimestamp(),
    });

    tx.set(refSlug(escolhido), { barbeariaId: bid });

    tx.set(refUsuario(usuario.uid), {
      barbeariaId: bid,
      nome: usuario.displayName || (usuario.email ?? "").split("@")[0],
      email: usuario.email ?? null,
      papel: "dono",
      criadoEm: serverTimestamp(),
    });
  });

  return bid;
}

/** Acha um endereço livre acrescentando -2, -3… quando o desejado existe. */
async function slugLivre(base) {
  for (let n = 1; n <= 30; n++) {
    const tentativa = n === 1 ? base : `${base}-${n}`;
    const snap = await getDoc(refSlug(tentativa));
    if (!snap.exists()) return tentativa;
  }
  return `${base}-${Date.now().toString(36)}`;
}

export async function obterBarbearia(bid) {
  return paraObjeto(await getDoc(refBarbearia(bid)));
}

/** Usada pela página pública: resolve o link /agendar.html?b=slug. */
export async function obterBarbeariaPorSlug(slug) {
  const slugSnap = await getDoc(refSlug(slug));
  if (slugSnap.exists()) {
    return obterBarbearia(slugSnap.data().barbeariaId);
  }

  // fallback: barbearias criadas antes do índice de slugs
  const snap = await getDocs(query(colBarbearias(), where("slug", "==", slug), limit(1)));
  return paraLista(snap)[0] ?? null;
}

/**
 * O SEGMENTO NÃO ENTRA AQUI, de propósito.
 *
 * Ele saiu do formulário quando passou a ser decisão da plataforma. Se
 * continuasse nesta gravação, `dados.segmento` chegaria `undefined` e o
 * padrão transformaria toda clínica em barbearia no primeiro salvamento
 * de telefone — e, no Firebase, a regra recusaria a gravação inteira,
 * deixando o dono sem conseguir editar nem o próprio nome.
 */
export async function salvarDadosBarbearia(bid, dados) {
  await updateDoc(refBarbearia(bid), {
    nome: dados.nome.trim(),
    telefone: digitos(dados.telefone) || null,
    whatsapp: digitos(dados.whatsapp) || null,
    endereco: dados.endereco || null,
    instagram: (dados.instagram || "").replace(/^@/, "") || null,
    timezone: dados.timezone || "America/Sao_Paulo",
  });
}

export async function salvarHorarios(bid, horarios) {
  await updateDoc(refBarbearia(bid), { horarios });
}

/**
 * Configuração do lembrete automático por e-mail.
 *
 * Quem executa isto é a Cloud Function, que roda no Google e não tem
 * navegador: ela não sabe em que endereço o site foi publicado. Por isso
 * o `linkPublico` é gravado aqui junto, resolvido pelo painel — é a única
 * forma de a variável {link} chegar certa no e-mail.
 */
export async function salvarLembretes(bid, config) {
  exigirContaAtiva();

  const hora = Number(config.horaEnvio);
  const dias = Number(config.diasAntes);

  await updateDoc(refBarbearia(bid), {
    lembretes: {
      ativo: Boolean(config.ativo),
      modeloId: config.modeloId || null,
      horaEnvio: Number.isFinite(hora) ? Math.min(23, Math.max(0, hora)) : 18,
      diasAntes: Number.isFinite(dias) ? Math.min(7, Math.max(0, dias)) : 1,
      linkPublico: config.linkPublico ?? null,
      atualizadoEm: new Date().toISOString(),
    },
  });
}

/**
 * Grava a logo da barbearia como data URI dentro do próprio documento.
 * Passar null remove. A imagem já chega reduzida por lib/imagem.js — aqui
 * não se aceita arquivo bruto justamente para o documento não estourar o
 * limite de 1 MiB do Firestore.
 */
export async function salvarLogo(bid, logoUrl) {
  exigirContaAtiva();
  await updateDoc(refBarbearia(bid), { logoUrl: logoUrl || null });
}

/** Horário de funcionamento de um dia da semana (0 = domingo). */
export function expedienteDoDia(barbearia, diaSemana) {
  const h = barbearia?.horarios?.[diaSemana] ?? barbearia?.horarios?.[String(diaSemana)];
  if (!h || !h.ativo) return null;
  return { abre: h.abre, fecha: h.fecha };
}

/**
 * URL completa do link de agendamento, pronta para colar no Instagram.
 * Resolvida com URL() em vez de recortar a string: o painel roda com um
 * hash na barra de endereço (#/agenda) e um replace ingênuo cortaria ali.
 */
export function linkPublico(slug) {
  return new URL(`agendar.html?b=${encodeURIComponent(slug)}`, location.href).href;
}
