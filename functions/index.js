/**
 * Lembrete automático de agendamento, por e-mail.
 *
 * POR QUE ISTO EXISTE FORA DO SITE
 * O painel é um site estático: quando ninguém está com o navegador
 * aberto, nada dele está rodando — e lembrete da véspera precisa de algo
 * acordado na véspera. Além disso, a chave do serviço de e-mail não pode
 * viver no JavaScript do navegador, onde qualquer visitante a leria no
 * console e passaria a mandar e-mail no nome do estabelecimento.
 *
 * Esta função resolve as duas coisas: ela é o despertador e é o cofre.
 *
 * O QUE ELA FAZ, UMA VEZ POR HORA
 *   1. procura as contas com lembrete ligado;
 *   2. para cada uma, vê que horas são NO FUSO DELA — só age na hora que
 *      o dono escolheu;
 *   3. varre os agendamentos do dia-alvo (véspera, por padrão);
 *   4. monta o texto com o modelo da própria conta;
 *   5. envia e registra em `comunicacoes`.
 *
 * O painel não muda: continua estático, no GitHub Pages. Ele só grava a
 * configuração; quem executa é isto aqui.
 *
 * DEPLOY
 *   firebase deploy --only functions
 */

import { onSchedule } from "firebase-functions/v2/scheduler";
import { defineSecret, defineString } from "firebase-functions/params";
import { logger } from "firebase-functions";
import { initializeApp } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { agoraNoFuso, somarDias, aplicarVariaveis, valoresDo } from "./texto.js";

initializeApp();
const db = getFirestore();

/* ------------------------------------------------------------------ */
/* Configuração — preenchida no deploy, nunca no código                */
/* ------------------------------------------------------------------ */

/**
 * Chave do serviço de e-mail. É SEGREDO: fica no Secret Manager do
 * Google, não no repositório. Definir com:
 *   firebase functions:secrets:set RESEND_API_KEY
 */
const CHAVE_EMAIL = defineSecret("RESEND_API_KEY");

/**
 * Remetente. Precisa ser de um domínio VERIFICADO no serviço de envio —
 * com SPF e DKIM configurados. Sem isso o e-mail cai em spam, e lembrete
 * no spam é pior do que lembrete nenhum: o dono acha que avisou.
 *
 * Exemplo: "Agendia <avisos@seudominio.com.br>"
 */
const REMETENTE = defineString("EMAIL_REMETENTE");

/** De quantas contas cuidar por execução. Trava de segurança de custo. */
const MAX_CONTAS = 200;

/* ------------------------------------------------------------------ */
/* Envio                                                               */
/*                                                                     */
/* Isolado numa função só para trocar de serviço sem mexer no resto.   */
/* Hoje é o Resend; SendGrid, Amazon SES ou Postmark entram aqui, com  */
/* o mesmo formato de entrada e saída.                                 */
/* ------------------------------------------------------------------ */
async function enviarEmail({ para, assunto, texto, responderPara }) {
  const resposta = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${CHAVE_EMAIL.value()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: REMETENTE.value(),
      to: [para],
      subject: assunto,
      text: texto,
      // Resposta vai para o estabelecimento, não para a plataforma. Quem
      // responde "posso remarcar?" está falando com o salão.
      ...(responderPara ? { reply_to: responderPara } : {}),
    }),
  });

  if (!resposta.ok) {
    const corpo = await resposta.text().catch(() => "");
    throw new Error(`Serviço de e-mail recusou (${resposta.status}): ${corpo.slice(0, 300)}`);
  }

  const dados = await resposta.json().catch(() => ({}));
  return dados.id ?? null;
}

/* ------------------------------------------------------------------ */
/* A função agendada                                                   */
/* ------------------------------------------------------------------ */

export const lembretesPorEmail = onSchedule(
  {
    // De hora em hora, cheia. A conta escolhe em QUE hora quer o envio, e
    // cada uma pode estar num fuso diferente — por isso a varredura é
    // horária e o filtro é feito por conta, e não pelo cron.
    schedule: "0 * * * *",
    timeZone: "America/Sao_Paulo",
    region: "southamerica-east1",
    secrets: [CHAVE_EMAIL],
    retryCount: 0, // reenviar lembrete duplicado é pior do que não reenviar
  },
  async () => {
    const contas = await db
      .collection("barbearias")
      .where("lembretes.ativo", "==", true)
      .limit(MAX_CONTAS)
      .get();

    if (contas.empty) {
      logger.info("Nenhuma conta com lembrete ligado.");
      return;
    }

    let enviados = 0;
    let pulados = 0;
    let falhas = 0;

    for (const conta of contas.docs) {
      const barbearia = { id: conta.id, ...conta.data() };

      try {
        const resultado = await cuidarDaConta(barbearia);
        enviados += resultado.enviados;
        pulados += resultado.pulados;
      } catch (erro) {
        falhas += 1;
        logger.error(`Conta ${barbearia.id} (${barbearia.nome}) falhou`, erro);
      }
    }

    logger.info(`Lembretes: ${enviados} enviado(s), ${pulados} pulado(s), ${falhas} conta(s) com erro.`);
  },
);

async function cuidarDaConta(barbearia) {
  const vazio = { enviados: 0, pulados: 0 };
  const config = barbearia.lembretes ?? {};

  // Conta suspensa não fala com a carteira dela. Suspender tem que parar
  // o que sai em nome do estabelecimento, não só o link público.
  if (barbearia.ativa === false) return vazio;

  // Nem conta ainda não aprovada. O link público dela já está fora do ar
  // pelas regras do Firestore; deixar o lembrete sair seria a plataforma
  // escrevendo, em nome de um cadastro que ela não aprovou, para clientes
  // que esse cadastro diz ter.
  if ((barbearia.aprovacao ?? "aprovada") !== "aprovada") return vazio;

  const agora = agoraNoFuso(barbearia.timezone || "America/Sao_Paulo");
  if (agora.hora !== Number(config.horaEnvio ?? 18)) return vazio;

  if (!config.modeloId) {
    logger.warn(`Conta ${barbearia.id} tem lembrete ligado sem modelo escolhido.`);
    return vazio;
  }

  const modeloSnap = await db
    .doc(`barbearias/${barbearia.id}/modelos/${config.modeloId}`)
    .get();

  if (!modeloSnap.exists) {
    logger.warn(`Conta ${barbearia.id}: modelo ${config.modeloId} não existe mais.`);
    return vazio;
  }

  const modelo = modeloSnap.data();
  const alvo = somarDias(agora.dia, Number(config.diasAntes ?? 1));

  const agendamentos = await db
    .collection(`barbearias/${barbearia.id}/agendamentos`)
    .where("dia", "==", alvo)
    .get();

  const link = config.linkPublico || "";
  let enviados = 0;
  let pulados = 0;

  for (const doc of agendamentos.docs) {
    const agendamento = { id: doc.id, ...doc.data() };

    if (!["agendado", "confirmado"].includes(agendamento.status)) {
      pulados += 1;
      continue;
    }

    const resultado = await lembrarUm({ barbearia, agendamento, modelo, link });
    if (resultado === "enviado") enviados += 1;
    else pulados += 1;
  }

  return { enviados, pulados };
}

async function lembrarUm({ barbearia, agendamento, modelo, link }) {
  const clienteSnap = await db
    .doc(`barbearias/${barbearia.id}/clientes/${agendamento.clienteId}`)
    .get();

  const cliente = clienteSnap.exists ? clienteSnap.data() : null;
  const email = String(cliente?.email ?? "").trim();

  if (!email.includes("@")) return "sem-email";

  // Quem pediu para não receber, não recebe — inclusive no automático,
  // que é justamente onde o descuido acontece.
  if (cliente?.aceitaMensagens === false) return "recusou";

  /**
   * TRAVA DE DUPLICIDADE.
   *
   * O id do registro é derivado do agendamento, e `create` falha se o
   * documento já existir. A marca é gravada ANTES do envio: se o e-mail
   * falhar, o pior que acontece é o cliente não receber — enquanto
   * marcar depois arriscaria enviar duas vezes numa reexecução, que é o
   * erro que o cliente percebe e reclama.
   */
  const registro = db.doc(
    `barbearias/${barbearia.id}/comunicacoes/lembrete_${agendamento.id}`,
  );

  const valores = valoresDo(agendamento, cliente, barbearia, link);
  const texto = aplicarVariaveis(modelo.texto, valores);
  const assunto = aplicarVariaveis(
    modelo.assunto || `Lembrete do seu horário — ${barbearia.nome}`,
    valores,
  );

  try {
    await registro.create({
      clienteId: agendamento.clienteId,
      clienteNome: agendamento.clienteNome ?? null,
      clienteTelefone: agendamento.clienteTelefone ?? null,
      clienteEmail: email,
      canal: "email",
      modeloId: modelo.id ?? null,
      modeloNome: modelo.nome ?? null,
      agendamentoId: agendamento.id,
      assunto,
      texto,
      automatico: true,
      status: "enviando",
      enviadoEm: FieldValue.serverTimestamp(),
    });
  } catch (erro) {
    // ALREADY_EXISTS: já foi lembrado. É o caminho normal quando a função
    // roda de novo no mesmo dia.
    if (erro.code === 6 || String(erro.message).includes("ALREADY_EXISTS")) {
      return "ja-lembrado";
    }
    throw erro;
  }

  try {
    const idExterno = await enviarEmail({
      para: email,
      assunto,
      texto,
      responderPara: barbearia.email || null,
    });
    await registro.update({ status: "enviado", idExterno });
    return "enviado";
  } catch (erro) {
    logger.error(`Falha ao enviar para ${email}`, erro);
    await registro.update({ status: "falhou", erro: String(erro.message).slice(0, 500) });
    return "falhou";
  }
}
