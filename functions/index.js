/**
 * Notificações por e-mail do Agendia.
 *
 * POR QUE ISTO EXISTE FORA DO SITE
 * O painel é um site estático: quando ninguém está com o navegador
 * aberto, nada dele está rodando — e lembrete de horário precisa de algo
 * acordado na hora certa. Além disso, a senha/chave do serviço de e-mail
 * não pode viver no JavaScript do navegador, onde qualquer visitante a
 * leria no console e passaria a mandar e-mail em nome do estabelecimento.
 *
 * O QUE RODA AQUI
 *   aoCriarAgendamento   — acionada a cada agendamento novo:
 *                           · confirmação para o cliente
 *                           · aviso para o estabelecimento (só os que
 *                             vieram pelo link público — os do painel, o
 *                             próprio estabelecimento acabou de lançar)
 *   lembretesPorEmail    — de 15 em 15 minutos: lembrete para o cliente
 *                           algumas horas antes do horário
 *
 * Tudo registrado em `comunicacoes`, com id derivado do agendamento e
 * gravado ANTES do envio: se a função rodar duas vezes, a segunda
 * esbarra no registro e não manda de novo.
 *
 * O painel não muda: continua estático no GitHub Pages. Ele só grava os
 * agendamentos e a configuração; quem envia é isto aqui.
 *
 * DEPLOY: ver README, "Etapa 5".
 */

import { onSchedule } from "firebase-functions/v2/scheduler";
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { defineSecret, defineString } from "firebase-functions/params";
import { logger } from "firebase-functions";
import { initializeApp } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import nodemailer from "nodemailer";
import {
  agoraNoFuso,
  somarDias,
  minutosAte,
  aplicarVariaveis,
  valoresDo,
  TEXTO_CONFIRMACAO,
  TEXTO_LEMBRETE,
  textoAvisoEmpresa,
} from "./texto.js";

initializeApp();
const db = getFirestore();

/** Mesma região do banco (São Paulo): gatilho do Firestore exige. */
const REGIAO = "southamerica-east1";

/* ------------------------------------------------------------------ */
/* Configuração — preenchida no deploy, nunca no código                */
/* ------------------------------------------------------------------ */

/**
 * Por onde o e-mail sai:
 *   "gmail"  — uma conta Gmail com senha de app. Não exige domínio
 *              próprio; limite de ~500 envios/dia. Bom para começar.
 *   "resend" — serviço de envio. Exige domínio próprio verificado (SPF e
 *              DKIM); é o caminho quando o volume crescer.
 */
const PROVEDOR = defineString("EMAIL_PROVEDOR", { default: "gmail" });

/**
 * Remetente.
 *   gmail:  o endereço da conta, ex. "agendia.avisos@gmail.com"
 *   resend: "Agendia <avisos@seudominio.com.br>" (domínio verificado)
 */
const REMETENTE = defineString("EMAIL_REMETENTE");

/**
 * SEGREDO. Para gmail, a senha de app (16 letras, criada em
 * myaccount.google.com › Segurança › Senhas de app). Para resend, a
 * chave da API. Fica no Secret Manager do Google:
 *   firebase functions:secrets:set EMAIL_SEGREDO
 */
const SEGREDO = defineSecret("EMAIL_SEGREDO");

/** Nome que aparece como remetente na caixa de entrada. */
const NOME_REMETENTE = "Agendia";

/** Trava de custo: de quantas contas cuidar por execução do lembrete. */
const MAX_CONTAS = 200;

/* ------------------------------------------------------------------ */
/* Envio                                                               */
/* ------------------------------------------------------------------ */

let transporteGmail = null;

async function enviarEmail({ para, assunto, texto, responderPara }) {
  if (PROVEDOR.value() === "resend") {
    const resposta = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${SEGREDO.value()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: REMETENTE.value(),
        to: [para],
        subject: assunto,
        text: texto,
        ...(responderPara ? { reply_to: responderPara } : {}),
      }),
    });
    if (!resposta.ok) {
      const corpo = await resposta.text().catch(() => "");
      throw new Error(`Resend recusou (${resposta.status}): ${corpo.slice(0, 300)}`);
    }
    return (await resposta.json().catch(() => ({}))).id ?? null;
  }

  transporteGmail ??= nodemailer.createTransport({
    service: "gmail",
    auth: { user: REMETENTE.value(), pass: SEGREDO.value() },
  });
  const info = await transporteGmail.sendMail({
    from: `"${NOME_REMETENTE}" <${REMETENTE.value()}>`,
    to: para,
    subject: assunto,
    text: texto,
    // A resposta vai para quem interessa: o cliente responde ao
    // estabelecimento, o estabelecimento responde ao cliente — nunca para
    // a caixa de envio da plataforma, que ninguém lê.
    ...(responderPara ? { replyTo: responderPara } : {}),
  });
  return info.messageId ?? null;
}

/* ------------------------------------------------------------------ */
/* Registro com trava de duplicidade                                   */
/* ------------------------------------------------------------------ */

const emailValido = (v) =>
  typeof v === "string" && v.length <= 120 && /^[^@ ]+@[^@ ]+[.][^@ ]+$/.test(v);

/** A conta pode falar com a carteira dela? */
function contaPodeEnviar(barbearia) {
  // Suspensa ou não aprovada não escreve para cliente nenhum em nome do
  // estabelecimento — suspender tem que parar isso também, não só o link.
  return Boolean(barbearia)
    && barbearia.ativa !== false
    && (barbearia.aprovacao ?? "aprovada") === "aprovada";
}

/**
 * Grava o registro e envia. Devolve "enviado", "ja-enviado" ou "falhou".
 *
 * A marca é gravada ANTES do envio, com `create` (falha se já existir):
 * numa reexecução, o pior caso é o cliente não receber — nunca receber
 * duas vezes, que é o erro que ele percebe e reclama.
 */
async function registrarEEnviar({ bid, idRegistro, para, assunto, texto, responderPara, extra }) {
  const registro = db.doc(`barbearias/${bid}/comunicacoes/${idRegistro}`);
  try {
    await registro.create({
      ...extra,
      canal: "email",
      clienteEmail: para,
      assunto,
      texto,
      automatico: true,
      status: "enviando",
      enviadoEm: FieldValue.serverTimestamp(),
    });
  } catch (erro) {
    if (erro.code === 6 || String(erro.message).includes("ALREADY_EXISTS")) return "ja-enviado";
    throw erro;
  }

  try {
    const idExterno = await enviarEmail({ para, assunto, texto, responderPara });
    await registro.update({ status: "enviado", idExterno });
    return "enviado";
  } catch (erro) {
    logger.error(`Falha ao enviar ${idRegistro} para ${para}`, erro);
    await registro.update({ status: "falhou", erro: String(erro.message).slice(0, 500) });
    return "falhou";
  }
}

/* ------------------------------------------------------------------ */
/* 1 e 2 — Agendamento novo: confirmação ao cliente e aviso à empresa  */
/* ------------------------------------------------------------------ */

export const aoCriarAgendamento = onDocumentCreated(
  {
    document: "barbearias/{bid}/agendamentos/{aid}",
    region: REGIAO,
    secrets: [SEGREDO],
    retry: false, // reenviar em duplicidade é pior do que não reenviar
  },
  async (evento) => {
    const { bid, aid } = evento.params;
    const a = { id: aid, ...evento.data?.data() };
    if (!["agendado", "confirmado"].includes(a.status)) return;

    const snap = await db.doc(`barbearias/${bid}`).get();
    const barbearia = snap.exists ? { id: bid, ...snap.data() } : null;
    if (!contaPodeEnviar(barbearia)) return;

    const cfg = barbearia.lembretes ?? {};
    const valores = valoresDo(a, { nome: a.clienteNome }, barbearia, cfg.linkPublico || "");
    const emailEmpresa = emailValido(cfg.emailAvisos) ? cfg.emailAvisos : barbearia.email;
    const base = { clienteId: a.clienteId ?? null, clienteNome: a.clienteNome ?? null, agendamentoId: aid };

    // 1. Confirmação para o cliente (padrão: ligada)
    if (cfg.confirmacaoCliente !== false && emailValido(a.clienteEmail)) {
      await registrarEEnviar({
        bid,
        idRegistro: `confirmacao_${aid}`,
        para: a.clienteEmail,
        assunto: aplicarVariaveis(TEXTO_CONFIRMACAO.assunto, valores),
        texto: aplicarVariaveis(TEXTO_CONFIRMACAO.texto, valores),
        responderPara: emailValido(emailEmpresa) ? emailEmpresa : null,
        extra: { ...base, tipo: "confirmacao" },
      });
    }

    // 2. Aviso para o estabelecimento — só o que veio pelo link público
    if (cfg.avisoEmpresa !== false && a.origem === "publico" && emailValido(emailEmpresa)) {
      const { assunto, texto } = textoAvisoEmpresa(a, barbearia);
      await registrarEEnviar({
        bid,
        idRegistro: `aviso_empresa_${aid}`,
        para: emailEmpresa,
        assunto,
        texto,
        responderPara: emailValido(a.clienteEmail) ? a.clienteEmail : null,
        extra: { ...base, tipo: "aviso_empresa", destinatario: "estabelecimento" },
      });
    }
  },
);

/* ------------------------------------------------------------------ */
/* 3 — Lembrete algumas horas antes do horário                         */
/* ------------------------------------------------------------------ */

export const lembretesPorEmail = onSchedule(
  {
    // De 15 em 15 minutos: o lembrete sai na janela de "faltam X horas",
    // com no máximo 15 minutos de diferença do horário ideal.
    schedule: "*/15 * * * *",
    timeZone: "America/Sao_Paulo",
    region: REGIAO,
    secrets: [SEGREDO],
    retryCount: 0,
  },
  async () => {
    const contas = await db
      .collection("barbearias")
      .where("lembretes.ativo", "==", true)
      .limit(MAX_CONTAS)
      .get();

    let enviados = 0;
    for (const conta of contas.docs) {
      try {
        enviados += await lembrarConta({ id: conta.id, ...conta.data() });
      } catch (erro) {
        logger.error(`Lembretes da conta ${conta.id} falharam`, erro);
      }
    }
    if (enviados) logger.info(`Lembretes enviados: ${enviados}`);
  },
);

async function lembrarConta(barbearia) {
  if (!contaPodeEnviar(barbearia)) return 0;

  const cfg = barbearia.lembretes ?? {};
  const horas = Math.min(48, Math.max(1, Number(cfg.antecedenciaHoras) || 2));
  const agora = agoraNoFuso(barbearia.timezone || "America/Sao_Paulo");

  // Modelo próprio, se a conta escolheu um de e-mail; senão, o padrão.
  let modelo = TEXTO_LEMBRETE;
  if (cfg.modeloId) {
    const m = await db.doc(`barbearias/${barbearia.id}/modelos/${cfg.modeloId}`).get();
    if (m.exists && m.data().canal === "email") {
      modelo = { assunto: m.data().assunto || TEXTO_LEMBRETE.assunto, texto: m.data().texto };
    }
  }

  // Até 48h à frente cobre no máximo hoje + 2 dias. Filtro de campo
  // único (`in`), para não exigir índice composto.
  const dias = [0, 1, 2].map((n) => somarDias(agora.dia, n));
  const snap = await db
    .collection(`barbearias/${barbearia.id}/agendamentos`)
    .where("dia", "in", dias)
    .get();

  let enviados = 0;
  for (const doc of snap.docs) {
    const a = { id: doc.id, ...doc.data() };
    if (!["agendado", "confirmado"].includes(a.status)) continue;

    const faltam = minutosAte(agora, a.dia, a.inicioMin);
    if (faltam <= 0 || faltam > horas * 60) continue;

    // Quem marcou há menos de uma hora acabou de receber a confirmação;
    // mandar o lembrete em seguida é ruído.
    const criado = a.criadoEm?.toMillis?.() ?? 0;
    if (criado && Date.now() - criado < 60 * 60 * 1000) continue;

    let email = emailValido(a.clienteEmail) ? a.clienteEmail : null;
    let ficha = null;
    if (a.clienteId) {
      const f = await db.doc(`barbearias/${barbearia.id}/clientes/${a.clienteId}`).get();
      ficha = f.exists ? f.data() : null;
    }
    if (!email && emailValido(ficha?.email)) email = ficha.email;
    if (!email) continue;
    // Quem pediu para não receber, não recebe — inclusive no automático.
    if (ficha?.aceitaMensagens === false) continue;

    const valores = valoresDo(a, ficha ?? { nome: a.clienteNome }, barbearia, cfg.linkPublico || "");
    const resultado = await registrarEEnviar({
      bid: barbearia.id,
      idRegistro: `lembrete_${a.id}`,
      para: email,
      assunto: aplicarVariaveis(modelo.assunto, valores),
      texto: aplicarVariaveis(modelo.texto, valores),
      responderPara: emailValido(cfg.emailAvisos) ? cfg.emailAvisos : barbearia.email ?? null,
      extra: {
        tipo: "lembrete",
        clienteId: a.clienteId ?? null,
        clienteNome: a.clienteNome ?? null,
        agendamentoId: a.id,
        modeloId: cfg.modeloId ?? null,
      },
    });
    if (resultado === "enviado") enviados += 1;
  }
  return enviados;
}
