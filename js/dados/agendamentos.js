/**
 * Agendamentos e a trava de horário.
 *
 * O PROBLEMA
 * Num site estático não existe servidor da aplicação para arbitrar quem
 * chegou primeiro. Se dois clientes abrirem o link ao mesmo tempo e
 * confirmarem as 15:00 com o mesmo barbeiro, checar "está livre?" antes
 * de gravar não resolve — os dois leem "livre" e os dois gravam.
 *
 * A SOLUÇÃO
 * Cada bloco de 15 minutos vira um documento em `reservas`, com id
 * determinístico (barbeiro + dia + horário). A gravação acontece dentro
 * de uma transação do Firestore, e as regras de segurança permitem
 * `create` nesses documentos mas proíbem `update`. Resultado: o segundo
 * a chegar recebe erro do próprio banco, não de uma validação de tela.
 * São duas barreiras independentes — a transação e a regra.
 */

import {
  db,
  doc,
  getDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  runTransaction,
  serverTimestamp,
} from "../config/firebase.js";
import {
  colAgendamentos,
  colReservas,
  refAgendamento,
  refReserva,
  chaveReserva,
  blocosOcupados,
  paraLista,
  PASSO_MIN,
} from "./base.js";
import { expedienteDoDia } from "./barbearias.js";
import { bloqueado } from "./bloqueios.js";
import { horaParaMinutos, diaDaSemana, digitos } from "../lib/formato.js";
import { jaPassou, agoraNaBarbearia } from "../lib/fuso.js";
import { exigirContaAtiva } from "./situacao.js";

export const STATUS = ["agendado", "confirmado", "realizado", "cancelado", "faltou"];

/* ------------------------------------------------------------------ */
/* Leitura                                                             */
/* ------------------------------------------------------------------ */

// Todas as consultas usam um único campo em filtro ou ordenação. É
// deliberado: assim o Firestore resolve tudo com os índices automáticos
// de campo único, e ninguém precisa rodar a CLI para publicar índices
// compostos antes do sistema funcionar. A ordenação fina fica no JS,
// sobre listas do tamanho de um dia de barbearia.
export async function listarAgendamentosDoDia(bid, dia) {
  const snap = await getDocs(query(colAgendamentos(bid), where("dia", "==", dia)));
  return paraLista(snap).sort((a, b) => a.inicioMin - b.inicioMin);
}

export async function listarAgendamentosDoPeriodo(bid, diaInicial, diaFinal) {
  const snap = await getDocs(
    query(
      colAgendamentos(bid),
      where("dia", ">=", diaInicial),
      where("dia", "<=", diaFinal),
      orderBy("dia"),
    ),
  );
  return paraLista(snap);
}

/**
 * Reservas do dia — é o que a página pública consulta para montar os
 * horários livres. De propósito não contém nome nem telefone de
 * ninguém, então pode ser lida sem login sem expor cliente algum.
 */
export async function listarReservasDoDia(bid, dia) {
  const snap = await getDocs(query(colReservas(bid), where("dia", "==", dia)));
  return paraLista(snap);
}

export async function listarAgendamentosDoCliente(bid, clienteId) {
  const snap = await getDocs(
    query(colAgendamentos(bid), where("clienteId", "==", clienteId)),
  );
  return paraLista(snap).sort((a, b) => String(b.dia).localeCompare(String(a.dia)));
}

/* ------------------------------------------------------------------ */
/* Horários livres                                                     */
/* ------------------------------------------------------------------ */

/**
 * Calcula os horários em que um barbeiro pode iniciar um serviço.
 * Função pura: recebe tudo pronto e não toca no Firestore, o que a torna
 * a mesma no painel e na página pública — não há como as duas telas
 * discordarem sobre o que está livre.
 */
export function horariosDisponiveis({
  barbearia,
  dia,
  barbeiroId,
  duracaoMin,
  reservas,
  bloqueios,
  incluirPassado = false,
}) {
  const expediente = expedienteDoDia(barbearia, diaDaSemana(dia));
  if (!expediente || !duracaoMin) return [];

  const abre = horaParaMinutos(expediente.abre);
  const fecha = horaParaMinutos(expediente.fecha);
  const timezone = barbearia.timezone ?? "America/Sao_Paulo";

  const ocupados = new Set(
    reservas
      .filter((r) => r.barbeiroId === barbeiroId)
      .map((r) => Number(String(r.id).split("__")[2])),
  );

  const livres = [];
  for (let inicio = abre; inicio + duracaoMin <= fecha; inicio += PASSO_MIN) {
    const fim = inicio + duracaoMin;

    if (!incluirPassado && jaPassou(dia, inicio, timezone)) continue;
    if (blocosOcupados(inicio, duracaoMin).some((m) => ocupados.has(m))) continue;
    if (bloqueado(bloqueios, barbeiroId, inicio, fim)) continue;

    livres.push(inicio);
  }
  return livres;
}

/* ------------------------------------------------------------------ */
/* Gravação                                                            */
/* ------------------------------------------------------------------ */

/**
 * Cria o agendamento e reserva os blocos numa única transação.
 * Lança OCUPADO quando alguém pegou o horário no meio do caminho.
 */
export async function criarAgendamento(bid, dados) {
  const {
    dia,
    inicioMin,
    barbeiro,
    servico,
    clienteId,
    clienteNome,
    clienteTelefone,
    clienteEmail = null,
    observacoes = null,
    origem = "painel",
    status = origem === "publico" ? "agendado" : "confirmado",
  } = dados;

  exigirContaAtiva();

  if (!dia || inicioMin == null || !barbeiro || !servico || !clienteId) {
    throw new Error("Dados incompletos para o agendamento.");
  }

  const duracaoMin = servico.duracaoMin;
  const fimMin = inicioMin + duracaoMin;
  const blocos = blocosOcupados(inicioMin, duracaoMin);

  const registro = {
    dia,
    inicioMin,
    fimMin,
    duracaoMin,
    barbeiroId: barbeiro.id,
    barbeiroNome: barbeiro.nome,
    barbeiroCor: barbeiro.cor ?? "#eca202",
    clienteId,
    clienteNome: String(clienteNome).trim(),
    clienteTelefone: digitos(clienteTelefone),
    // O e-mail vai no próprio agendamento, e não só na ficha: é para este
    // endereço que saem a confirmação e o lembrete DESTE horário, mesmo
    // que a ficha tenha outro (a ficha não pode ser reescrita de fora).
    clienteEmail: String(clienteEmail ?? "").trim().toLowerCase() || null,
    servicoId: servico.id,
    servicoNome: servico.nome,
    precoCentavos: servico.precoCentavos ?? 0,
    comissaoPercentual: barbeiro.comissao ?? 0,
    status,
    origem,
    observacoes: observacoes || null,
    criadoEm: serverTimestamp(),
  };

  return runTransaction(db, async (tx) => {
    const refs = blocos.map((m) => refReserva(bid, chaveReserva(barbeiro.id, dia, m)));

    // Todas as leituras antes de qualquer escrita: exigência do Firestore.
    for (const ref of refs) {
      const snap = await tx.get(ref);
      if (snap.exists()) {
        const erro = new Error("Esse horário acabou de ser reservado por outra pessoa.");
        erro.code = "OCUPADO";
        throw erro;
      }
    }

    const agRef = doc(colAgendamentos(bid));
    tx.set(agRef, { ...registro, blocos });

    for (const ref of refs) {
      tx.set(ref, { agendamentoId: agRef.id, barbeiroId: barbeiro.id, dia });
    }

    return agRef.id;
  });
}

/**
 * Muda o status. Cancelar ou marcar falta devolve os blocos para a
 * agenda — senão o horário ficaria preso a um atendimento que não vai
 * acontecer.
 */
export async function atualizarStatus(bid, agendamento, novoStatus) {
  exigirContaAtiva();
  if (!STATUS.includes(novoStatus)) throw new Error("Status inválido.");

  await updateDoc(refAgendamento(bid, agendamento.id), { status: novoStatus });

  const liberou = novoStatus === "cancelado" || novoStatus === "faltou";
  const estavaLiberado =
    agendamento.status === "cancelado" || agendamento.status === "faltou";

  if (liberou && !estavaLiberado) {
    await liberarBlocos(bid, agendamento);
  } else if (!liberou && estavaLiberado) {
    await reservarBlocos(bid, agendamento);
  }
}

export async function excluirAgendamento(bid, agendamento) {
  exigirContaAtiva();
  await liberarBlocos(bid, agendamento);
  await deleteDoc(refAgendamento(bid, agendamento.id));
}

function blocosDe(agendamento) {
  return (
    agendamento.blocos ?? blocosOcupados(agendamento.inicioMin, agendamento.duracaoMin)
  );
}

async function liberarBlocos(bid, agendamento) {
  await Promise.all(
    blocosDe(agendamento).map((m) =>
      deleteDoc(refReserva(bid, chaveReserva(agendamento.barbeiroId, agendamento.dia, m))),
    ),
  );
}

async function reservarBlocos(bid, agendamento) {
  const refs = blocosDe(agendamento).map((m) =>
    refReserva(bid, chaveReserva(agendamento.barbeiroId, agendamento.dia, m)),
  );

  await runTransaction(db, async (tx) => {
    for (const ref of refs) {
      const snap = await tx.get(ref);
      if (snap.exists()) {
        const erro = new Error("O horário já foi ocupado por outro atendimento.");
        erro.code = "OCUPADO";
        throw erro;
      }
    }
    for (const ref of refs) {
      tx.set(ref, {
        agendamentoId: agendamento.id,
        barbeiroId: agendamento.barbeiroId,
        dia: agendamento.dia,
      });
    }
  });
}

/* ------------------------------------------------------------------ */
/* Cancelamento pelo próprio cliente                                   */
/* ------------------------------------------------------------------ */

/** Antecedência mínima para o cliente cancelar sozinho. */
export const HORAS_MINIMAS_CANCELAMENTO = 2;

/**
 * Se o cliente ainda está dentro do prazo para cancelar.
 *
 * A conta usa o relógio do ESTABELECIMENTO, não o do aparelho de quem
 * está cancelando: um cliente viajando teria a janela deslocada e
 * cancelaria em cima da hora achando que estava dentro do prazo.
 */
export function podeCancelar(agendamento, timezone) {
  if (!["agendado", "confirmado"].includes(agendamento.status)) {
    return { pode: false, motivo: "Este agendamento não está mais ativo." };
  }

  const agora = agoraNaBarbearia(timezone);
  const minutosAte =
    diasEntre(agora.dia, agendamento.dia) * 1440 + agendamento.inicioMin - agora.minutos;

  if (minutosAte < 0) {
    return { pode: false, motivo: "Este horário já passou." };
  }
  if (minutosAte < HORAS_MINIMAS_CANCELAMENTO * 60) {
    return {
      pode: false,
      motivo:
        `Faltam menos de ${HORAS_MINIMAS_CANCELAMENTO} horas para o seu horário. ` +
        "Entre em contato direto com o estabelecimento.",
    };
  }
  return { pode: true, minutosAte };
}

function diasEntre(de, ate) {
  const [a1, m1, d1] = String(de).split("-").map(Number);
  const [a2, m2, d2] = String(ate).split("-").map(Number);
  return Math.round((Date.UTC(a2, m2 - 1, d2) - Date.UTC(a1, m1 - 1, d1)) / 86400000);
}

/**
 * Agendamentos futuros de um telefone — o cliente acha o dele para
 * cancelar. Devolve só os ativos, e nada além do necessário para ele se
 * reconhecer: dia, hora, serviço e profissional.
 */
export async function agendamentosDoTelefone(bid, telefone, aPartirDe) {
  const snap = await getDocs(
    query(colAgendamentos(bid), where("clienteId", "==", digitos(telefone))),
  );
  return paraLista(snap)
    .filter((a) => a.dia >= aPartirDe && ["agendado", "confirmado"].includes(a.status))
    .sort((a, b) => String(a.dia).localeCompare(String(b.dia)) || a.inicioMin - b.inicioMin);
}

/**
 * Cancelamento feito pelo cliente na página pública.
 *
 * Não passa por `atualizarStatus` de propósito: aquele caminho exige
 * sessão de painel e é bloqueado para conta suspensa. Aqui quem age é um
 * visitante anônimo, e a operação é estreita — muda o status, devolve os
 * blocos para a agenda, e só se a regra de antecedência permitir.
 */
export async function cancelarPeloCliente(bid, agendamento, timezone) {
  const veredito = podeCancelar(agendamento, timezone);
  if (!veredito.pode) throw new Error(veredito.motivo);

  // Cancela primeiro, libera depois — nessa ordem. A regra que autoriza
  // apagar a reserva exige que o agendamento já esteja cancelado; ao
  // contrário, o cliente ficaria com o horário preso.
  await updateDoc(refAgendamento(bid, agendamento.id), {
    status: "cancelado",
    canceladoPeloCliente: true,
  });
  await liberarBlocos(bid, agendamento);
}

/** Lê um agendamento pelo id — o cliente usa para conferir o próprio. */
export async function obterAgendamento(bid, id) {
  const snap = await getDoc(refAgendamento(bid, id));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

/** Verifica se um horário específico ainda está livre (checagem otimista). */
export async function horarioLivre(bid, barbeiroId, dia, inicioMin, duracaoMin) {
  const blocos = blocosOcupados(inicioMin, duracaoMin);
  const snaps = await Promise.all(
    blocos.map((m) => getDoc(refReserva(bid, chaveReserva(barbeiroId, dia, m)))),
  );
  return snaps.every((s) => !s.exists());
}
