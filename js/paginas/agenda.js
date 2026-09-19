/**
 * Agenda do dia — grade horário × barbeiro.
 *
 * Os atendimentos são posicionados por cima da coluna do barbeiro, com
 * altura proporcional à duração. Clicar num espaço vazio já abre o
 * formulário com barbeiro e horário preenchidos: é o gesto que o dono
 * repete o dia inteiro, então precisa custar um toque.
 */

import { el, render, carregando, vazio, dadosDoForm } from "../lib/dom.js";
import { abrirModal, fecharModal, sucesso, falha, confirmar, comCarregamento, mensagemDeErro } from "../lib/ui.js";
import {
  moeda,
  telefone,
  duracao,
  minutosParaHora,
  horaParaMinutos,
  dataLonga,
  somarDias,
  diaDaSemana,
  mascararTelefone,
  ROTULO_STATUS,
} from "../lib/formato.js";
import { agoraNaBarbearia, hojeNaBarbearia } from "../lib/fuso.js";
import { irPara, recarregarRota } from "../lib/router.js";
import { contexto } from "../dados/sessao.js";
import { avatarBarbeiro } from "../lib/marca.js";
import { termos, flexoes, maiuscula } from "../config/segmentos.js";
import { expedienteDoDia } from "../dados/barbearias.js";
import { listarBarbeiros } from "../dados/barbeiros.js";
import { listarServicos } from "../dados/servicos.js";
import { listarClientes, salvarCliente } from "../dados/clientes.js";
import { listarBloqueiosDoDia } from "../dados/bloqueios.js";
import {
  listarAgendamentosDoDia,
  criarAgendamento,
  atualizarStatus,
  excluirAgendamento,
} from "../dados/agendamentos.js";

// 84px por hora deixa um atendimento de 30 min com ~40px de altura — perto
// do alvo de toque confortável no celular sem esticar demais o dia. Serviços
// de 15 min ficam menores por definição: a altura representa a duração, e
// aumentá-la mentiria sobre a agenda.
const ALTURA_HORA = 84;
const PPM = ALTURA_HORA / 60;
const PASSO_CLIQUE = 15;

export async function telaAgenda({ container, params, ehAtual }) {
  const { barbearia, perfil } = contexto();
  const T = termos(barbearia);
  const F = flexoes(barbearia);
  const hoje = hojeNaBarbearia(barbearia.timezone);
  const dia = /^\d{4}-\d{2}-\d{2}$/.test(params.get("dia") ?? "") ? params.get("dia") : hoje;

  container.append(carregando("Carregando a agenda…"));

  const [todosBarbeiros, servicos, clientes, agendamentos, bloqueios] = await Promise.all([
    listarBarbeiros(barbearia.id, { somenteAtivos: true }),
    listarServicos(barbearia.id, { somenteAtivos: true }),
    listarClientes(barbearia.id),
    listarAgendamentosDoDia(barbearia.id, dia),
    listarBloqueiosDoDia(barbearia.id, dia),
  ]);

  if (!ehAtual()) return;

  // O barbeiro vê a coluna dele e mais nenhuma. O filtro é na lista que
  // monta a grade inteira, não no visual: assim os agendamentos dos
  // colegas nem chegam a ser desenhados.
  const soMinhaAgenda = perfil.papel === "barbeiro";
  const barbeiros = soMinhaAgenda
    ? todosBarbeiros.filter((b) => b.id === perfil.barbeiroId)
    : todosBarbeiros;

  if (soMinhaAgenda && barbeiros.length === 0) {
    render(
      container,
      el("div", { class: "cabecalho-tela" }, [el("div", {}, [el("h1", {}, "Minha agenda")])]),
      vazio(
        `Seu acesso ainda não está ligado a um ${T.profissional}`,
        `Peça ao dono ${F.de} para vincular o seu acesso ao seu cadastro, na tela de Acessos.`,
      ),
    );
    return;
  }

  const expediente = expedienteDoDia(barbearia, diaDaSemana(dia));
  const estado = { barbearia, dia, hoje, barbeiros, servicos, clientes, agendamentos, bloqueios, expediente };

  render(
    container,
    el("div", { class: "cabecalho-tela" }, [
      el("div", {}, [el("h1", {}, soMinhaAgenda ? "Minha agenda" : "Agenda")]),
      barbeiros.length
        ? el(
            "button",
            {
              class: "btn btn-primario",
              type: "button",
              onclick: () => abrirNovo(estado, barbeiros[0].id, horaSugerida(estado)),
            },
            "Novo agendamento",
          )
        : null,
    ]),
    barraDeDias(estado),
    barbeiros.length === 0
      ? vazio(
          `Cadastre um ${T.profissional} primeiro`,
          `A agenda mostra uma coluna por ${T.profissional} ativo.`,
          el(
            "button",
            { class: "btn btn-primario", type: "button", onclick: () => irPara("/barbeiros") },
            `Ir para ${maiuscula(T.profissionais)}`,
          ),
        )
      : grade(estado),
    barbeiros.length ? legenda(barbeiros) : null,
  );
}

/* ------------------------------------------------------------------ */
/* Barra de navegação de dias                                          */
/* ------------------------------------------------------------------ */
function barraDeDias({ dia, hoje, expediente, agendamentos }) {
  const ir = (novo) => irPara(`/agenda?dia=${novo}`);
  const ativos = agendamentos.filter((a) => a.status !== "cancelado").length;

  return el("div", {}, [
    el("div", { class: "agenda-barra" }, [
      el("button", { class: "navegar", type: "button", "aria-label": "Dia anterior", onclick: () => ir(somarDias(dia, -1)) }, "‹"),
      el("div", { class: "data-atual" }, [
        el("p", { class: "dia" }, dataLonga(dia)),
        el("p", { class: "expediente" },
          expediente
            ? `${expediente.abre} às ${expediente.fecha} · ${ativos} atendimento(s)`
            : "Fechado neste dia — encaixes ainda podem ser lançados"),
      ]),
      el("button", { class: "navegar", type: "button", "aria-label": "Próximo dia", onclick: () => ir(somarDias(dia, 1)) }, "›"),
    ]),
    el("div", { class: "agenda-ferramentas" }, [
      el("input", {
        class: "campo",
        type: "date",
        value: dia,
        "aria-label": "Escolher data",
        onchange: (e) => e.target.value && ir(e.target.value),
      }),
      dia !== hoje
        ? el("button", { class: "btn btn-secundario", type: "button", onclick: () => ir(hoje) }, "Hoje")
        : null,
    ]),
  ]);
}

function legenda(barbeiros) {
  return el(
    "div",
    { class: "legenda" },
    barbeiros.map((b) =>
      el("span", {}, [avatarBarbeiro(b, { tamanho: 22 }), b.nome]),
    ),
  );
}

/* ------------------------------------------------------------------ */
/* Grade                                                               */
/* ------------------------------------------------------------------ */
function janela({ expediente, agendamentos, bloqueios }) {
  let inicio = horaParaMinutos(expediente?.abre ?? "08:00");
  let fim = horaParaMinutos(expediente?.fecha ?? "20:00");

  // se houver encaixe fora do expediente, a grade estica para mostrá-lo
  for (const a of agendamentos) {
    inicio = Math.min(inicio, Math.floor(a.inicioMin / 60) * 60);
    fim = Math.max(fim, Math.ceil(a.fimMin / 60) * 60);
  }
  for (const b of bloqueios) {
    inicio = Math.min(inicio, Math.floor(b.inicioMin / 60) * 60);
    fim = Math.max(fim, Math.ceil(b.fimMin / 60) * 60);
  }

  inicio = Math.max(0, inicio);
  fim = Math.min(1440, Math.max(fim, inicio + 120));
  return { inicio, fim, altura: (fim - inicio) * PPM };
}

function grade(estado) {
  const { barbeiros } = estado;
  const { inicio, fim, altura } = janela(estado);

  const horas = [];
  for (let m = Math.ceil(inicio / 60) * 60; m <= fim; m += 60) horas.push(m);

  const regua = el("div", { class: "regua" }, [
    el("div", { class: "regua-cabecalho" }),
    el(
      "div",
      { class: "regua-corpo", style: { height: `${altura}px` } },
      horas.map((m) =>
        el("span", { class: "marca-hora", style: { top: `${(m - inicio) * PPM}px` } },
          minutosParaHora(m)),
      ),
    ),
  ]);

  const colunas = barbeiros.map((barbeiro) =>
    coluna(estado, barbeiro, { inicio, fim, altura, horas }),
  );

  // A grade rola na horizontal (colunas) e acompanha a rolagem da página
  // na vertical — no celular isso é mais natural do que dois eixos presos
  // dentro de uma caixa.
  return el("div", { class: "grade" }, el("div", { class: "grade-interna" }, [regua, ...colunas]));
}

function coluna(estado, barbeiro, { inicio, fim, altura, horas }) {
  const { agendamentos, bloqueios, dia, hoje, barbearia } = estado;

  const corpo = el("div", {
    class: "coluna-corpo",
    style: { height: `${altura}px` },
    onclick: (evento) => {
      if (evento.target.closest("[data-bloco]")) return;
      const caixa = evento.currentTarget.getBoundingClientRect();
      const minuto = inicio + (evento.clientY - caixa.top) / PPM;
      const arredondado = Math.round(minuto / PASSO_CLIQUE) * PASSO_CLIQUE;
      abrirNovo(
        estado,
        barbeiro.id,
        minutosParaHora(Math.min(fim - PASSO_CLIQUE, Math.max(inicio, arredondado))),
      );
    },
  });

  for (const m of horas) {
    corpo.append(
      el("div", { class: "linha-hora", style: { top: `${(m - inicio) * PPM}px` } }),
      el("div", { class: "linha-meia", style: { top: `${(m + 30 - inicio) * PPM}px` } }),
    );
  }

  if (dia === hoje) {
    const agora = agoraNaBarbearia(barbearia.timezone).minutos;
    if (agora >= inicio && agora <= fim) {
      corpo.append(el("div", { class: "agora", style: { top: `${(agora - inicio) * PPM}px` } }));
    }
  }

  for (const b of bloqueios) {
    if (b.barbeiroId && b.barbeiroId !== barbeiro.id) continue;
    const topo = Math.max(inicio, b.inicioMin);
    const base = Math.min(fim, b.fimMin);
    if (base <= topo) continue;
    corpo.append(
      el(
        "div",
        {
          class: "bloco bloco-bloqueio",
          style: { top: `${(topo - inicio) * PPM}px`, height: `${(base - topo) * PPM}px` },
        },
        el("span", { class: "hora" }, b.motivo ?? "Bloqueado"),
      ),
    );
  }

  for (const a of agendamentos.filter((x) => x.barbeiroId === barbeiro.id)) {
    const inativo = a.status === "cancelado" || a.status === "faltou";
    corpo.append(
      el(
        "button",
        {
          class: `bloco ${inativo ? "bloco-inativo" : ""}`,
          type: "button",
          dataset: { bloco: "1" },
          style: {
            top: `${(a.inicioMin - inicio) * PPM}px`,
            height: `${Math.max(20, (a.fimMin - a.inicioMin) * PPM - 2)}px`,
            ...(inativo
              ? {}
              : {
                  background: `${barbeiro.cor}26`,
                  borderLeft: `3px solid ${barbeiro.cor}`,
                }),
          },
          onclick: () => abrirDetalhe(estado, a),
        },
        [
          el("span", { class: "hora" }, `${minutosParaHora(a.inicioMin)} ${a.clienteNome}`),
          el("span", { class: "servico" }, a.servicoNome),
        ],
      ),
    );
  }

  return el("div", { class: "coluna" }, [
    el("div", { class: "coluna-cabecalho" }, [
      avatarBarbeiro(barbeiro, { tamanho: 26 }),
      el("span", { class: "nome" }, barbeiro.nome),
    ]),
    corpo,
  ]);
}

function horaSugerida({ expediente, barbearia, dia, hoje }) {
  const abre = horaParaMinutos(expediente?.abre ?? "09:00");
  if (dia !== hoje) return minutosParaHora(abre);
  const agora = agoraNaBarbearia(barbearia.timezone).minutos;
  const proximo = Math.ceil(Math.max(abre, agora) / PASSO_CLIQUE) * PASSO_CLIQUE;
  return minutosParaHora(Math.min(proximo, 23 * 60 + 45));
}

/* ------------------------------------------------------------------ */
/* Novo agendamento                                                    */
/* ------------------------------------------------------------------ */
function abrirNovo(estado, barbeiroId, hora) {
  const { barbeiros, servicos, clientes, dia, barbearia } = estado;
  const T = termos(barbearia);

  if (servicos.length === 0) {
    abrirModal("Novo agendamento", () =>
      el("div", { class: "aviso aviso-info" },
        `Cadastre ao menos um ${T.servico} antes de agendar — é ele que define a duração e o preço.`),
    );
    return;
  }

  const erro = el("div", { class: "aviso aviso-erro oculto" });
  const fim = el("p", { class: "fraco pequeno", style: { marginTop: "6px" } });

  const selServico = el(
    "select",
    { class: "campo", name: "servicoId", required: true, onchange: atualizarFim },
    servicos.map((s) =>
      el("option", { value: s.id },
        `${s.nome} — ${moeda(s.precoCentavos)} · ${duracao(s.duracaoMin)}`),
    ),
  );

  const inputHora = el("input", {
    class: "campo",
    type: "time",
    name: "hora",
    value: hora,
    step: 900,
    required: true,
    onchange: atualizarFim,
  });

  function atualizarFim() {
    const servico = servicos.find((s) => s.id === selServico.value);
    if (!servico) return;
    const termina = horaParaMinutos(inputHora.value) + servico.duracaoMin;
    fim.textContent = `Termina às ${minutosParaHora(termina)}.`;
  }

  // cliente: escolher um cadastrado ou digitar um novo
  const selCliente = el(
    "select",
    { class: "campo", name: "clienteId" },
    [
      el("option", { value: "" }, "— novo cliente —"),
      ...clientes.map((c) =>
        el("option", { value: c.id }, `${c.nome} — ${telefone(c.telefone)}`),
      ),
    ],
  );

  const camposNovo = el("div", { class: "dupla" }, [
    el("input", { class: "campo", name: "clienteNome", placeholder: "Nome do cliente", "aria-label": "Nome do cliente" }),
    el("input", {
      class: "campo",
      name: "clienteTelefone",
      type: "tel",
      placeholder: "(79) 99999-0000",
      "aria-label": "Telefone do cliente",
      oninput: (e) => (e.target.value = mascararTelefone(e.target.value)),
    }),
  ]);

  selCliente.addEventListener("change", () => {
    camposNovo.classList.toggle("oculto", Boolean(selCliente.value));
  });

  const form = el("form", { onsubmit: enviar }, [
    el("div", { class: "dupla" }, [
      grupo(maiuscula(T.profissional), el(
        "select",
        { class: "campo", name: "barbeiroId", required: true },
        barbeiros.map((b) =>
          el("option", { value: b.id, selected: b.id === barbeiroId }, b.nome),
        ),
      )),
      grupo("Horário", inputHora),
    ]),
    grupo(maiuscula(T.servico), selServico, fim),
    grupo(maiuscula(T.cliente), selCliente, camposNovo),
    grupo("Observações", el("input", { class: "campo", name: "observacoes", placeholder: "Opcional" })),
    erro,
    el("div", { class: "modal-acoes" }, [
      el("button", { class: "btn btn-secundario", type: "button", onclick: fecharModal }, "Cancelar"),
      el("button", { class: "btn btn-primario", type: "submit" }, "Agendar"),
    ]),
  ]);

  async function enviar(evento) {
    evento.preventDefault();
    erro.classList.add("oculto");
    const dados = dadosDoForm(form);
    const botao = form.querySelector('button[type="submit"]');

    try {
      const servico = servicos.find((s) => s.id === dados.servicoId);
      const barbeiro = barbeiros.find((b) => b.id === dados.barbeiroId);

      let clienteId = dados.clienteId;
      let clienteNome = clientes.find((c) => c.id === clienteId)?.nome;
      let clienteTelefone = clienteId;

      await comCarregamento(botao, "Agendando…", async () => {
        if (!clienteId) {
          clienteId = await salvarCliente(barbearia.id, {
            nome: dados.clienteNome,
            telefone: dados.clienteTelefone,
          });
          clienteNome = dados.clienteNome;
          clienteTelefone = dados.clienteTelefone;
        }

        await criarAgendamento(barbearia.id, {
          dia,
          inicioMin: horaParaMinutos(dados.hora),
          barbeiro,
          servico,
          clienteId,
          clienteNome,
          clienteTelefone,
          // cliente já cadastrado com e-mail na ficha recebe os avisos também
          clienteEmail: clientes.find((c) => c.id === clienteId)?.email ?? null,
          observacoes: dados.observacoes,
          origem: "painel",
        });
      });

      fecharModal();
      sucesso("Agendamento criado.");
      recarregarRota();
    } catch (falhou) {
      erro.textContent = mensagemDeErro(falhou);
      erro.classList.remove("oculto");
    }
  }

  abrirModal("Novo agendamento", form);
  atualizarFim();
}

/* ------------------------------------------------------------------ */
/* Detalhe do atendimento                                              */
/* ------------------------------------------------------------------ */
/**
 * Detalhe do atendimento.
 *
 * A agenda é para CONSULTAR: horários, quem vem, o que foi feito. Dizer
 * se o cliente compareceu não acontece mais aqui — mudou para a Visão
 * geral, onde os pendentes ficam reunidos numa lista só. Marcar um a um,
 * caçando bloco na grade, era o caminho mais fácil de esquecer metade.
 *
 * O que sobra aqui: ver os dados, cancelar (que é decisão de agenda, não
 * de fechamento) e excluir.
 */
function abrirDetalhe(estado, agendamento) {
  const { barbearia } = estado;
  const a = agendamento;
  const T = termos(barbearia);

  async function mudar(novo) {
    try {
      await atualizarStatus(barbearia.id, a, novo);
      fecharModal();
      sucesso(`Atendimento: ${ROTULO_STATUS[novo].toLowerCase()}.`);
      recarregarRota();
    } catch (erro) {
      falha(mensagemDeErro(erro));
    }
  }

  abrirModal("Atendimento", () =>
    el("div", {}, [
      el("div", { class: "entre", style: { marginBottom: "14px" } }, [
        el("div", { class: "crescer" }, [
          el("p", { style: { fontSize: "1.0625rem", fontWeight: "500" } }, a.clienteNome),
          el("p", { class: "pequeno suave" }, telefone(a.clienteTelefone)),
        ]),
        el("span", { class: `etiqueta etiqueta-${a.status}` }, ROTULO_STATUS[a.status]),
      ]),

      el("dl", { class: "recibo" }, [
        item(maiuscula(T.servico), a.servicoNome),
        item(maiuscula(T.profissional), a.barbeiroNome),
        item("Horário", `${minutosParaHora(a.inicioMin)} — ${minutosParaHora(a.fimMin)} (${duracao(a.duracaoMin)})`),
        item("Valor", moeda(a.precoCentavos)),
        a.comissaoPercentual
          ? item("Comissão", `${a.comissaoPercentual}% · ${moeda(Math.round((a.precoCentavos * a.comissaoPercentual) / 100))}`)
          : null,
        item("Origem", a.origem === "publico" ? "Link público" : "Painel"),
      ]),

      a.observacoes
        ? el("p", { class: "resumo suave", style: { marginTop: "12px" } }, a.observacoes)
        : null,

      ["agendado", "confirmado"].includes(a.status)
        ? el("p", { class: "fraco pequeno", style: { marginTop: "14px" } },
            "Para registrar se o cliente veio ou faltou, use a Visão geral — os pendentes ficam reunidos lá.")
        : null,

      el("div", { class: "modal-acoes" }, [
        el("button", { class: "btn btn-secundario", type: "button", onclick: fecharModal }, "Fechar"),
        a.status !== "cancelado"
          ? el("button", { class: "btn btn-perigo", type: "button", onclick: () => mudar("cancelado") }, "Cancelar atendimento")
          : null,
      ]),

      el(
        "button",
        {
          class: "btn btn-fantasma btn-bloco btn-mini",
          type: "button",
          style: { marginTop: "8px", color: "var(--erro)" },
          onclick: async () => {
            fecharModal();
            const ok = await confirmar(
              "Excluir atendimento",
              "O registro sai do histórico e do faturamento. Para apenas liberar o horário, use Cancelar.",
              "Excluir",
            );
            if (!ok) return;
            try {
              await excluirAgendamento(barbearia.id, a);
              sucesso("Atendimento excluído.");
              recarregarRota();
            } catch (erro) {
              falha(mensagemDeErro(erro));
            }
          },
        },
        "Excluir do histórico",
      ),
    ]),
  );
}

/* ------------------------------------------------------------------ */
/* Auxiliares de formulário                                            */
/* ------------------------------------------------------------------ */
function grupo(rotulo, ...filhos) {
  return el("div", { class: "grupo" }, [el("span", { class: "rotulo" }, rotulo), ...filhos]);
}

function item(rotulo, valor) {
  return el("div", {}, [el("dt", {}, rotulo), el("dd", {}, valor)]);
}
