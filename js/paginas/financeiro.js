/**
 * Financeiro: o que entrou, o que saiu e o que sobrou.
 *
 * A receita vem dos atendimentos marcados como REALIZADOS — não dos
 * agendados. Um horário marcado ainda não é dinheiro: o cliente pode
 * faltar. Contar agendamento como faturamento daria um número bonito e
 * falso, e o dono descobriria a diferença no fim do mês.
 *
 * A despesa vem do caderno de despesas desta tela, pela DATA em que foi
 * lançada — regime de caixa, que é como um salão pensa. Não há
 * competência nem rateio aqui, e isso é deliberado: ver `dados/despesas.js`.
 */

import { el, render, carregando, vazio, dadosDoForm } from "../lib/dom.js";
import {
  abrirModal,
  fecharModal,
  sucesso,
  falha,
  confirmar,
  comCarregamento,
  mensagemDeErro,
} from "../lib/ui.js";
import { moeda, dataCurta } from "../lib/formato.js";
import { hojeNaBarbearia } from "../lib/fuso.js";
import { recarregarRota } from "../lib/router.js";
import { contexto, ehGestor } from "../dados/sessao.js";
import { termos } from "../config/segmentos.js";
import { listarAgendamentosDoPeriodo } from "../dados/agendamentos.js";
import {
  listarDespesasDoMes,
  listarDespesasDosMeses,
  salvarDespesa,
  excluirDespesa,
  porCategoria,
  categoria,
  somar,
  LISTA_CATEGORIAS,
} from "../dados/despesas.js";

/** Quantos meses a evolução mostra, contando o atual. */
const MESES_EVOLUCAO = 6;

export async function telaFinanceiro({ container, params, ehAtual }) {
  const { barbearia } = contexto();
  const T = termos(barbearia);
  const hoje = hojeNaBarbearia(barbearia.timezone);
  const mes = /^\d{4}-\d{2}$/.test(params.get("mes") ?? "") ? params.get("mes") : hoje.slice(0, 7);

  container.append(carregando("Somando as contas…"));

  const meses = ultimosMeses(mes, MESES_EVOLUCAO);
  const [doMes, despesasMes, despesasEvolucao, ...receitasEvolucao] = await Promise.all([
    listarAgendamentosDoPeriodo(barbearia.id, `${mes}-01`, `${mes}-31`),
    listarDespesasDoMes(barbearia.id, mes),
    listarDespesasDosMeses(barbearia.id, meses),
    ...meses.map((m) => listarAgendamentosDoPeriodo(barbearia.id, `${m}-01`, `${m}-31`)),
  ]);

  if (!ehAtual()) return;

  const receita = somaRealizados(doMes);
  const despesa = somar(despesasMes);
  const resultado = receita - despesa;

  const evolucao = meses.map((m, i) => ({
    mes: m,
    receita: somaRealizados(receitasEvolucao[i] ?? []),
    despesa: somar(despesasEvolucao.filter((d) => d.mes === m)),
  }));

  const estado = { barbearia, T, mes, hoje, despesasMes };

  render(
    container,

    el("div", { class: "cabecalho-tela" }, [
      el("div", {}, [
        el("h1", {}, "Financeiro"),
        el("p", {}, "Receita dos atendimentos realizados, despesas lançadas e o resultado do mês."),
      ]),
      ehGestor()
        ? el("button", { class: "btn btn-primario", type: "button", onclick: () => abrirDespesa(estado) },
            "Nova despesa")
        : null,
    ]),

    seletorDeMes(mes, hoje),

    el("section", { class: "secao" }, [
      el("dl", { class: "indicadores" }, [
        indicador("Receitas", moeda(receita), `${contarRealizados(doMes)} ${T.atendimentos} realizados`),
        indicador("Despesas", moeda(despesa), `${despesasMes.length} lançamento(s)`),
        indicador(
          resultado > 0 ? "Lucro" : resultado < 0 ? "Prejuízo" : "Resultado",
          moeda(Math.abs(resultado)),
          resultado < 0 ? "As despesas passaram a receita" : "Receitas menos despesas",
          resultado > 0 ? "positivo" : resultado < 0 ? "negativo" : null,
        ),
        indicador("Margem", margem(receita, resultado), "Quanto sobra de cada R$ 100"),
      ]),
    ]),

    el("section", { class: "secao" }, [
      el("h2", { class: "secao-titulo" }, `Evolução dos últimos ${MESES_EVOLUCAO} meses`),
      graficoEvolucao(evolucao, mes),
    ]),

    el("section", { class: "secao" }, [
      el("h2", { class: "secao-titulo" }, "Despesas por categoria"),
      despesasMes.length === 0
        ? el("p", { class: "cartao cartao-corpo centro fraco pequeno" }, "Nenhuma despesa lançada neste mês.")
        : el(
            "ul",
            { class: "cartao lista" },
            porCategoria(despesasMes).map((c) =>
              el("li", {}, [
                el("div", { class: "item" }, [
                  el("span", { "aria-hidden": "true", style: { flexShrink: "0" } }, categoria(c.id).emblema),
                  el("div", { class: "crescer" }, [
                    el("p", { class: "pequeno", style: { fontWeight: "500" } }, categoria(c.id).nome),
                    el("p", { class: "pequeno fraco" }, `${c.quantidade} lançamento(s)`),
                  ]),
                  el("span", { class: "num", style: { fontWeight: "500" } }, moeda(c.total)),
                ]),
              ]),
            ),
          ),
    ]),

    el("section", { class: "secao" }, [
      el("h2", { class: "secao-titulo" }, "Lançamentos do mês"),
      despesasMes.length === 0
        ? vazio(
            "Nenhuma despesa neste mês",
            "Lance aluguel, produtos, contas e o que mais sair do caixa — é o que falta para saber se o mês fechou no azul.",
            ehGestor()
              ? el("button", { class: "btn btn-primario", type: "button", onclick: () => abrirDespesa(estado) },
                  "Nova despesa")
              : null,
          )
        : el(
            "ul",
            { class: "cartao lista" },
            despesasMes.map((d) =>
              el("li", {}, [
                el("div", { class: "item" }, [
                  el("span", { class: "num pequeno", style: { width: "52px", flexShrink: "0" } }, dataCurta(d.dia)),
                  el("div", { class: "crescer" }, [
                    el("p", { class: "truncar", style: { fontWeight: "500" } }, d.descricao),
                    el("p", { class: "pequeno fraco truncar" },
                      `${categoria(d.categoria).emblema} ${categoria(d.categoria).nome}${d.observacoes ? ` · ${d.observacoes}` : ""}`),
                  ]),
                  el("span", { class: "num", style: { fontWeight: "500", flexShrink: "0" } }, moeda(d.valorCentavos)),
                  ehGestor()
                    ? el("button", {
                        class: "btn btn-secundario btn-mini",
                        type: "button",
                        onclick: () => abrirDespesa(estado, d),
                      }, "Editar")
                    : null,
                ]),
              ]),
            ),
          ),
    ]),
  );
}

/* ------------------------------------------------------------------ */
/* Cálculos                                                            */
/* ------------------------------------------------------------------ */
const realizados = (lista) => lista.filter((a) => a.status === "realizado");
const contarRealizados = (lista) => realizados(lista).length;
const somaRealizados = (lista) =>
  realizados(lista).reduce((t, a) => t + (a.precoCentavos ?? 0), 0);

function margem(receita, resultado) {
  if (!receita) return "—";
  return `${Math.round((resultado / receita) * 100)}%`;
}

/** ["2026-05", … "2026-10"] terminando no mês escolhido. */
function ultimosMeses(mes, quantos) {
  const [ano, m] = mes.split("-").map(Number);
  return Array.from({ length: quantos }, (_, i) => {
    const d = new Date(Date.UTC(ano, m - 1 - (quantos - 1 - i), 1));
    return d.toISOString().slice(0, 7);
  });
}

function nomeDoMes(mes) {
  const d = new Date(`${mes}-01T12:00:00Z`);
  return d.toLocaleDateString("pt-BR", { month: "short", timeZone: "UTC" }).replace(".", "");
}

/* ------------------------------------------------------------------ */
/* Visual                                                              */
/* ------------------------------------------------------------------ */
function indicador(rotulo, valor, detalhe, tom) {
  return el("div", { class: "indicador" }, [
    el("dt", {}, rotulo),
    el("dd", { class: tom === "positivo" ? "destaque" : tom === "negativo" ? "negativo" : null }, valor),
    detalhe ? el("p", { class: "detalhe" }, detalhe) : null,
  ]);
}

/**
 * Barras em pé, receita e despesa lado a lado por mês.
 *
 * Sem biblioteca de gráfico: são doze barras cuja altura é uma
 * porcentagem do maior valor do período. Carregar um pacote inteiro para
 * isso custaria mais do que o gráfico vale.
 */
function graficoEvolucao(evolucao, mesAtual) {
  const teto = Math.max(1, ...evolucao.flatMap((e) => [e.receita, e.despesa]));

  return el("div", { class: "cartao cartao-corpo" }, [
    el("div", { class: "evolucao" },
      evolucao.map((e) => {
        const saldo = e.receita - e.despesa;
        return el("div", { class: `mes-coluna ${e.mes === mesAtual ? "atual" : ""}` }, [
          el("div", { class: "barras", title: `Receita ${moeda(e.receita)} · Despesa ${moeda(e.despesa)}` }, [
            el("span", { class: "barra receita", style: { height: `${(e.receita / teto) * 100}%` } }),
            el("span", { class: "barra despesa", style: { height: `${(e.despesa / teto) * 100}%` } }),
          ]),
          el("span", { class: "rotulo-mes" }, nomeDoMes(e.mes)),
          el("span", { class: `saldo ${saldo >= 0 ? "positivo" : "negativo"}` },
            saldo >= 0 ? moeda(saldo) : `-${moeda(Math.abs(saldo))}`),
        ]);
      }),
    ),
    el("div", { class: "legenda-evolucao" }, [
      el("span", {}, [el("i", { class: "ponto receita" }), "Receitas"]),
      el("span", {}, [el("i", { class: "ponto despesa" }), "Despesas"]),
    ]),
  ]);
}

function seletorDeMes(mes, hoje) {
  const ir = (novo) => {
    location.hash = `#/financeiro?mes=${novo}`;
  };
  const mover = (passo) => {
    const [ano, m] = mes.split("-").map(Number);
    ir(new Date(Date.UTC(ano, m - 1 + passo, 1)).toISOString().slice(0, 7));
  };

  return el("div", { class: "agenda-barra", style: { marginBottom: "16px" } }, [
    el("button", { class: "navegar", type: "button", "aria-label": "Mês anterior", onclick: () => mover(-1) }, "‹"),
    el("div", { class: "data-atual" }, [
      el("p", { class: "dia" }, mesPorExtenso(mes)),
      mes !== hoje.slice(0, 7)
        ? el("button", { class: "btn btn-fantasma btn-mini", type: "button", onclick: () => ir(hoje.slice(0, 7)) },
            "Voltar ao mês atual")
        : el("p", { class: "expediente" }, "Mês em andamento"),
    ]),
    el("button", { class: "navegar", type: "button", "aria-label": "Próximo mês", onclick: () => mover(1) }, "›"),
  ]);
}

function mesPorExtenso(mes) {
  const d = new Date(`${mes}-01T12:00:00Z`);
  const t = d.toLocaleDateString("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" });
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/* ------------------------------------------------------------------ */
/* Formulário                                                          */
/* ------------------------------------------------------------------ */
function abrirDespesa(estado, despesa = null) {
  const erro = el("div", { class: "aviso aviso-erro oculto" });

  const form = el("form", { onsubmit: enviar }, [
    grupo("Descrição", el("input", {
      class: "campo",
      name: "descricao",
      required: true,
      value: despesa?.descricao ?? "",
      placeholder: "Aluguel de outubro",
    })),

    el("div", { class: "dupla" }, [
      grupo("Valor (R$)", el("input", {
        class: "campo",
        name: "valor",
        required: true,
        inputmode: "decimal",
        value: despesa ? (despesa.valorCentavos / 100).toFixed(2).replace(".", ",") : "",
        placeholder: "1.200,00",
      })),
      grupo("Data", el("input", {
        class: "campo",
        name: "dia",
        type: "date",
        required: true,
        value: despesa?.dia ?? diaSugerido(estado),
      })),
    ]),

    grupo("Categoria", el(
      "select",
      { class: "campo", name: "categoria" },
      LISTA_CATEGORIAS.map((c) =>
        el("option", { value: c.id, selected: c.id === (despesa?.categoria ?? "outros") },
          `${c.emblema}  ${c.nome}`)),
    )),

    grupo("Observação (opcional)", el("input", {
      class: "campo",
      name: "observacoes",
      value: despesa?.observacoes ?? "",
      placeholder: "Pago em dinheiro, nota 1234…",
    })),

    erro,

    el("div", { class: "modal-acoes" }, [
      el("button", { class: "btn btn-secundario", type: "button", onclick: fecharModal }, "Cancelar"),
      el("button", { class: "btn btn-primario", type: "submit" }, "Salvar"),
    ]),

    despesa
      ? el("button", {
          class: "btn btn-fantasma btn-bloco btn-mini",
          type: "button",
          style: { marginTop: "8px", color: "var(--erro)" },
          onclick: excluir,
        }, "Excluir despesa")
      : null,
  ]);

  async function enviar(evento) {
    evento.preventDefault();
    erro.classList.add("oculto");
    const botao = form.querySelector('button[type="submit"]');
    try {
      await comCarregamento(botao, "Salvando…", () =>
        salvarDespesa(estado.barbearia.id, { ...dadosDoForm(form), id: despesa?.id }),
      );
      fecharModal();
      sucesso("Despesa salva.");
      recarregarRota();
    } catch (falhou) {
      erro.textContent = mensagemDeErro(falhou);
      erro.classList.remove("oculto");
    }
  }

  async function excluir() {
    fecharModal();
    const ok = await confirmar("Excluir despesa", `"${despesa.descricao}" sai do resultado do mês.`, "Excluir");
    if (!ok) return;
    try {
      await excluirDespesa(estado.barbearia.id, despesa.id);
      sucesso("Despesa excluída.");
      recarregarRota();
    } catch (falhou) {
      falha(mensagemDeErro(falhou));
    }
  }

  abrirModal(despesa ? "Editar despesa" : "Nova despesa", form);
}

/**
 * Data que o campo já vem preenchido: hoje, se o mês na tela for o mês
 * corrente; senão o dia 1º. Jogar o dia de hoje num mês passado criaria
 * "31 de abril" e o navegador rejeitaria o campo sem dizer por quê.
 */
function diaSugerido({ mes, hoje }) {
  return hoje.startsWith(mes) ? hoje : `${mes}-01`;
}

function grupo(rotulo, campo) {
  return el("div", { class: "grupo" }, [el("span", { class: "rotulo" }, rotulo), campo]);
}
