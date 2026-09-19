/**
 * Página pública de agendamento — /agendar.html?b=slug
 *
 * É a tela que o cliente final abre pelo Instagram, quase sempre no
 * celular e com pressa. Um passo por vez, o próximo só aparece quando o
 * anterior está resolvido, e nenhuma etapa exige criar conta.
 *
 * Por baixo, o visitante entra com login anônimo do Firebase. Isso não é
 * cadastro: serve para as regras do Firestore poderem exigir uma
 * identidade e para o agendamento passar pela mesma transação que o
 * painel usa — a que impede dois clientes no mesmo horário.
 */

import { $, el, render } from "./lib/dom.js";
import { falha, mensagemDeErro, comCarregamento } from "./lib/ui.js";
import {
  moeda,
  duracao,
  telefone,
  mascararTelefone,
  minutosParaHora,
  dataLonga,
  somarDias,
  diaSemanaCurto,
  dataDoDia,
  digitos,
} from "./lib/formato.js";
import { hojeNaBarbearia } from "./lib/fuso.js";
import { assinaturaAgendia, avatarBarbeiro } from "./lib/marca.js";
import { termos } from "./config/segmentos.js";
import { entrarComoVisitante } from "./dados/sessao.js";
import { obterBarbeariaPorSlug } from "./dados/barbearias.js";
import { listarBarbeiros } from "./dados/barbeiros.js";
import { listarServicos } from "./dados/servicos.js";
import { listarBloqueiosDoDia } from "./dados/bloqueios.js";
import {
  listarReservasDoDia,
  horariosDisponiveis,
  criarAgendamento,
  obterAgendamento,
  cancelarPeloCliente,
  podeCancelar,
  HORAS_MINIMAS_CANCELAMENTO,
} from "./dados/agendamentos.js";
import { lembrar, idsGuardados, esquecer } from "./lib/meus-agendamentos.js";
import { registrarClientePublico } from "./dados/clientes.js";

const DIAS_VISIVEIS = 21;
const pagina = $("#pagina");

/**
 * Termos do segmento. Função e não constante porque o estabelecimento só
 * é conhecido depois da primeira leitura — no carregamento do módulo
 * ainda não há segmento nenhum para consultar.
 */
const T = () => termos(estado.barbearia);

const estado = {
  barbearia: null,
  servicos: [],
  barbeiros: [],
  servico: null,
  barbeiro: null,
  dia: null,
  horarios: null, // null = carregando
  horario: null,
  nome: "",
  telefone: "",
  email: "",
  observacoes: "",
  enviando: false,
  erro: null,
  confirmado: null,
  meus: [],
};

iniciar();

async function iniciar() {
  const slug = new URLSearchParams(location.search).get("b");

  if (!slug) {
    render(pagina, aviso("Link incompleto. Peça à barbearia o endereço completo de agendamento."));
    return;
  }

  try {
    await entrarComoVisitante();
    const barbearia = await obterBarbeariaPorSlug(slug);

    if (!barbearia) {
      render(pagina, aviso("Estabelecimento não encontrado. Confira o link."));
      return;
    }

    // Conta suspensa ou ainda não aprovada: o cliente final não precisa
    // saber o motivo — e não deve. Que a plataforma ainda está analisando
    // o cadastro é assunto entre ela e o estabelecimento; para quem só
    // quer marcar um horário, a informação útil é que este canal não está
    // funcionando e por onde falar.
    if (barbearia.ativa === false || (barbearia.aprovacao ?? "aprovada") !== "aprovada") {
      render(
        pagina,
        aviso(
          `O agendamento online da ${barbearia.nome} está temporariamente indisponível. ` +
            "Entre em contato diretamente com o estabelecimento para marcar seu horário.",
        ),
      );
      return;
    }

    const [servicos, barbeiros] = await Promise.all([
      listarServicos(barbearia.id, { somenteAtivos: true }),
      listarBarbeiros(barbearia.id, { somenteAtivos: true }),
    ]);

    estado.barbearia = barbearia;
    estado.servicos = servicos;
    estado.barbeiros = barbeiros;
    estado.dia = hojeNaBarbearia(barbearia.timezone);

    document.title = `Agendar — ${barbearia.nome}`;
    desenhar();

    // em segundo plano: o que este navegador já agendou aqui
    carregarMeus().catch(() => {});
  } catch (erro) {
    console.error(erro);
    render(pagina, aviso(mensagemDeErro(erro)));
  }
}

/* ------------------------------------------------------------------ */
/* Desenho                                                             */
/* ------------------------------------------------------------------ */
function desenhar() {
  const { barbearia, servicos, confirmado } = estado;

  render(
    pagina,
    cabecalho(barbearia),
    confirmado
      ? telaConfirmado()
      : servicos.length === 0
        ? aviso(
            `${barbearia.nome} ainda não publicou os ${termos(barbearia).servicos}. ` +
              "Entre em contato diretamente para agendar.",
          )
        : el("div", {}, [
            passoServico(),
            estado.servico ? passoBarbeiro() : null,
            estado.servico && estado.barbeiro ? passoHorario() : null,
            estado.servico && estado.barbeiro && estado.horario !== null ? passoDados() : null,
          ]),
    meusAgendamentos(),
    assinaturaAgendia(),
  );
}

function cabecalho(b) {
  // Com logo, ela manda e o nome vira legenda; sem logo, o nome assume o
  // papel principal. O emblema só aparece quando não há nenhum dos dois
  // para mostrar — e é o do segmento: um poste de barbeiro na página de
  // uma clínica entrega que o sistema foi feito para outra coisa.
  const temLogo = Boolean(b.logoUrl);

  return el("header", { class: `vitrine-barbearia ${temLogo ? "com-logo" : ""}` }, [
    temLogo
      ? el("img", { src: b.logoUrl, alt: b.nome, class: "logo-barbearia" })
      : el("div", { class: "emblema", "aria-hidden": "true" }, termos(b).segmento.emblema),
    el("h1", {}, b.nome),
    b.endereco ? el("p", { class: "suave pequeno" }, b.endereco) : null,
    el("div", { class: "contatos" }, [
      b.telefone ? el("span", {}, telefone(b.telefone)) : null,
      b.instagram
        ? el("a", { href: `https://instagram.com/${b.instagram}`, target: "_blank", rel: "noreferrer noopener" },
            `@${b.instagram}`)
        : null,
    ]),
  ]);
}

function passo(numero, titulo, pronto, ...corpo) {
  return el("section", { class: "cartao passo" }, [
    el("h2", { class: "passo-titulo" }, [
      el("span", { class: `passo-numero ${pronto ? "pronto" : ""}` }, pronto ? "✓" : String(numero)),
      titulo,
    ]),
    ...corpo,
  ]);
}

/* --- 1. serviço --------------------------------------------------- */
function passoServico() {
  return passo(
    1,
    "Escolha o serviço",
    Boolean(estado.servico),
    ...estado.servicos.map((s) =>
      el(
        "button",
        {
          class: "opcao",
          type: "button",
          "aria-pressed": String(estado.servico?.id === s.id),
          onclick: () => {
            estado.servico = s;
            estado.barbeiro = null;
            estado.horario = null;
            estado.horarios = null;
            estado.erro = null;
            desenhar();
          },
        },
        [
          el("span", { class: "crescer" }, [
            el("span", { class: "nome truncar", style: { display: "block" } }, s.nome),
            el("span", { class: "detalhe truncar", style: { display: "block" } },
              s.descricao ?? duracao(s.duracaoMin)),
          ]),
          el("span", { style: { flexShrink: "0" } }, [
            el("span", { class: "preco", style: { display: "block" } }, moeda(s.precoCentavos)),
            el("span", { class: "detalhe", style: { display: "block", textAlign: "right" } },
              duracao(s.duracaoMin)),
          ]),
        ],
      ),
    ),
  );
}

/* --- 2. barbeiro -------------------------------------------------- */
function passoBarbeiro() {
  if (estado.barbeiros.length === 0) {
    return passo(2, `Com qual ${T().profissional}?`, false,
      el("p", { class: "fraco pequeno" }, `Nenhum ${T().profissional} disponível no momento.`));
  }

  return passo(
    2,
    `Com qual ${T().profissional}?`,
    Boolean(estado.barbeiro),
    el(
      "div",
      { class: "fichas fichas-barbeiro" },
      estado.barbeiros.map((b) =>
        el(
          "button",
          {
            class: "ficha ficha-com-foto",
            type: "button",
            "aria-pressed": String(estado.barbeiro?.id === b.id),
            onclick: () => {
              estado.barbeiro = b;
              estado.horario = null;
              estado.horarios = null;
              desenhar();
              carregarHorarios();
            },
          },
          [avatarBarbeiro(b, { tamanho: 52 }), el("span", { class: "truncar" }, b.nome)],
        ),
      ),
    ),
  );
}

/* --- 3. dia e horário --------------------------------------------- */
function passoHorario() {
  const hoje = hojeNaBarbearia(estado.barbearia.timezone);
  const dias = Array.from({ length: DIAS_VISIVEIS }, (_, i) => somarDias(hoje, i));

  return passo(
    3,
    "Escolha o dia e o horário",
    estado.horario !== null,

    el(
      "div",
      { class: "faixa-dias" },
      dias.map((d) =>
        el(
          "button",
          {
            class: "dia-botao",
            type: "button",
            "aria-pressed": String(d === estado.dia),
            onclick: () => {
              estado.dia = d;
              estado.horario = null;
              estado.horarios = null;
              desenhar();
              carregarHorarios();
            },
          },
          [
            el("span", {}, d === hoje ? "hoje" : diaSemanaCurto(d)),
            el("span", { class: "numero" }, String(dataDoDia(d).getDate())),
          ],
        ),
      ),
    ),

    estado.horarios === null
      ? el("p", { class: "fraco pequeno" }, "Buscando horários…")
      : estado.horarios.length === 0
        ? el("p", { class: "resumo suave centro" },
            "Sem horários livres neste dia. Tente outra data.")
        : el(
            "div",
            { class: "horarios" },
            estado.horarios.map((m) =>
              el(
                "button",
                {
                  class: "horario",
                  type: "button",
                  "aria-pressed": String(estado.horario === m),
                  onclick: () => {
                    estado.horario = m;
                    desenhar();
                  },
                },
                minutosParaHora(m),
              ),
            ),
          ),
  );
}

/**
 * Mesmo critério da regra do Firestore (`emailOk`): algo@algo.algo, sem
 * espaço. Validar aqui igual ao banco evita o pior caso — o botão
 * liberar e o servidor recusar, com uma mensagem que o cliente não
 * entende.
 */
function emailValido(v) {
  const t = String(v ?? "").trim();
  return t.length <= 120 && /^[^@ ]+@[^@ ]+[.][^@ ]+$/.test(t);
}

/* --- 4. dados e confirmação --------------------------------------- */
function passoDados() {
  const { servico, barbeiro, dia, horario } = estado;

  const campoNome = el("input", {
    class: "campo",
    id: "pub-nome",
    value: estado.nome,
    placeholder: "Como devemos te chamar",
    autocomplete: "name",
    oninput: (e) => {
      estado.nome = e.target.value;
      validar();
    },
  });

  const campoTel = el("input", {
    class: "campo",
    id: "pub-tel",
    type: "tel",
    value: estado.telefone,
    placeholder: "(79) 99999-0000",
    autocomplete: "tel",
    inputmode: "numeric",
    oninput: (e) => {
      e.target.value = mascararTelefone(e.target.value);
      estado.telefone = e.target.value;
      validar();
    },
  });

  const campoEmail = el("input", {
    class: "campo",
    id: "pub-email",
    type: "email",
    value: estado.email,
    placeholder: "voce@exemplo.com",
    autocomplete: "email",
    inputmode: "email",
    oninput: (e) => {
      estado.email = e.target.value;
      validar();
    },
  });

  const botao = el(
    "button",
    { class: "btn btn-primario btn-bloco", type: "button", disabled: true, onclick: confirmar },
    "Confirmar agendamento",
  );

  function validar() {
    botao.disabled =
      estado.nome.trim().length < 2 ||
      digitos(estado.telefone).length < 10 ||
      !emailValido(estado.email);
  }

  async function confirmar() {
    estado.erro = null;
    let idCriado = null;
    try {
      await comCarregamento(botao, "Confirmando…", async () => {
        const clienteId = await registrarClientePublico(
          estado.barbearia.id,
          estado.nome,
          estado.telefone,
          estado.email,
        );

        idCriado = await criarAgendamento(estado.barbearia.id, {
          dia,
          inicioMin: horario,
          barbeiro,
          servico,
          clienteId,
          clienteNome: estado.nome,
          clienteTelefone: estado.telefone,
          clienteEmail: estado.email,
          observacoes: estado.observacoes,
          origem: "publico",
        });
      });

      // guarda no navegador para o cliente poder cancelar depois
      if (idCriado) lembrar(estado.barbearia.slug, idCriado);

      estado.confirmado = { servico, barbeiro, dia, horario };
      desenhar();
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (erro) {
      console.error(erro);
      estado.erro = mensagemDeErro(erro);
      // alguém pode ter levado o horário no meio do caminho
      estado.horario = null;
      estado.horarios = null;
      desenhar();
      carregarHorarios();
      falha(estado.erro);
    }
  }

  const corpo = el("div", {}, [
    el("div", { class: "grupo" }, [
      el("label", { class: "rotulo", for: "pub-nome" }, "Nome completo"),
      campoNome,
    ]),
    el("div", { class: "grupo" }, [
      el("label", { class: "rotulo", for: "pub-tel" }, "WhatsApp"),
      campoTel,
    ]),
    el("div", { class: "grupo" }, [
      el("label", { class: "rotulo", for: "pub-email" }, "E-mail"),
      campoEmail,
      el("p", { class: "fraco pequeno", style: { marginTop: "6px" } },
        "É por aqui que você recebe a confirmação e o lembrete do horário."),
    ]),
    el("div", { class: "grupo" }, [
      el("label", { class: "rotulo", for: "pub-obs" }, "Alguma observação? (opcional)"),
      el("input", {
        class: "campo",
        id: "pub-obs",
        value: estado.observacoes,
        placeholder: "Máquina 2 nas laterais…",
        oninput: (e) => (estado.observacoes = e.target.value),
      }),
    ]),

    el("div", { class: "resumo" }, [
      el("p", { style: { fontWeight: "500" } }, servico.nome),
      el("p", { class: "suave" },
        `${barbeiro.nome} · ${dataLonga(dia)} às ${minutosParaHora(horario)} · ${moeda(servico.precoCentavos)}`),
    ]),

    estado.erro ? el("div", { class: "aviso aviso-erro", style: { marginTop: "12px" } }, estado.erro) : null,

    el("div", { style: { marginTop: "14px" } }, botao),
  ]);

  validar();
  return passo(4, "Seus dados", false, corpo);
}

/* --- confirmação -------------------------------------------------- */
function telaConfirmado() {
  const { servico, barbeiro, dia, horario } = estado.confirmado;
  const wpp = digitos(estado.barbearia.whatsapp ?? estado.barbearia.telefone ?? "");

  return el("section", { class: "cartao cartao-corpo centro" }, [
    el("div", { style: { fontSize: "2.5rem" }, "aria-hidden": "true" }, "✅"),
    el("h2", { style: { marginTop: "8px" } }, "Horário reservado!"),
    el("p", { class: "suave pequeno", style: { marginTop: "4px" } },
      "Guarde os detalhes abaixo e chegue com alguns minutos de antecedência."),

    el("dl", { class: "recibo" }, [
      linhaRecibo("Serviço", servico.nome),
      linhaRecibo("Barbeiro", barbeiro.nome),
      linhaRecibo("Data", dataLonga(dia)),
      linhaRecibo("Horário", minutosParaHora(horario)),
      linhaRecibo("Valor", moeda(servico.precoCentavos)),
      linhaRecibo("Em nome de", estado.nome),
    ]),

    el("div", { class: "pilha", style: { marginTop: "18px" } }, [
      wpp
        ? el("a", {
            class: "btn btn-secundario",
            href: `https://wa.me/55${wpp}`,
            target: "_blank",
            rel: "noreferrer noopener",
          }, "Falar no WhatsApp")
        : null,
      el(
        "button",
        {
          class: "btn btn-fantasma",
          type: "button",
          onclick: () => {
            Object.assign(estado, {
              servico: null,
              barbeiro: null,
              horario: null,
              horarios: null,
              observacoes: "",
              erro: null,
              confirmado: null,
            });
            desenhar();
          },
        },
        "Fazer outro agendamento",
      ),
    ]),
  ]);
}

function linhaRecibo(rotulo, valor) {
  return el("div", {}, [el("dt", {}, rotulo), el("dd", {}, valor)]);
}

/* ------------------------------------------------------------------ */
/* Meus agendamentos e cancelamento                                    */
/* ------------------------------------------------------------------ */
function meusAgendamentos() {
  if (!estado.barbearia || estado.meus.length === 0) return null;

  return el("section", { class: "cartao passo", style: { marginTop: "24px" } }, [
    el("h2", { class: "passo-titulo" }, [
      el("span", { class: "passo-numero pronto" }, "✓"),
      "Seus horários marcados",
    ]),

    ...estado.meus.map((a) => cartaoMeuAgendamento(a)),

    el("p", { class: "fraco pequeno", style: { marginTop: "10px" } },
      `O cancelamento deve ser feito com no mínimo ${HORAS_MINIMAS_CANCELAMENTO} horas ` +
        "de antecedência. Depois disso, fale direto com o estabelecimento."),
  ]);
}

function cartaoMeuAgendamento(a) {
  const veredito = podeCancelar(a, estado.barbearia.timezone);

  return el("div", { class: "resumo", style: { marginBottom: "8px" } }, [
    el("div", { class: "entre" }, [
      el("div", { class: "crescer" }, [
        el("p", { style: { fontWeight: "500" } }, a.servicoNome),
        el("p", { class: "suave pequeno" },
          `${a.barbeiroNome} · ${dataLonga(a.dia)} às ${minutosParaHora(a.inicioMin)}`),
      ]),
    ]),

    el(
      "button",
      {
        class: `btn ${veredito.pode ? "btn-perigo" : "btn-secundario"} btn-bloco btn-mini`,
        type: "button",
        style: { marginTop: "10px" },
        disabled: !veredito.pode,
        title: veredito.pode
          ? `Cancelamento permitido até ${HORAS_MINIMAS_CANCELAMENTO} horas antes`
          : veredito.motivo,
        onclick: (e) => cancelar(a, e.target),
      },
      veredito.pode ? "Cancelar agendamento" : "Fora do prazo de cancelamento",
    ),

    // A regra aparece SEMPRE, e não só quando o botão é recusado: o
    // cliente precisa saber do limite antes de contar com ele.
    el("p", { class: "fraco pequeno", style: { marginTop: "6px" } },
      veredito.pode
        ? `Cancelamento com no mínimo ${HORAS_MINIMAS_CANCELAMENTO} horas de antecedência.`
        : veredito.motivo),
  ]);
}

async function cancelar(agendamento, botao) {
  const certeza = window.confirm(
    `Cancelar ${agendamento.servicoNome} de ${dataLonga(agendamento.dia)} às ` +
      `${minutosParaHora(agendamento.inicioMin)}?`,
  );
  if (!certeza) return;

  try {
    await comCarregamento(botao, "Cancelando…", () =>
      cancelarPeloCliente(estado.barbearia.id, agendamento, estado.barbearia.timezone),
    );
    esquecer(estado.barbearia.slug, agendamento.id);
    estado.meus = estado.meus.filter((x) => x.id !== agendamento.id);
    estado.horarios = null;
    desenhar();
    carregarHorarios();
  } catch (erro) {
    falha(mensagemDeErro(erro));
  }
}

/** Relê no banco o que este navegador agendou, para pegar mudanças. */
async function carregarMeus() {
  const ids = idsGuardados(estado.barbearia.slug);
  if (ids.length === 0) return;

  const encontrados = await Promise.all(
    ids.map((id) =>
      obterAgendamento(estado.barbearia.id, id).catch(() => null),
    ),
  );

  const hoje = hojeNaBarbearia(estado.barbearia.timezone);
  estado.meus = encontrados
    .filter((a) => a && ["agendado", "confirmado"].includes(a.status) && a.dia >= hoje)
    .sort((a, b) => String(a.dia).localeCompare(String(b.dia)) || a.inicioMin - b.inicioMin);

  // o que já passou ou foi cancelado sai da memória do navegador
  for (const id of ids) {
    if (!estado.meus.some((a) => a.id === id)) esquecer(estado.barbearia.slug, id);
  }

  desenhar();
}

/* ------------------------------------------------------------------ */
/* Horários livres                                                     */
/* ------------------------------------------------------------------ */
let buscaAtual = 0;

async function carregarHorarios() {
  const { barbearia, barbeiro, servico, dia } = estado;
  if (!barbeiro || !servico) return;

  const minhaBusca = ++buscaAtual;

  try {
    const [reservas, bloqueios] = await Promise.all([
      listarReservasDoDia(barbearia.id, dia),
      listarBloqueiosDoDia(barbearia.id, dia),
    ]);

    // o cliente pode ter trocado de dia enquanto isto carregava
    if (minhaBusca !== buscaAtual) return;

    estado.horarios = horariosDisponiveis({
      barbearia,
      dia,
      barbeiroId: barbeiro.id,
      duracaoMin: servico.duracaoMin,
      reservas,
      bloqueios,
    });
  } catch (erro) {
    console.error(erro);
    if (minhaBusca !== buscaAtual) return;
    estado.horarios = [];
    estado.erro = mensagemDeErro(erro);
  }

  desenhar();
}

/* ------------------------------------------------------------------ */
function aviso(texto) {
  return el("div", { class: "cartao cartao-corpo centro" }, [
    el("p", { class: "suave" }, texto),
  ]);
}
