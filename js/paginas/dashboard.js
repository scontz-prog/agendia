/**
 * Visão geral — o que faz o dono abrir o sistema todo dia.
 *
 * Os números são calculados no navegador a partir dos agendamentos do
 * mês. Para o volume de uma barbearia (algumas centenas de documentos)
 * isso é mais barato e mais simples do que manter contadores
 * denormalizados que podem sair de sincronia.
 */

import { el, render, carregando, vazio } from "../lib/dom.js";
import { moeda, telefone, minutosParaHora, dataLonga, ROTULO_STATUS } from "../lib/formato.js";
import { hojeNaBarbearia } from "../lib/fuso.js";
import { contexto } from "../dados/sessao.js";
import {
  listarAgendamentosDoDia,
  listarAgendamentosDoPeriodo,
  atualizarStatus,
} from "../dados/agendamentos.js";
import { registrarVisita } from "../dados/clientes.js";
import { irPara, recarregarRota } from "../lib/router.js";
import { falha, sucesso, mensagemDeErro } from "../lib/ui.js";
import { termos, maiuscula } from "../config/segmentos.js";

/** Ainda não se sabe se o cliente veio: é o que vira pendência. */
const EM_ABERTO = ["agendado", "confirmado"];

export async function telaDashboard({ container, ehAtual }) {
  const { barbearia, perfil } = contexto();
  const T = termos(barbearia);
  container.append(carregando("Somando os números…"));

  const hoje = hojeNaBarbearia(barbearia.timezone);
  const [ano, mes] = hoje.split("-");
  const primeiroDia = `${ano}-${mes}-01`;
  const ultimoDia = `${ano}-${mes}-31`;

  const [doDia, doMes] = await Promise.all([
    listarAgendamentosDoDia(barbearia.id, hoje),
    listarAgendamentosDoPeriodo(barbearia.id, primeiroDia, ultimoDia),
  ]);

  if (!ehAtual()) return;

  const h = resumoDoDia(doDia);
  const m = resumoDoMes(doMes);
  const pendentes = doDia.filter((a) => EM_ABERTO.includes(a.status));

  render(
    container,

    el("div", { class: "cabecalho-tela" }, [
      el("div", {}, [
        el("h1", {}, "Visão geral"),
        el("p", {}, dataLonga(hoje)),
      ]),
      el(
        "button",
        { class: "btn btn-primario", type: "button", onclick: () => irPara("/agenda") },
        "Abrir agenda",
      ),
    ]),

    el("section", { class: "secao" }, [
      el("h2", { class: "secao-titulo" }, "Hoje"),
      el("dl", { class: "indicadores" }, [
        indicador("Agendamentos", String(h.total), `${h.aguardando} aguardando confirmação`),
        indicador("Realizados", String(h.realizados), `${h.cancelados} cancelados · ${h.faltaram} faltas`),
        indicador("Previsto", moeda(h.previsto), "Se todos comparecerem", true),
        indicador("Já realizado", moeda(h.realizado), "Atendimentos concluídos"),
      ]),
    ]),

    el("section", { class: "secao" }, [
      el("h2", { class: "secao-titulo" }, "Este mês"),
      el("dl", { class: "indicadores" }, [
        indicador("Atendimentos", String(m.atendimentos)),
        indicador("Faturamento", moeda(m.faturado), `Ticket médio ${moeda(m.ticket)}`, true),
        indicador("Comissões", moeda(m.comissoes), `A pagar aos ${T.profissionais}`),
        indicador("Cancelamentos", `${m.taxaCancelamento}%`, `${m.cancelados} de ${m.total}`),
      ]),
    ]),

    el("section", { class: "secao" }, [
      el("div", { class: "entre", style: { marginBottom: "12px" } }, [
        el("h2", { class: "secao-titulo", style: { marginBottom: "0" } }, "Agenda de hoje"),
        pendentes.length
          ? el("span", { class: "etiqueta etiqueta-pendente" },
              `${pendentes.length} a confirmar`)
          : null,
      ]),
      doDia.filter((a) => a.status !== "cancelado").length === 0
        ? vazio(
            "Nenhum atendimento hoje",
            "Compartilhe seu link de agendamento para encher a agenda.",
          )
        : el(
            "ul",
            { class: "cartao lista" },
            doDia
              .filter((a) => a.status !== "cancelado")
              .map((a) => linhaAgendamento(a, barbearia, T)),
          ),
    ]),

    el("section", { class: "secao" }, [
      el("h2", { class: "secao-titulo" }, `${maiuscula(T.servicos)} mais vendidos no mês`),
      ranking(m.porServico, (r) => `${r.quantidade}×`, (r) => moeda(r.total)),
    ]),

    el("section", { class: "secao" }, [
      el("h2", { class: "secao-titulo" }, `Faturamento por ${T.profissional}`),
      ranking(
        m.porBarbeiro,

        (r) => moeda(r.total),
        (r) => `${r.quantidade} atend. · comissão ${moeda(r.comissao)}`,
      ),
    ]),
  );
}

/* ------------------------------------------------------------------ */
/* Cálculos                                                            */
/* ------------------------------------------------------------------ */

function resumoDoDia(lista) {
  const conta = (s) => lista.filter((a) => a.status === s).length;
  const soma = (filtro) =>
    lista.filter(filtro).reduce((t, a) => t + (a.precoCentavos ?? 0), 0);

  return {
    total: lista.length,
    realizados: conta("realizado"),
    cancelados: conta("cancelado"),
    faltaram: conta("faltou"),
    aguardando: conta("agendado"),
    previsto: soma((a) => ["agendado", "confirmado", "realizado"].includes(a.status)),
    realizado: soma((a) => a.status === "realizado"),
  };
}

function resumoDoMes(lista) {
  const realizados = lista.filter((a) => a.status === "realizado");
  const faturado = realizados.reduce((t, a) => t + (a.precoCentavos ?? 0), 0);
  const comissoes = realizados.reduce(
    (t, a) => t + Math.round(((a.precoCentavos ?? 0) * (a.comissaoPercentual ?? 0)) / 100),
    0,
  );
  const cancelados = lista.filter((a) =>
    ["cancelado", "faltou"].includes(a.status),
  ).length;

  return {
    total: lista.length,
    atendimentos: realizados.length,
    faturado,
    comissoes,
    cancelados,
    ticket: realizados.length ? Math.round(faturado / realizados.length) : 0,
    taxaCancelamento: lista.length
      ? Math.round((cancelados / lista.length) * 1000) / 10
      : 0,
    porServico: agrupar(realizados, "servicoNome"),
    porBarbeiro: agrupar(realizados, "barbeiroNome"),
  };
}

function agrupar(lista, campo) {
  const mapa = new Map();
  for (const a of lista) {
    const chave = a[campo] ?? "—";
    const atual = mapa.get(chave) ?? { nome: chave, quantidade: 0, total: 0, comissao: 0 };
    atual.quantidade += 1;
    atual.total += a.precoCentavos ?? 0;
    atual.comissao += Math.round(
      ((a.precoCentavos ?? 0) * (a.comissaoPercentual ?? 0)) / 100,
    );
    mapa.set(chave, atual);
  }
  return [...mapa.values()].sort((a, b) => b.total - a.total).slice(0, 8);
}

/* ------------------------------------------------------------------ */
/* Blocos visuais                                                      */
/* ------------------------------------------------------------------ */

function indicador(rotulo, valor, detalhe, destaque = false) {
  return el("div", { class: "indicador" }, [
    el("dt", {}, rotulo),
    el("dd", { class: destaque ? "destaque" : null }, valor),
    detalhe ? el("p", { class: "detalhe" }, detalhe) : null,
  ]);
}

/**
 * Uma linha da agenda de hoje.
 *
 * O fechamento do atendimento acontece aqui, e não na grade da agenda:
 * esta é a única tela onde os pendentes aparecem reunidos. Marcar um a
 * um, caçando bloco na grade, era o caminho mais fácil de esquecer
 * metade — e o que não é marcado não entra no faturamento.
 *
 * Enquanto ninguém disser se o cliente veio, a linha fica vermelha.
 */
function linhaAgendamento(a, barbearia, T) {
  const pendente = EM_ABERTO.includes(a.status);

  async function fechar(status) {
    try {
      await atualizarStatus(barbearia.id, a, status);
      if (status === "realizado") {
        await registrarVisita(barbearia.id, a.clienteId, {
          dia: a.dia,
          precoCentavos: a.precoCentavos,
        });
      }
      sucesso(status === "realizado" ? "Atendimento registrado." : "Falta registrada.");
      recarregarRota();
    } catch (erro) {
      falha(mensagemDeErro(erro));
    }
  }

  return el("li", { class: pendente ? "linha-pendente" : "" }, [
    el("div", { class: "item" }, [
      el("span", { class: "num destaque", style: { width: "48px", flexShrink: "0", fontWeight: "600" } },
        minutosParaHora(a.inicioMin)),
      el("span", {
        style: {
          width: "4px",
          height: "32px",
          flexShrink: "0",
          borderRadius: "2px",
          background: a.barbeiroCor ?? "var(--borda-forte)",
        },
        "aria-hidden": "true",
      }),
      el("div", { class: "crescer" }, [
        el("p", { class: "truncar", style: { fontWeight: "500" } }, a.clienteNome),
        el("p", { class: "truncar pequeno suave" },
          `${a.servicoNome} · ${a.barbeiroNome} · ${telefone(a.clienteTelefone)}`),
      ]),
      pendente
        ? el("span", { class: "etiqueta etiqueta-pendente" }, "Pendente")
        : el("span", { class: `etiqueta etiqueta-${a.status}` }, ROTULO_STATUS[a.status]),
    ]),

    pendente
      ? el("div", { class: "fechamento" }, [
          el("span", { class: "pergunta" }, `O ${T.cliente} veio?`),
          el(
            "button",
            { class: "btn btn-primario btn-mini", type: "button", onclick: () => fechar("realizado") },
            "Compareceu",
          ),
          el(
            "button",
            { class: "btn btn-secundario btn-mini", type: "button", onclick: () => fechar("faltou") },
            "Não compareceu",
          ),
        ])
      : null,
  ]);
}

function ranking(itens, valorPrincipal, valorSecundario) {
  if (itens.length === 0) {
    return el("p", { class: "cartao cartao-corpo centro fraco pequeno" },
      "Ainda sem atendimentos concluídos neste mês.");
  }

  return el(
    "ul",
    { class: "cartao lista" },
    itens.map((r) =>
      el("li", {}, [
        el("div", { class: "item" }, [
          el("span", { class: "crescer truncar" }, r.nome),
          el("span", { style: { textAlign: "right", flexShrink: "0" } }, [
            el("span", { class: "num", style: { display: "block", fontWeight: "500" } },
              valorPrincipal(r)),
            el("span", { class: "pequeno fraco", style: { display: "block" } },
              valorSecundario(r)),
          ]),
        ]),
      ]),
    ),
  );
}
