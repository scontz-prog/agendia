/**
 * Painel do administrador da plataforma.
 *
 * Aqui se administra CONTA, não estabelecimento: quem se cadastrou, em
 * que plano está, se continua usando e se o acesso está liberado. A
 * agenda e a carteira de clientes de cada conta não aparecem — e não é só
 * omissão de tela: as regras do Firestore recusam a leitura mesmo que
 * este arquivo tentasse.
 *
 * Esta tela atende segmentos diferentes ao mesmo tempo, então cada conta
 * é descrita no vocabulário DELA: a linha da clínica fala em
 * "especialistas", a da barbearia em "barbeiros".
 */

import { $, el, render, carregando, vazio, dadosDoForm } from "./lib/dom.js";
import {
  abrirModal,
  fecharModal,
  sucesso,
  falha,
  confirmar,
  mensagemDeErro,
  toast,
  comCarregamento,
} from "./lib/ui.js";
import { telefone, moeda } from "./lib/formato.js";
import { auth, onAuthStateChanged, signOut, modoLocal } from "./config/firebase.js";
import { LISTA_PLANOS, plano as obterPlano, rotuloLimite } from "./config/planos.js";
import {
  minhaFichaAdmin,
  listarContas,
  definirPlano,
  definirSituacao,
  definirAprovacao,
  definirSegmento,
  situacaoAprovacao,
  APROVACOES,
  listarAdministradores,
  salvarAdministrador,
  removerAdministrador,
  resumoPlataforma,
} from "./dados/admin.js";
import { linkPublico } from "./dados/barbearias.js";
import { iniciais } from "./lib/marca.js";
import { termos, LISTA_SEGMENTOS } from "./config/segmentos.js";

const conteudo = $("#conteudo");

const filtro = { termo: "", situacao: "todas" };
let contas = [];

/**
 * Ficha do administrador em uso, com as permissões dele.
 *
 * Guardada aqui porque quase toda tela pergunta: quem não pode aprovar
 * não vê os botões de aprovar, e quem não é principal não vê a tela de
 * permissões. Nada disso é segurança — a segurança está nas regras do
 * Firestore. Isto é só para não oferecer botão que vai dar erro.
 */
let euAdmin = null;

/** Abas do painel. A fila de aprovação é a primeira coisa a fazer no dia. */
let aba = "contas";

/* ------------------------------------------------------------------ */
/* Sessão                                                              */
/* ------------------------------------------------------------------ */
let iniciado = false;

onAuthStateChanged(auth, async (usuario) => {
  if (!usuario || usuario.isAnonymous) {
    location.replace("admin-entrar.html");
    return;
  }
  if (iniciado) return;
  iniciado = true;

  $("#admin-usuario").textContent = usuario.email ?? "";

  for (const botao of document.querySelectorAll("[data-sair]")) {
    botao.addEventListener("click", async () => {
      await signOut(auth);
      location.replace("admin-entrar.html");
    });
  }

  euAdmin = await minhaFichaAdmin();
  if (!euAdmin) {
    telaSemAcesso(usuario);
    return;
  }

  await carregar();
});

function telaSemAcesso(usuario) {
  render(
    conteudo,
    el("div", { class: "cartao cartao-corpo sem-acesso" }, [
      el("div", { style: { fontSize: "2rem" }, "aria-hidden": "true" }, "🔒"),
      el("h1", { style: { marginTop: "8px", fontSize: "1.125rem" } }, "Acesso restrito"),
      el("p", { class: "suave pequeno", style: { marginTop: "6px" } },
        "Esta área é da administração da plataforma. Sua conta não tem essa permissão."),
      el("p", { class: "fraco pequeno", style: { marginTop: "10px" } },
        modoLocal
          ? "No modo local, entre com admin@agendia.local / 123456."
          : `Para liberar, crie o documento admins/${usuario.uid} no console do Firebase.`),
      el("a", { class: "btn btn-secundario", href: "painel.html", style: { marginTop: "16px" } },
        "Ir para o painel do estabelecimento"),
    ]),
  );
}

/* ------------------------------------------------------------------ */
/* Carregamento                                                        */
/* ------------------------------------------------------------------ */
async function carregar() {
  render(conteudo, carregando("Buscando as contas…"));
  try {
    contas = await listarContas();
    desenhar();
  } catch (erro) {
    console.error(erro);
    render(conteudo, el("div", { class: "aviso aviso-erro" }, mensagemDeErro(erro)));
  }
}

function desenhar() {
  if (aba === "permissoes") {
    telaPermissoes();
    return;
  }

  const resumo = resumoPlataforma(contas);
  const visiveis = aplicarFiltro(contas);

  render(
    conteudo,

    el("div", { class: "cabecalho-tela" }, [
      el("div", {}, [
        el("h1", {}, "Contas da plataforma"),
        el("p", {}, "Plano, situação e uso de cada conta cadastrada."),
      ]),
      el("div", { class: "linha" }, [
        euAdmin?.principal
          ? el(
              "button",
              {
                class: "btn btn-secundario",
                type: "button",
                onclick: () => {
                  aba = "permissoes";
                  desenhar();
                },
              },
              "Permissões de cadastro",
            )
          : null,
        el("button", { class: "btn btn-secundario", type: "button", onclick: carregar }, "Atualizar"),
      ]),
    ]),

    // A fila de aprovação vem antes de tudo: é o que trava um cliente
    // esperando para começar a usar, e o que se resolve primeiro no dia.
    filaDeAprovacao(resumo),

    el("section", { class: "secao" }, [
      el("dl", { class: "indicadores" }, [
        indicador("Estabelecimentos", String(resumo.total)),
        indicador("Ativas", String(resumo.ativas), `${resumo.suspensas} suspensa(s)`, true),
        indicador("Receita mensal", moeda(receitaMensal(contas)), "Somando os planos das ativas"),
        indicador("Sem profissional", String(resumo.semBarbeiro), "Contas que não começaram a usar"),
      ]),
    ]),

    el("section", { class: "secao" }, [
      el("h2", { class: "secao-titulo" }, "Por plano"),
      el(
        "ul",
        { class: "cartao lista" },
        LISTA_PLANOS.map((p) =>
          el("li", {}, [
            el("div", { class: "item" }, [
              el("div", { class: "crescer" }, [
                el("p", { style: { fontWeight: "500" } }, p.nome),
                el("p", { class: "pequeno fraco" }, `${p.resumo} · ${moeda(p.precoCentavos)}/mês`),
              ]),
              el("span", { class: "num" }, `${resumo.porPlano[p.id] ?? 0} conta(s)`),
            ]),
          ]),
        ),
      ),
    ]),

    filtros(),

    visiveis.length === 0
      ? vazio("Nenhuma conta encontrada", "Ajuste a busca ou o filtro de situação.")
      : el("div", { class: "contas" }, visiveis.map(cartaoConta)),
  );
}

/* ------------------------------------------------------------------ */
/* Fila de aprovação                                                   */
/* ------------------------------------------------------------------ */
function filaDeAprovacao(resumo) {
  const pendentes = contas.filter((c) => situacaoAprovacao(c) === "pendente");
  if (pendentes.length === 0) return null;

  return el("section", { class: "secao" }, [
    el("div", { class: "entre", style: { marginBottom: "10px" } }, [
      el("h2", { class: "secao-titulo", style: { marginBottom: "0" } }, "Pendentes de aprovação"),
      el("span", { class: "etiqueta etiqueta-pendente" }, String(resumo.pendentes)),
    ]),

    euAdmin?.podeAprovar
      ? null
      : el("div", { class: "aviso aviso-info", style: { marginBottom: "10px" } },
          "Você não tem permissão para aprovar cadastros. Fale com o administrador principal."),

    el(
      "div",
      { class: "contas" },
      pendentes.map((conta) => cartaoPendente(conta)),
    ),
  ]);
}

function cartaoPendente(conta) {
  const T = termos(conta);

  return el("article", { class: "cartao conta conta-pendente" }, [
    el("div", { class: "conta-topo" }, [
      el("div", { class: "conta-logo" },
        conta.logoUrl
          ? el("img", { src: conta.logoUrl, alt: "" })
          : el("span", { class: "sem-logo" }, iniciais(conta.nome))),
      el("div", { class: "crescer" }, [
        el("p", { class: "conta-nome truncar" }, conta.nome),
        el("p", { class: "conta-slug" }, `/${conta.slug}`),
        el("p", { class: "conta-segmento" }, `${T.segmento.emblema} ${T.segmento.nome}`),
      ]),
      el("span", { class: "etiqueta etiqueta-pendente" }, "Pendente"),
    ]),

    el("div", { class: "conta-dados" }, [
      conta.email ? el("span", { class: "truncar" }, conta.email) : null,
      conta.telefone ? el("span", {}, telefone(conta.telefone)) : null,
      el("span", {}, `Solicitado em ${dataDe(conta.solicitadaEm)}`),
    ]),

    el("div", { class: "conta-acoes" }, [
      el(
        "button",
        {
          class: "btn btn-primario btn-mini",
          type: "button",
          disabled: !euAdmin?.podeAprovar,
          onclick: (e) => aprovar(e.target, conta),
        },
        "Aprovar",
      ),
      el(
        "button",
        {
          class: "btn btn-perigo btn-mini",
          type: "button",
          disabled: !euAdmin?.podeAprovar,
          onclick: () => rejeitar(conta),
        },
        "Rejeitar",
      ),
      el(
        "a",
        {
          class: "btn btn-secundario btn-mini",
          href: linkPublico(conta.slug),
          target: "_blank",
          rel: "noreferrer",
        },
        "Ver link",
      ),
    ]),
  ]);
}

async function aprovar(botao, conta) {
  try {
    await comCarregamento(botao, "Aprovando…", () => definirAprovacao(conta.id, "aprovada"));
    conta.aprovacao = "aprovada";
    sucesso(`${conta.nome}: cadastro aprovado.`);
    desenhar();
  } catch (erro) {
    falha(mensagemDeErro(erro));
  }
}

async function rejeitar(conta) {
  const ok = await confirmar(
    `Rejeitar ${conta.nome}?`,
    "O link público continua fora do ar e a conta não recebe agendamentos. Nada é apagado: o dono continua entrando, e você pode aprovar depois.",
    "Rejeitar",
  );
  if (!ok) return;

  try {
    await definirAprovacao(conta.id, "rejeitada");
    conta.aprovacao = "rejeitada";
    sucesso(`${conta.nome}: cadastro rejeitado.`);
    desenhar();
  } catch (erro) {
    falha(mensagemDeErro(erro));
  }
}

function receitaMensal(lista) {
  return lista
    .filter((c) => c.ativa)
    .reduce((total, c) => total + obterPlano(c.plano).precoCentavos, 0);
}

function indicador(rotulo, valor, detalhe, destaque = false) {
  return el("div", { class: "indicador" }, [
    el("dt", {}, rotulo),
    el("dd", { class: destaque ? "destaque" : null }, valor),
    detalhe ? el("p", { class: "detalhe" }, detalhe) : null,
  ]);
}

/* ------------------------------------------------------------------ */
/* Filtros                                                             */
/* ------------------------------------------------------------------ */
function aplicarFiltro(lista) {
  const termo = filtro.termo.trim().toLowerCase();
  return lista.filter((c) => {
    if (filtro.situacao === "ativas" && !c.ativa) return false;
    if (filtro.situacao === "suspensas" && c.ativa) return false;
    if (filtro.situacao === "pendentes" && situacaoAprovacao(c) !== "pendente") return false;
    if (filtro.situacao === "rejeitadas" && situacaoAprovacao(c) !== "rejeitada") return false;
    if (!termo) return true;
    return (
      c.nome.toLowerCase().includes(termo) ||
      c.slug.includes(termo) ||
      (c.email ?? "").toLowerCase().includes(termo)
    );
  });
}

function filtros() {
  const botao = (id, rotulo) =>
    el(
      "button",
      {
        type: "button",
        "aria-pressed": String(filtro.situacao === id),
        onclick: () => {
          filtro.situacao = id;
          desenhar();
        },
      },
      rotulo,
    );

  return el("div", { class: "filtros" }, [
    el("input", {
      class: "campo",
      type: "search",
      value: filtro.termo,
      placeholder: "Buscar por nome, link ou e-mail",
      "aria-label": "Buscar conta",
      oninput: (e) => {
        filtro.termo = e.target.value;
        // redesenha só a lista para o campo não perder o foco
        const alvo = document.querySelector(".contas, .vazio");
        const visiveis = aplicarFiltro(contas);
        const novo =
          visiveis.length === 0
            ? vazio("Nenhuma conta encontrada", "Ajuste a busca ou o filtro de situação.")
            : el("div", { class: "contas" }, visiveis.map(cartaoConta));
        alvo?.replaceWith(novo);
      },
    }),
    el("div", { class: "filtro-botoes" }, [
      botao("todas", "Todas"),
      botao("pendentes", "Pendentes"),
      botao("ativas", "Ativas"),
      botao("suspensas", "Suspensas"),
      botao("rejeitadas", "Rejeitadas"),
    ]),
  ]);
}

/**
 * Seletor de segmento — só da administração.
 *
 * O cliente escolhe o ramo no cadastro e não muda mais: o segmento define
 * o vocabulário do sistema inteiro para ele, e trocar depois é conversa,
 * não clique. Quem não tem a permissão vê o campo desabilitado, e quem
 * burlar a tela esbarra na regra do Firestore.
 */
function seletorSegmento(conta) {
  const pode = Boolean(euAdmin?.podeAlterarSegmento);

  return el(
    "select",
    {
      class: "campo",
      disabled: !pode,
      "aria-label": `Segmento de ${conta.nome}`,
      title: pode ? "Segmento do estabelecimento" : "Você não tem permissão para alterar o segmento",
      onchange: async (e) => {
        const novo = e.target.value;
        const anterior = conta.segmento ?? "barbearia";
        try {
          await definirSegmento(conta.id, novo);
          conta.segmento = novo;
          sucesso(`${conta.nome}: segmento alterado.`);
          desenhar();
        } catch (erro) {
          e.target.value = anterior;
          falha(mensagemDeErro(erro));
        }
      },
    },
    LISTA_SEGMENTOS.map((s) =>
      el("option", { value: s.id, selected: s.id === (conta.segmento ?? "barbearia") },
        `${s.emblema}  ${s.nome}`),
    ),
  );
}

/* ------------------------------------------------------------------ */
/* Cartão de cada conta                                                */
/* ------------------------------------------------------------------ */
function cartaoConta(conta) {
  const p = obterPlano(conta.plano);
  const T = termos(conta);
  const excedeu = p.maxBarbeiros !== null && conta.qtdBarbeirosAtivos > p.maxBarbeiros;

  const seletorPlano = el(
    "select",
    {
      class: "campo",
      "aria-label": `Plano de ${conta.nome}`,
      onchange: async (e) => {
        const novo = e.target.value;
        try {
          await definirPlano(conta.id, novo);
          conta.plano = novo;
          sucesso(`${conta.nome}: plano alterado para ${obterPlano(novo).nome}.`);
          desenhar();
        } catch (erro) {
          e.target.value = conta.plano;
          falha(mensagemDeErro(erro));
        }
      },
    },
    LISTA_PLANOS.map((op) =>
      el("option", { value: op.id, selected: op.id === conta.plano },
        `${op.nome} — ${moeda(op.precoCentavos)}`),
    ),
  );

  return el("article", { class: `cartao conta ${conta.ativa ? "" : "conta-suspensa"}` }, [
    el("div", { class: "conta-topo" }, [
      el("div", { class: "conta-logo" },
        conta.logoUrl
          ? el("img", { src: conta.logoUrl, alt: "" })
          : el("span", { class: "sem-logo" }, iniciais(conta.nome))),
      el("div", { class: "crescer" }, [
        el("p", { class: "conta-nome truncar" }, conta.nome),
        el("p", { class: "conta-slug" }, `/${conta.slug}`),
        el("p", { class: "conta-segmento" },
          `${T.segmento.emblema} ${T.segmento.nome}`),
      ]),
      el("div", { class: "conta-etiquetas" }, [
        // Aprovação e situação comercial são coisas diferentes: uma conta
        // pode estar aprovada e suspensa por falta de pagamento, ou
        // rejeitada e "ativa" no sentido de não suspensa. Mostrar as duas.
        situacaoAprovacao(conta) === "aprovada"
          ? null
          : el("span", { class: `etiqueta ${APROVACOES[situacaoAprovacao(conta)].etiqueta}` },
              APROVACOES[situacaoAprovacao(conta)].nome),
        el("span", { class: `etiqueta ${conta.ativa ? "etiqueta-realizado" : "etiqueta-cancelado"}` },
          conta.ativa ? "Ativa" : "Suspensa"),
      ]),
    ]),

    el("div", { class: "conta-dados" }, [
      el("span", {}, [
        el("b", {}, String(conta.qtdBarbeirosAtivos)),
        ` ${conta.qtdBarbeirosAtivos === 1 ? T.profissional : T.profissionais} · plano ${rotuloLimite(conta.plano)}`,
      ]),
      el("span", {}, [
        el("b", {}, String(conta.qtdServicos)),
        ` ${conta.qtdServicos === 1 ? T.servico : T.servicos}`,
      ]),
      conta.telefone ? el("span", {}, telefone(conta.telefone)) : null,
      conta.email ? el("span", { class: "truncar" }, conta.email) : null,
      el("span", {}, `Cadastro: ${dataDe(conta.criadoEm)}`),
      el("span", {}, `Último acesso: ${dataDe(conta.ultimoAcessoEm)}`),
    ]),

    excedeu
      ? el("div", { class: "aviso aviso-info", style: { marginTop: "10px" } },
          `Tem ${conta.qtdBarbeirosAtivos} ${T.profissionais} ativos e o plano ${p.nome} cobre ${rotuloLimite(conta.plano)}. Candidata a upgrade.`)
      : null,

    conta.qtdBarbeirosAtivos === 0
      ? el("div", { class: "aviso aviso-info", style: { marginTop: "10px" } },
          `Nenhum ${T.profissional} cadastrado — a conta ainda não saiu do papel.`)
      : null,

    conta.motivoRejeicao
      ? el("div", { class: "aviso aviso-erro", style: { marginTop: "10px" } },
          `Rejeitada: ${conta.motivoRejeicao}`)
      : null,

    el("div", { class: "conta-acoes" }, [
      seletorPlano,
      seletorSegmento(conta),
      el(
        "a",
        {
          class: "btn btn-secundario btn-mini",
          href: linkPublico(conta.slug),
          target: "_blank",
          rel: "noreferrer",
        },
        "Ver link público",
      ),
      el(
        "button",
        {
          class: `btn btn-mini ${conta.ativa ? "btn-perigo" : "btn-primario"}`,
          type: "button",
          onclick: (e) => alternarSituacao(e.target, conta),
        },
        conta.ativa ? "Suspender" : "Reativar",
      ),
    ]),
  ]);
}

/* ------------------------------------------------------------------ */
/* Permissões de cadastro                                              */
/*                                                                     */
/* Só o administrador principal chega aqui. É onde ele decide quem mais */
/* pode aprovar cadastros e quem pode trocar o segmento de uma conta —  */
/* as duas ações que mexem na vida de um cliente sem ele pedir.         */
/* ------------------------------------------------------------------ */
async function telaPermissoes() {
  render(conteudo, carregando("Buscando os administradores…"));

  let lista = [];
  try {
    lista = await listarAdministradores();
  } catch (erro) {
    render(conteudo, el("div", { class: "aviso aviso-erro" }, mensagemDeErro(erro)));
    return;
  }

  render(
    conteudo,

    el("div", { class: "cabecalho-tela" }, [
      el("div", {}, [
        el("h1", {}, "Permissões de cadastro"),
        el("p", {}, "Quem pode aprovar contas novas e quem pode alterar o segmento de uma conta."),
      ]),
      el("div", { class: "linha" }, [
        el(
          "button",
          {
            class: "btn btn-secundario",
            type: "button",
            onclick: () => {
              aba = "contas";
              desenhar();
            },
          },
          "Voltar às contas",
        ),
        el("button", { class: "btn btn-primario", type: "button", onclick: () => abrirAdmin(null) },
          "Novo administrador"),
      ]),
    ]),

    el("div", { class: "aviso aviso-info", style: { marginBottom: "18px" } }, [
      el("strong", {}, "Como funciona. "),
      "O administrador principal é definido no console do Firebase e não pode ser criado por aqui — ",
      "é o que garante que revogar um acesso seja sempre suficiente. Daqui você cria administradores ",
      "auxiliares e marca o que cada um alcança.",
    ]),

    el(
      "ul",
      { class: "cartao lista" },
      lista.map((a) => linhaAdmin(a)),
    ),
  );
}

function linhaAdmin(a) {
  const souEu = a.id === euAdmin?.uid;
  const principal = a.principal === true;

  const marcas = [
    principal ? "Todas as permissões" : null,
    !principal && a.podeAprovar ? "Aprova cadastros" : null,
    !principal && a.podeAlterarSegmento ? "Altera segmento" : null,
  ].filter(Boolean);

  return el("li", {}, [
    el("div", { class: "item" }, [
      el("span", { class: "avatar avatar-iniciais", "aria-hidden": "true",
        style: { width: "40px", height: "40px", fontSize: "15px" } },
        iniciais(a.nome ?? a.email ?? a.id)),

      el("div", { class: "crescer" }, [
        el("p", { class: "truncar", style: { fontWeight: "500" } }, [
          a.nome ?? a.email ?? a.id,
          souEu ? el("span", { class: "pequeno fraco" }, " · você") : null,
        ]),
        el("p", { class: "pequeno suave truncar" }, a.email ?? a.id),
        el("p", { class: "pequeno fraco truncar" },
          marcas.length ? marcas.join(" · ") : "Sem permissões especiais"),
      ]),

      principal
        ? el("span", { class: "etiqueta etiqueta-realizado" }, "Principal")
        : el("span", { class: "etiqueta etiqueta-neutra" }, "Auxiliar"),

      // Ninguém edita a si mesmo, nem ao principal: as duas travas estão
      // também nas regras do Firestore, isto aqui só evita o botão que
      // daria erro.
      principal || souEu
        ? null
        : el(
            "button",
            { class: "btn btn-secundario btn-mini", type: "button", onclick: () => abrirAdmin(a) },
            "Alterar",
          ),
    ]),
  ]);
}

function abrirAdmin(admin) {
  const erro = el("div", { class: "aviso aviso-erro oculto" });
  const novo = !admin;

  const form = el("form", { onsubmit: enviar }, [
    novo
      ? el("div", { class: "aviso aviso-info", style: { marginBottom: "14px" } }, [
          el("strong", {}, "A pessoa precisa já ter uma conta no sistema. "),
          "Pegue o UID dela em Authentication › Users, no console do Firebase, e cole abaixo.",
        ])
      : null,

    grupo(
      "UID do usuário",
      el("input", {
        class: "campo",
        name: "uid",
        required: true,
        readonly: !novo,
        value: admin?.id ?? "",
        placeholder: "abc123DEF456…",
        style: { fontFamily: "ui-monospace, monospace" },
      }),
    ),

    el("div", { class: "dupla" }, [
      grupo("Nome", el("input", { class: "campo", name: "nome", value: admin?.nome ?? "" })),
      grupo("E-mail", el("input", { class: "campo", name: "email", type: "email", value: admin?.email ?? "" })),
    ]),

    el("p", { class: "rotulo", style: { marginTop: "14px", marginBottom: "8px" } }, "O que pode fazer"),

    el("label", { class: "linha", style: { gap: "10px", marginBottom: "8px", cursor: "pointer" } }, [
      el("input", { type: "checkbox", class: "caixa-selecao", name: "podeAprovar", checked: admin?.podeAprovar === true }),
      el("span", {}, "Aprovar e rejeitar cadastros"),
    ]),

    el("label", { class: "linha", style: { gap: "10px", cursor: "pointer" } }, [
      el("input", { type: "checkbox", class: "caixa-selecao", name: "podeAlterarSegmento", checked: admin?.podeAlterarSegmento === true }),
      el("span", {}, "Alterar o segmento de uma conta"),
    ]),

    erro,

    el("div", { class: "modal-acoes" }, [
      el("button", { class: "btn btn-secundario", type: "button", onclick: fecharModal }, "Cancelar"),
      el("button", { class: "btn btn-primario", type: "submit" }, "Salvar"),
    ]),

    novo
      ? null
      : el(
          "button",
          {
            class: "btn btn-fantasma btn-bloco btn-mini",
            type: "button",
            style: { marginTop: "8px", color: "var(--erro)" },
            onclick: remover,
          },
          "Remover administrador",
        ),
  ]);

  async function enviar(evento) {
    evento.preventDefault();
    erro.classList.add("oculto");
    const botao = form.querySelector('button[type="submit"]');
    const dados = dadosDoForm(form);

    try {
      await comCarregamento(botao, "Salvando…", () =>
        salvarAdministrador(dados.uid, dados),
      );
      fecharModal();
      sucesso("Administrador salvo.");
      telaPermissoes();
    } catch (falhou) {
      erro.textContent = mensagemDeErro(falhou);
      erro.classList.remove("oculto");
    }
  }

  async function remover() {
    fecharModal();
    const ok = await confirmar(
      `Remover ${admin.nome ?? admin.email ?? admin.id}?`,
      "A pessoa deixa de acessar a administração da plataforma na hora. A conta de login dela continua existindo.",
      "Remover",
    );
    if (!ok) return;

    try {
      await removerAdministrador(admin.id);
      sucesso("Administrador removido.");
      telaPermissoes();
    } catch (falhou) {
      falha(mensagemDeErro(falhou));
    }
  }

  abrirModal(novo ? "Novo administrador" : `Alterar ${admin.nome ?? admin.email ?? admin.id}`, form);
}

function grupo(rotulo, campo) {
  return el("div", { class: "grupo" }, [el("span", { class: "rotulo" }, rotulo), campo]);
}

async function alternarSituacao(botao, conta) {
  if (conta.ativa) {
    const ok = await confirmar(
      `Suspender ${conta.nome}?`,
      "O link público sai do ar e a conta deixa de gravar agendamentos. Ela continua entrando e consultando o histórico — nada é apagado.",
      "Suspender",
    );
    if (!ok) return;
  }

  try {
    await comCarregamento(botao, "Aplicando…", () => definirSituacao(conta.id, !conta.ativa));
    conta.ativa = !conta.ativa;
    sucesso(`${conta.nome}: ${conta.ativa ? "reativada" : "suspensa"}.`);
    desenhar();
  } catch (erro) {
    falha(mensagemDeErro(erro));
  }
}

/* ------------------------------------------------------------------ */
function dataDe(valor) {
  if (!valor) return "—";
  // no modo local vem ISO; no Firestore vem Timestamp
  const data = typeof valor === "string" ? new Date(valor) : valor?.toDate?.();
  if (!data || Number.isNaN(data.getTime())) return "—";
  return data.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

if (modoLocal) {
  toast("Modo local: as contas listadas são as deste navegador.", "info", 4000);
}
