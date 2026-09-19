/**
 * Central de comunicação.
 *
 * Três passos numa tela só: escolher quem recebe, escolher o que dizer,
 * disparar. Separar em telas diferentes obrigaria a decorar a seleção
 * enquanto se escolhe o modelo — e a prévia com o nome de quem vai
 * receber é justamente o que evita mandar "Olá, {nome}" para trinta
 * pessoas.
 *
 * POR QUE O WHATSAPP VAI UM A UM
 * O `wa.me` abre uma conversa. Não existe forma de abrir trinta de uma
 * vez, e nem seria bom: o WhatsApp bane número que dispara em rajada. A
 * tela então vira uma fila — abre um, marca como enviado, chama o
 * próximo — e quem controla o ritmo é a pessoa.
 *
 * O e-mail é o contrário: um clique só, todo mundo em cópia oculta.
 */

import { el, render, carregando, vazio } from "../lib/dom.js";
import { abrirModal, fecharModal, sucesso, falha, mensagemDeErro } from "../lib/ui.js";
import { telefone, dataCurta, somarDias, minutosParaHora } from "../lib/formato.js";
import { hojeNaBarbearia } from "../lib/fuso.js";
import { irPara } from "../lib/router.js";
import { contexto } from "../dados/sessao.js";
import { termos } from "../config/segmentos.js";
import { listarClientes } from "../dados/clientes.js";
import { listarAgendamentosDoPeriodo } from "../dados/agendamentos.js";
import { linkPublico } from "../dados/barbearias.js";
import {
  listarModelos,
  semearModelos,
  aplicarVariaveis,
  valoresDoCliente,
  linkWhatsApp,
  linkEmail,
  registrarEnvios,
  listarComunicacoes,
  CANAIS,
} from "../dados/mensagens.js";

const DIAS_SEM_RETORNO = 30;

export async function telaMensagens({ container, ehAtual }) {
  const { barbearia } = contexto();
  const T = termos(barbearia);
  container.append(carregando("Carregando…"));

  const hoje = hojeNaBarbearia(barbearia.timezone);

  const [clientes, modelos, futuros] = await Promise.all([
    listarClientes(barbearia.id),
    semearModelos(barbearia.id, barbearia),
    listarAgendamentosDoPeriodo(barbearia.id, hoje, somarDias(hoje, 60)),
  ]);

  if (!ehAtual()) return;

  // Próximo atendimento de cada cliente: é daí que saem {data}, {hora},
  // {servico} e {profissional}. Só conta o que ainda vai acontecer.
  const proximo = new Map();
  for (const a of futuros.filter((x) => ["agendado", "confirmado"].includes(x.status))) {
    const atual = proximo.get(a.clienteId);
    const antes = !atual || a.dia < atual.dia || (a.dia === atual.dia && a.inicioMin < atual.inicioMin);
    if (antes) proximo.set(a.clienteId, a);
  }

  const estado = {
    barbearia,
    T,
    hoje,
    clientes,
    modelos,
    proximo,
    selecionados: new Set(),
    modeloId: modelos[0]?.id ?? null,
    filtro: "todos",
    busca: "",
  };

  if (modelos.length === 0) {
    render(container, cabecalho(estado), semModelos(T));
    return;
  }

  const painel = el("div");
  render(container, cabecalho(estado), painel);
  desenhar(painel, estado);
}

/* ------------------------------------------------------------------ */
/* Cabeçalho                                                           */
/* ------------------------------------------------------------------ */
function cabecalho(estado) {
  return el("div", { class: "cabecalho-tela" }, [
    el("div", {}, [
      el("h1", {}, "Mensagens"),
      el("p", {}, `Avise seus ${estado.T.clientes} pelo WhatsApp ou por e-mail, sem digitar tudo de novo.`),
    ]),
    el("div", { class: "linha" }, [
      el(
        "button",
        { class: "btn btn-secundario", type: "button", onclick: () => abrirHistorico(estado) },
        "Histórico",
      ),
      el(
        "button",
        { class: "btn btn-secundario", type: "button", onclick: () => irPara("/config") },
        "Modelos",
      ),
    ]),
  ]);
}

function semModelos(T) {
  return vazio(
    "Nenhum modelo de mensagem",
    `Um modelo é o texto que você manda para vários ${T.clientes} trocando só o nome. Crie o primeiro em Configurações › Modelos de mensagem.`,
  );
}

/* ------------------------------------------------------------------ */
/* Tela                                                                */
/* ------------------------------------------------------------------ */
function desenhar(painel, estado) {
  const modelo = estado.modelos.find((m) => m.id === estado.modeloId) ?? estado.modelos[0];
  const alvos = filtrar(estado);

  render(
    painel,

    /* 1 — o que dizer */
    el("section", { class: "secao" }, [
      el("h2", { class: "secao-titulo" }, "1. O que dizer"),
      el("div", { class: "cartao cartao-corpo" }, [
        el(
          "select",
          {
            class: "campo",
            "aria-label": "Modelo de mensagem",
            onchange: (e) => {
              estado.modeloId = e.target.value;
              desenhar(painel, estado);
            },
          },
          estado.modelos.map((m) =>
            el("option", { value: m.id, selected: m.id === modelo.id },
              `${CANAIS[m.canal]?.emblema ?? ""} ${m.nome}`),
          ),
        ),
        previa(estado, modelo),
      ]),
    ]),

    /* 2 — quem recebe */
    el("section", { class: "secao" }, [
      el("h2", { class: "secao-titulo" }, `2. Quem recebe`),
      filtros(painel, estado),
      buscador(painel, estado),
      alvos.length === 0
        ? vazio("Ninguém neste filtro", "Tente outro filtro ou limpe a busca.")
        : listaClientes(painel, estado, alvos, modelo),
    ]),

    /* 3 — enviar */
    barraEnvio(painel, estado, modelo),
  );
}

/* --- prévia -------------------------------------------------------- */
function previa(estado, modelo) {
  const primeiro = [...estado.selecionados][0];
  const cliente = estado.clientes.find((c) => c.id === primeiro) ?? null;

  const texto = aplicarVariaveis(
    modelo.texto,
    valoresDoCliente(cliente ?? { nome: `{nome}` }, {
      barbearia: estado.barbearia,
      agendamento: cliente ? estado.proximo.get(cliente.id) : null,
      link: linkPublico(estado.barbearia.slug),
    }),
  );

  return el("div", { style: { marginTop: "12px" } }, [
    el("p", { class: "rotulo", style: { marginBottom: "6px" } },
      cliente ? `Prévia — como ${cliente.nome} vai receber` : "Prévia"),
    modelo.canal === "email" && modelo.assunto
      ? el("p", { class: "pequeno suave", style: { marginBottom: "6px" } },
          `Assunto: ${aplicarVariaveis(modelo.assunto, valoresDoCliente(cliente ?? {}, { barbearia: estado.barbearia }))}`)
      : null,
    el("div", { class: "previa-mensagem" }, texto),
    !cliente
      ? el("p", { class: "fraco pequeno", style: { marginTop: "6px" } },
          "Selecione alguém abaixo para ver a mensagem com os dados reais.")
      : null,
  ]);
}

/* --- filtros ------------------------------------------------------- */
function filtros(painel, estado) {
  const limite = somarDias(estado.hoje, -DIAS_SEM_RETORNO);
  const amanha = somarDias(estado.hoje, 1);
  const mesAtual = estado.hoje.slice(5, 7);

  const opcoes = [
    { id: "todos", nome: "Todos" },
    { id: "amanha", nome: "Atendimento amanhã" },
    { id: "semana", nome: "Próximos 7 dias" },
    { id: "sumidos", nome: `Sem retorno há ${DIAS_SEM_RETORNO} dias` },
    { id: "aniversario", nome: "Aniversariantes do mês" },
  ];

  estado.regras = {
    todos: () => true,
    amanha: (c) => estado.proximo.get(c.id)?.dia === amanha,
    semana: (c) => {
      const p = estado.proximo.get(c.id);
      return p && p.dia >= estado.hoje && p.dia <= somarDias(estado.hoje, 7);
    },
    sumidos: (c) => c.ultimaVisitaDia && c.ultimaVisitaDia < limite,
    aniversario: (c) => c.nascimento && c.nascimento.slice(5, 7) === mesAtual,
  };

  return el(
    "div",
    { class: "filtro-botoes", style: { marginBottom: "10px", flexWrap: "wrap" } },
    opcoes.map((o) =>
      el(
        "button",
        {
          type: "button",
          "aria-pressed": String(o.id === estado.filtro),
          onclick: () => {
            estado.filtro = o.id;
            desenhar(painel, estado);
          },
        },
        o.nome,
      ),
    ),
  );
}

function buscador(painel, estado) {
  return el("input", {
    class: "campo",
    type: "search",
    value: estado.busca,
    placeholder: "Buscar por nome ou telefone",
    "aria-label": "Buscar",
    style: { marginBottom: "10px" },
    oninput: (e) => {
      estado.busca = e.target.value;
      desenhar(painel, estado);
    },
  });
}

function filtrar(estado) {
  const regra = estado.regras?.[estado.filtro] ?? (() => true);
  const termo = estado.busca.trim().toLowerCase();
  const digitos = termo.replace(/\D/g, "");

  return estado.clientes.filter((c) => {
    if (!regra(c)) return false;
    if (!termo) return true;
    const porNome = String(c.nome ?? "").toLowerCase().includes(termo);
    const porTelefone = digitos && String(c.telefone ?? "").includes(digitos);
    return porNome || porTelefone;
  });
}

/* --- lista --------------------------------------------------------- */
function listaClientes(painel, estado, alvos, modelo) {
  const alcancaveis = alvos.filter((c) => alcanca(c, modelo.canal));
  const todosMarcados = alcancaveis.length > 0 && alcancaveis.every((c) => estado.selecionados.has(c.id));

  return el("div", {}, [
    el("div", { class: "entre", style: { marginBottom: "8px" } }, [
      el(
        "button",
        {
          class: "btn btn-fantasma btn-mini",
          type: "button",
          onclick: () => {
            if (todosMarcados) alcancaveis.forEach((c) => estado.selecionados.delete(c.id));
            else alcancaveis.forEach((c) => estado.selecionados.add(c.id));
            desenhar(painel, estado);
          },
        },
        todosMarcados ? "Desmarcar todos" : `Selecionar todos (${alcancaveis.length})`,
      ),
      el("span", { class: "pequeno fraco" }, `${alvos.length} na lista`),
    ]),

    el(
      "ul",
      { class: "cartao lista" },
      alvos.map((c) => linhaCliente(painel, estado, c, modelo)),
    ),
  ]);
}

/** O cliente tem o dado que este canal exige? */
function alcanca(cliente, canal) {
  if (canal === "email") return Boolean(cliente.email);
  return String(cliente.telefone ?? "").replace(/\D/g, "").length >= 10;
}

function linhaCliente(painel, estado, c, modelo) {
  const pode = alcanca(c, modelo.canal);
  const marcado = estado.selecionados.has(c.id);
  const agendamento = estado.proximo.get(c.id);

  const caixa = el("input", {
    type: "checkbox",
    class: "caixa-selecao",
    checked: marcado,
    disabled: !pode,
    "aria-label": `Selecionar ${c.nome}`,
    onchange: (e) => {
      if (e.target.checked) estado.selecionados.add(c.id);
      else estado.selecionados.delete(c.id);
      // Redesenha só a barra e a prévia: refazer a lista inteira a cada
      // clique perderia a posição da rolagem no meio de uma seleção longa.
      atualizarBarra(painel, estado);
    },
  });

  return el("li", { class: pode ? "" : "linha-inalcancavel" }, [
    el("label", { class: "item", style: { cursor: pode ? "pointer" : "default" } }, [
      caixa,
      el("div", { class: "crescer" }, [
        el("p", { class: "truncar", style: { fontWeight: "500" } }, c.nome),
        el("p", { class: "pequeno suave truncar" },
          modelo.canal === "email"
            ? (c.email ?? "sem e-mail cadastrado")
            : telefone(c.telefone)),
      ]),
      agendamento
        ? el("span", { class: "pequeno fraco num", style: { flexShrink: "0", textAlign: "right" } },
            `${dataCurta(agendamento.dia)} ${minutosParaHora(agendamento.inicioMin)}`)
        : null,
    ]),
  ]);
}

/* --- barra de envio ------------------------------------------------ */
function barraEnvio(painel, estado, modelo) {
  const barra = el("section", { class: "barra-envio", id: "barra-envio" });
  render(barra, conteudoBarra(painel, estado, modelo));
  return barra;
}

function atualizarBarra(painel, estado) {
  const modelo = estado.modelos.find((m) => m.id === estado.modeloId) ?? estado.modelos[0];
  const barra = painel.querySelector("#barra-envio");
  if (barra) render(barra, conteudoBarra(painel, estado, modelo));

  // A prévia mostra o primeiro selecionado; se ele mudou, ela mudou.
  const cartao = painel.querySelector(".secao .cartao-corpo");
  if (cartao) {
    const antiga = cartao.querySelector("div:last-child");
    if (antiga) cartao.replaceChild(previa(estado, modelo), antiga);
  }
}

function conteudoBarra(painel, estado, modelo) {
  const quantos = estado.selecionados.size;

  if (quantos === 0) {
    return el("p", { class: "fraco pequeno centro" },
      `Selecione quem vai receber para liberar o envio.`);
  }

  return el("div", { class: "entre" }, [
    el("span", { class: "pequeno" }, [
      el("b", {}, String(quantos)),
      ` ${quantos === 1 ? "selecionado" : "selecionados"} · ${CANAIS[modelo.canal].nome}`,
    ]),
    el(
      "button",
      {
        class: "btn btn-primario",
        type: "button",
        onclick: () =>
          modelo.canal === "email"
            ? enviarEmail(painel, estado, modelo)
            : abrirFila(painel, estado, modelo),
      },
      modelo.canal === "email" ? "Preparar e-mail" : "Enviar no WhatsApp",
    ),
  ]);
}

/* ------------------------------------------------------------------ */
/* Envio por e-mail — um clique, todos em cópia oculta                 */
/* ------------------------------------------------------------------ */
async function enviarEmail(painel, estado, modelo) {
  const alvos = [...estado.selecionados]
    .map((id) => estado.clientes.find((c) => c.id === id))
    .filter((c) => c && c.email);

  if (alvos.length === 0) {
    falha("Nenhum dos selecionados tem e-mail cadastrado.");
    return;
  }

  // Um e-mail só para todo mundo: o texto tem que valer para qualquer um
  // dos destinatários, então as variáveis de cliente não se aplicam. Só
  // as do estabelecimento entram.
  const valores = valoresDoCliente(
    {},
    { barbearia: estado.barbearia, link: linkPublico(estado.barbearia.slug) },
  );
  const texto = aplicarVariaveis(modelo.texto, { ...valores, nome: "", nome_completo: "" });
  const assunto = aplicarVariaveis(modelo.assunto ?? modelo.nome, valores);

  const link = linkEmail(alvos.map((c) => c.email), assunto, texto);
  if (!link) {
    falha("Não foi possível montar o e-mail.");
    return;
  }

  window.location.href = link;

  try {
    await registrarEnvios(
      estado.barbearia.id,
      alvos.map((c) => ({ cliente: c, canal: "email", modelo, texto, assunto })),
    );
    sucesso(`${alvos.length} destinatário(s) no histórico. Confira e envie pelo seu e-mail.`);
    estado.selecionados.clear();
    desenhar(painel, estado);
  } catch (erro) {
    falha(mensagemDeErro(erro));
  }
}

/* ------------------------------------------------------------------ */
/* Envio por WhatsApp — fila, um de cada vez                           */
/* ------------------------------------------------------------------ */
function abrirFila(painel, estado, modelo) {
  const fila = [...estado.selecionados]
    .map((id) => estado.clientes.find((c) => c.id === id))
    .filter((c) => c && alcanca(c, "whatsapp"));

  if (fila.length === 0) {
    falha("Nenhum dos selecionados tem telefone válido.");
    return;
  }

  let indice = 0;
  const enviados = [];
  const corpo = el("div");

  function textoDe(cliente) {
    return aplicarVariaveis(
      modelo.texto,
      valoresDoCliente(cliente, {
        barbearia: estado.barbearia,
        agendamento: estado.proximo.get(cliente.id),
        link: linkPublico(estado.barbearia.slug),
      }),
    );
  }

  async function encerrar() {
    fecharModal();
    if (enviados.length > 0) {
      try {
        await registrarEnvios(
          estado.barbearia.id,
          enviados.map((c) => ({ cliente: c, canal: "whatsapp", modelo, texto: textoDe(c) })),
        );
        sucesso(`${enviados.length} mensagem(ns) registrada(s) no histórico.`);
      } catch (erro) {
        falha(mensagemDeErro(erro));
      }
      enviados.forEach((c) => estado.selecionados.delete(c.id));
    }
    desenhar(painel, estado);
  }

  function passo() {
    if (indice >= fila.length) {
      render(
        corpo,
        el("div", { class: "centro", style: { padding: "16px 0" } }, [
          el("div", { style: { fontSize: "2rem" }, "aria-hidden": "true" }, "✅"),
          el("h3", { style: { marginTop: "8px", fontSize: "1.0625rem" } }, "Fila concluída"),
          el("p", { class: "suave pequeno", style: { marginTop: "6px" } },
            `${enviados.length} de ${fila.length} aberto(s) no WhatsApp.`),
        ]),
        el("div", { class: "modal-acoes" }, [
          el("button", { class: "btn btn-primario", type: "button", onclick: encerrar }, "Concluir"),
        ]),
      );
      return;
    }

    const cliente = fila[indice];
    const texto = textoDe(cliente);
    const link = linkWhatsApp(cliente.telefone, texto);

    render(
      corpo,

      el("p", { class: "pequeno fraco", style: { marginBottom: "8px" } },
        `${indice + 1} de ${fila.length}`),

      el("p", { style: { fontWeight: "600" } }, cliente.nome),
      el("p", { class: "pequeno suave num", style: { marginBottom: "12px" } },
        telefone(cliente.telefone)),

      el("div", { class: "previa-mensagem" }, texto),

      el("div", { class: "modal-acoes", style: { marginTop: "16px" } }, [
        el(
          "button",
          {
            class: "btn btn-secundario",
            type: "button",
            onclick: () => {
              indice += 1;
              passo();
            },
          },
          "Pular",
        ),
        el(
          "a",
          {
            class: "btn btn-primario",
            href: link,
            target: "_blank",
            rel: "noreferrer",
            onclick: () => {
              enviados.push(cliente);
              indice += 1;
              // O clique abre o WhatsApp noutra aba; o passo seguinte só
              // faz sentido depois disso, senão a tela troca embaixo da
              // mão de quem ainda está clicando.
              setTimeout(passo, 250);
            },
          },
          "Abrir WhatsApp",
        ),
      ]),

      el("button", {
        class: "btn btn-fantasma btn-bloco btn-mini",
        type: "button",
        style: { marginTop: "8px" },
        onclick: encerrar,
      }, "Parar por aqui"),
    );
  }

  passo();
  abrirModal(`Enviar — ${modelo.nome}`, corpo);
}

/* ------------------------------------------------------------------ */
/* Histórico                                                           */
/* ------------------------------------------------------------------ */
async function abrirHistorico(estado) {
  const corpo = el("div", {}, carregando("Buscando o histórico…"));
  abrirModal("Mensagens enviadas", corpo);

  let lista = [];
  try {
    lista = await listarComunicacoes(estado.barbearia.id);
  } catch (erro) {
    render(corpo, el("div", { class: "aviso aviso-erro" }, mensagemDeErro(erro)));
    return;
  }

  render(
    corpo,
    lista.length === 0
      ? el("p", { class: "fraco pequeno centro", style: { padding: "16px 0" } },
          "Nada enviado ainda.")
      : el(
          "ul",
          { class: "cartao lista" },
          lista.slice(0, 100).map((c) =>
            el("li", {}, [
              el("div", { class: "item" }, [
                el("span", { "aria-hidden": "true", style: { flexShrink: "0" } },
                  CANAIS[c.canal]?.emblema ?? "•"),
                el("div", { class: "crescer" }, [
                  el("p", { class: "truncar pequeno", style: { fontWeight: "500" } },
                    c.clienteNome ?? "—"),
                  el("p", { class: "truncar pequeno fraco" }, c.modeloNome ?? ""),
                ]),
                el("span", { class: "pequeno fraco num", style: { flexShrink: "0" } },
                  quando(c.enviadoEm)),
              ]),
            ]),
          ),
        ),

    // Sem backend não existe confirmação de entrega, e a tela não pode
    // sugerir que existe: "enviado" aqui significa "aberto no WhatsApp".
    el("p", { class: "fraco pequeno", style: { marginTop: "12px" } },
      "O histórico registra o que foi disparado por aqui. Confirmação de entrega e leitura depende de integração com a API oficial."),

    el("div", { class: "modal-acoes" }, [
      el("button", { class: "btn btn-secundario", type: "button", onclick: fecharModal }, "Fechar"),
    ]),
  );
}

function quando(valor) {
  if (!valor) return "";
  const d = typeof valor?.toDate === "function" ? valor.toDate() : new Date(valor);
  if (Number.isNaN(d.getTime())) return "";
  const dia = `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
  const hora = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  return `${dia} ${hora}`;
}
