/** Clientes: ficha, histórico e quem sumiu. */

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
import {
  moeda,
  telefone,
  mascararTelefone,
  dataCurta,
  minutosParaHora,
  somarDias,
  ROTULO_STATUS,
} from "../lib/formato.js";
import { hojeNaBarbearia } from "../lib/fuso.js";
import { recarregarRota } from "../lib/router.js";
import { contexto, ehGestor } from "../dados/sessao.js";
import { termos, maiuscula } from "../config/segmentos.js";
import {
  listarClientes,
  salvarCliente,
  excluirCliente,
  filtrarClientes,
} from "../dados/clientes.js";
import { listarAgendamentosDoCliente } from "../dados/agendamentos.js";

export async function telaClientes({ container, ehAtual }) {
  const { barbearia } = contexto();
  const T = termos(barbearia);
  container.append(carregando());

  const clientes = await listarClientes(barbearia.id);
  if (!ehAtual()) return;

  const hoje = hojeNaBarbearia(barbearia.timezone);
  const limite = somarDias(hoje, -30);
  const lista = el("div");

  function desenharLista(termo = "") {
    const filtrados = filtrarClientes(clientes, termo);

    render(
      lista,
      filtrados.length === 0
        ? vazio(
            termo ? "Nenhum cliente encontrado" : "Nenhum cliente ainda",
            termo
              ? "Tente outro nome ou telefone."
              : "Os clientes entram sozinhos quando agendam pelo link público — ou você cadastra aqui.",
          )
        : el(
            "ul",
            { class: "cartao lista" },
            filtrados.map((c) => linha(barbearia.id, c, limite)),
          ),
    );
  }

  const busca = el("input", {
    class: "campo",
    type: "search",
    placeholder: "Buscar por nome ou telefone",
    "aria-label": "Buscar cliente",
    oninput: (e) => desenharLista(e.target.value),
  });

  render(
    container,
    el("div", { class: "cabecalho-tela" }, [
      el("div", {}, [
        el("h1", {}, maiuscula(T.clientes)),
        el("p", {}, `${clientes.length} cadastrado(s) · quem não vem há mais de 30 dias fica marcado.`),
      ]),
      el("button", { class: "btn btn-primario", type: "button", onclick: () => abrirForm(barbearia.id) }, `Novo ${T.cliente}`),
    ]),
    el("div", { style: { marginBottom: "14px" } }, busca),
    lista,
  );

  desenharLista();
}

function linha(bid, c, limiteRetorno) {
  const sumido = c.ultimaVisitaDia && c.ultimaVisitaDia < limiteRetorno;

  return el("li", {}, [
    el("button", { class: "item", type: "button", onclick: () => abrirFicha(bid, c) }, [
      el("div", { class: "crescer" }, [
        el("p", { class: "truncar", style: { fontWeight: "500" } }, c.nome),
        el("p", { class: "pequeno suave num" }, telefone(c.telefone)),
      ]),
      el("span", { style: { textAlign: "right", flexShrink: "0" } }, [
        el("span", { class: "pequeno", style: { display: "block" } },
          `${c.totalVisitas ?? 0} visita(s)`),
        el("span", { class: "pequeno fraco num", style: { display: "block" } },
          moeda(c.totalGastoCentavos ?? 0)),
      ]),
      sumido ? el("span", { class: "etiqueta etiqueta-agendado" }, "Sumido") : null,
    ]),
  ]);
}

/* ------------------------------------------------------------------ */
/* Ficha com histórico                                                 */
/* ------------------------------------------------------------------ */
async function abrirFicha(bid, cliente) {
  const corpo = el("div", {}, carregando("Buscando o histórico…"));

  abrirModal(cliente.nome, corpo);

  let historico = [];
  try {
    historico = await listarAgendamentosDoCliente(bid, cliente.id);
  } catch (erro) {
    console.error(erro);
  }

  render(
    corpo,
    el("dl", { class: "recibo" }, [
      item("Telefone", telefone(cliente.telefone)),
      cliente.email ? item("E-mail", cliente.email) : null,
      item("Visitas", String(cliente.totalVisitas ?? 0)),
      item("Total gasto", moeda(cliente.totalGastoCentavos ?? 0)),
      cliente.ultimaVisitaDia
        ? item("Última visita", dataCurta(cliente.ultimaVisitaDia))
        : item("Última visita", "nunca veio"),
    ]),

    cliente.observacoes
      ? el("p", { class: "resumo suave", style: { marginTop: "12px" } }, cliente.observacoes)
      : null,

    el("h3", { class: "secao-titulo", style: { marginTop: "20px" } }, "Histórico"),
    historico.length === 0
      ? el("p", { class: "fraco pequeno" }, "Nenhum atendimento registrado.")
      : el(
          "ul",
          { class: "cartao lista" },
          historico.slice(0, 20).map((a) =>
            el("li", {}, [
              el("div", { class: "item" }, [
                el("span", { class: "num pequeno", style: { width: "84px", flexShrink: "0" } },
                  `${dataCurta(a.dia)} ${minutosParaHora(a.inicioMin)}`),
                el("div", { class: "crescer" }, [
                  el("p", { class: "truncar pequeno" }, a.servicoNome),
                  el("p", { class: "truncar pequeno fraco" }, a.barbeiroNome),
                ]),
                el("span", { class: `etiqueta etiqueta-${a.status}` }, ROTULO_STATUS[a.status]),
              ]),
            ]),
          ),
        ),

    el("div", { class: "modal-acoes" }, [
      el("button", { class: "btn btn-secundario", type: "button", onclick: fecharModal }, "Fechar"),
      el(
        "button",
        {
          class: "btn btn-primario",
          type: "button",
          onclick: () => {
            fecharModal();
            abrirForm(bid, cliente);
          },
        },
        "Editar ficha",
      ),
    ]),
  );
}

/* ------------------------------------------------------------------ */
/* Formulário                                                          */
/* ------------------------------------------------------------------ */
function abrirForm(bid, cliente = null) {
  const erro = el("div", { class: "aviso aviso-erro oculto" });

  const form = el("form", { onsubmit: enviar }, [
    el("div", { class: "dupla" }, [
      grupo("Nome", el("input", { class: "campo", name: "nome", required: true, value: cliente?.nome ?? "" })),
      grupo("Telefone", el("input", {
        class: "campo",
        name: "telefone",
        type: "tel",
        required: true,
        // o telefone é o identificador do cliente: mudar viraria outro cadastro
        readonly: Boolean(cliente),
        value: telefone(cliente?.telefone),
        placeholder: "(79) 99999-0000",
        oninput: (e) => (e.target.value = mascararTelefone(e.target.value)),
      })),
    ]),

    el("div", { class: "dupla" }, [
      grupo("E-mail (opcional)", el("input", { class: "campo", name: "email", type: "email", value: cliente?.email ?? "" })),
      grupo("Aniversário (opcional)", el("input", { class: "campo", name: "nascimento", type: "date", value: cliente?.nascimento ?? "" })),
    ]),

    grupo("Observações", el("textarea", {
      class: "campo",
      name: "observacoes",
      rows: 3,
      placeholder: "Máquina 2 nas laterais, não gosta de navalha no pescoço…",
    }, cliente?.observacoes ?? "")),

    erro,

    el("div", { class: "modal-acoes" }, [
      el("button", { class: "btn btn-secundario", type: "button", onclick: fecharModal }, "Cancelar"),
      el("button", { class: "btn btn-primario", type: "submit" }, "Salvar"),
    ]),

    cliente && ehGestor()
      ? el(
          "button",
          {
            class: "btn btn-fantasma btn-bloco btn-mini",
            type: "button",
            style: { marginTop: "8px", color: "var(--erro)" },
            onclick: excluir,
          },
          "Excluir cliente",
        )
      : null,
  ]);

  async function enviar(evento) {
    evento.preventDefault();
    erro.classList.add("oculto");
    const botao = form.querySelector('button[type="submit"]');

    try {
      await comCarregamento(botao, "Salvando…", () =>
        salvarCliente(bid, dadosDoForm(form)),
      );
      fecharModal();
      sucesso("Cliente salvo.");
      recarregarRota();
    } catch (falhou) {
      erro.textContent = mensagemDeErro(falhou);
      erro.classList.remove("oculto");
    }
  }

  async function excluir() {
    fecharModal();
    const ok = await confirmar(
      "Excluir cliente",
      "A ficha some, mas os atendimentos continuam no histórico da agenda.",
      "Excluir",
    );
    if (!ok) return;
    try {
      await excluirCliente(bid, cliente.id);
      sucesso("Cliente excluído.");
      recarregarRota();
    } catch (falhou) {
      falha(mensagemDeErro(falhou));
    }
  }

  abrirModal(cliente ? `Editar ${cliente.nome}` : "Novo cliente", form);
}

function grupo(rotulo, campo) {
  return el("div", { class: "grupo" }, [el("span", { class: "rotulo" }, rotulo), campo]);
}

function item(rotulo, valor) {
  return el("div", {}, [el("dt", {}, rotulo), el("dd", {}, valor)]);
}
