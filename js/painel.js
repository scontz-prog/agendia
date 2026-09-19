/** Casca do painel: sessão, navegação e roteamento das telas. */

import { $, $$, render, el } from "./lib/dom.js";
import { registrar, iniciarRoteador, rotaAtual } from "./lib/router.js";
import { toast, falha, abrirModal } from "./lib/ui.js";
import { observarSessao, sair, contexto } from "./dados/sessao.js";
import { linkPublico } from "./dados/barbearias.js";
import { marcaAgendia, simboloAgendia, marcaBarbearia } from "./lib/marca.js";
import { termos, maiuscula } from "./config/segmentos.js";

import { telaDashboard } from "./paginas/dashboard.js";
import { telaAgenda } from "./paginas/agenda.js";
import { telaClientes } from "./paginas/clientes.js";
import { telaMensagens } from "./paginas/mensagens.js";
import { telaServicos } from "./paginas/servicos.js";
import { telaBarbeiros } from "./paginas/barbeiros.js";
import { telaConfiguracoes } from "./paginas/configuracoes.js";
import { telaEquipe } from "./paginas/equipe.js";

const conteudo = $("#conteudo");
let iniciado = false;

/* ------------------------------------------------------------------ */
/* Sessão                                                              */
/* ------------------------------------------------------------------ */
observarSessao((ctx) => {
  if (!ctx?.usuario) {
    location.replace("entrar.html");
    return;
  }

  // Falha ao carregar (rede, permissão) NÃO é "conta sem estabelecimento".
  // Antes os dois casos caíam no mesmo redirecionamento para entrar.html,
  // que devolvia para o painel, que falhava de novo — o painel piscava e
  // sumia. Agora o erro aparece e a pessoa decide tentar de novo.
  if (ctx.erro) {
    telaFalhaAoCarregar(ctx.erro);
    return;
  }

  if (!ctx.perfil || !ctx.barbearia) {
    // conta existe mas o estabelecimento não foi cadastrado
    location.replace("entrar.html");
    return;
  }

  // Sem aprovação da plataforma não há painel nenhum — nem para o dono,
  // nem para a equipe. As regras do Firestore também recusam qualquer
  // gravação dessa conta; esta tela é para a pessoa entender o porquê.
  if ((ctx.barbearia.aprovacao ?? "aprovada") !== "aprovada") {
    telaAguardandoAprovacao(ctx.barbearia);
    return;
  }

  if (!iniciado) {
    iniciado = true;
    montar(ctx);
  }
});

/** Esconde a moldura do painel: sem aprovação, não há menu a oferecer. */
function telaSemPainel(...filhos) {
  document.querySelector(".app")?.classList.add("sem-nav");
  document.querySelector(".app-lateral")?.classList.add("oculto");
  document.querySelector(".app-topo .topo-dir #btn-link")?.classList.add("oculto");
  render(
    conteudo,
    el("div", { class: "cartao cartao-corpo tela-espera" }, [
      ...filhos,
      el("div", { class: "linha", style: { justifyContent: "center", marginTop: "18px", flexWrap: "wrap" } }, [
        el("button", { class: "btn btn-primario", type: "button", onclick: () => location.reload() },
          "Verificar novamente"),
        el("button", {
          class: "btn btn-secundario",
          type: "button",
          onclick: async () => {
            await sair();
            location.replace("entrar.html");
          },
        }, "Sair"),
      ]),
    ]),
  );
}

function telaAguardandoAprovacao(barbearia) {
  document.title = `${barbearia.nome} — Agendia`;
  const rejeitada = barbearia.aprovacao === "rejeitada";

  telaSemPainel(
    el("div", { style: { fontSize: "2.25rem" }, "aria-hidden": "true" }, rejeitada ? "⛔" : "⏳"),
    el("h1", { style: { marginTop: "10px", fontSize: "1.25rem" } },
      rejeitada ? "Cadastro não aprovado" : "Cadastro em análise"),
    el("p", { class: "suave", style: { marginTop: "8px" } },
      rejeitada
        ? `O cadastro de ${barbearia.nome} não foi aprovado pela plataforma.`
        : `Recebemos o cadastro de ${barbearia.nome}. O acesso ao painel é liberado assim que a plataforma aprovar.`),
    rejeitada && barbearia.motivoRejeicao
      ? el("p", { class: "pequeno", style: { marginTop: "8px" } }, `Motivo: ${barbearia.motivoRejeicao}`)
      : null,
    el("p", { class: "fraco pequeno", style: { marginTop: "10px" } },
      rejeitada
        ? "Fale com a plataforma se quiser rever a decisão."
        : "Não é preciso fazer nada: depois da aprovação, clique em “Verificar novamente” ou entre de novo."),
  );
}

function telaFalhaAoCarregar(erro) {
  console.error(erro);
  telaSemPainel(
    el("div", { style: { fontSize: "2.25rem" }, "aria-hidden": "true" }, "⚠️"),
    el("h1", { style: { marginTop: "10px", fontSize: "1.25rem" } }, "Não foi possível abrir o painel"),
    el("p", { class: "suave", style: { marginTop: "8px" } },
      "Houve uma falha ao carregar os dados da conta. Verifique a conexão e tente de novo."),
    el("p", { class: "fraco pequeno", style: { marginTop: "8px" } },
      String(erro?.code ?? erro?.message ?? "")),
  );
}

function montar(ctx) {
  const { barbearia, perfil } = ctx;

  // Marca da plataforma no canto superior esquerdo, discreta: quem
  // trabalha nesta tela o dia inteiro é a barbearia, não a Agendia.
  // No desktop cabe a marca completa na lateral; no celular, onde o
  // espaço é do nome da barbearia, entra só o desenho.
  render($("#marca-lateral"), marcaAgendia({ altura: 36, href: "index.html" }));
  render($("#topo-marca"), simboloAgendia({ altura: 34, href: "index.html" }));

  // marca da barbearia: centralizada na barra superior
  render(
    $("#topo-barbearia"),
    marcaBarbearia(barbearia, { altura: 40 }),
    barbearia.logoUrl ? null : el("span", { class: "sub" }, "Painel da barbearia"),
  );

  $("#lateral-nome").textContent = barbearia.nome;
  $("#lateral-usuario").textContent = `${perfil.nome} · ${perfil.papel}`;
  document.title = `${barbearia.nome} — Agendia`;

  rotularNavegacao(barbearia);
  montarBotaoLink(barbearia.slug);
  avisarSeSuspensa(barbearia);

  for (const botao of $$("[data-sair]")) {
    botao.addEventListener("click", async () => {
      try {
        await sair();
        location.replace("entrar.html");
      } catch (erro) {
        falha("Não foi possível sair. Tente de novo.");
        console.error(erro);
      }
    });
  }

  // O barbeiro tem uma tela só: a agenda dele. As demais rotas nem são
  // registradas — esconder o item de menu e deixar a rota funcionando
  // seria proteção de fachada, que cai com quem digitar o endereço.
  const soAgenda = perfil.papel === "barbeiro";

  registrar("/agenda", telaAgenda);

  if (soAgenda) {
    registrar("/", telaAgenda);
  } else {
    registrar("/", telaDashboard);
    registrar("/clientes", telaClientes);
    registrar("/mensagens", telaMensagens);
    registrar("/servicos", telaServicos);
    registrar("/barbeiros", telaBarbeiros);
    registrar("/config", telaConfiguracoes);
    if (perfil.papel === "dono") registrar("/equipe", telaEquipe);
  }

  ajustarNavegacao(perfil);
  iniciarRoteador({ alvo: conteudo, padrao: soAgenda ? "/agenda" : "/", aoNavegar: marcarNavegacao });
}

/**
 * Tira do menu o que o papel não alcança. A rota já não existe; isto é
 * só para a pessoa não ver portas que não abrem.
 */
function ajustarNavegacao(perfil) {
  const permitido = {
    dono: ["/", "/agenda", "/clientes", "/mensagens", "/servicos", "/barbeiros", "/config", "/equipe"],
    gerente: ["/", "/agenda", "/clientes", "/mensagens", "/servicos", "/barbeiros", "/config"],
    barbeiro: ["/agenda"],
  }[perfil.papel] ?? ["/agenda"];

  for (const link of $$("[data-nav] a")) {
    const destino = link.getAttribute("href").replace(/^#/, "");
    link.classList.toggle("oculto", !permitido.includes(destino));
  }

  // Com uma tela só, a barra inferior vira um botão solitário ocupando a
  // largura inteira — ruído puro. Melhor não existir.
  document.querySelector(".app")?.classList.toggle("sem-nav", permitido.length <= 1);
}

/* ------------------------------------------------------------------ */
/* Vocabulário do segmento                                             */
/*                                                                     */
/* Os rótulos ficam no HTML só como texto de partida. Quem manda é o    */
/* segmento da conta: numa clínica o menu diz "Especialistas" e         */
/* "Pacientes" sem que nada além disto mude.                           */
/* ------------------------------------------------------------------ */
function rotularNavegacao(barbearia) {
  const T = termos(barbearia);

  const rotulos = {
    "#/clientes": { completo: maiuscula(T.clientes), curto: maiuscula(T.clientes) },
    "#/servicos": {
      completo: maiuscula(T.servicos),
      curto: maiuscula(T.servicos),
      icone: T.iconeServicos,
    },
    "#/barbeiros": {
      completo: maiuscula(T.profissionais),
      curto: maiuscula(T.profissionais),
      icone: T.iconeProfissionais,
    },
  };

  for (const link of $$("[data-nav] a")) {
    const alvo = rotulos[link.getAttribute("href")];
    if (!alvo) continue;
    const texto = link.closest(".app-nav") ? alvo.curto : alvo.completo;
    // preserva o ícone, que é o primeiro filho
    const icone = link.querySelector(".icone");
    if (alvo.icone && icone) icone.textContent = alvo.icone;
    link.replaceChildren(icone, document.createTextNode(` ${texto}`));
  }
}

/* ------------------------------------------------------------------ */
/* Conta suspensa                                                      */
/*                                                                     */
/* O aviso fica FORA de #conteudo de propósito: o roteador troca o      */
/* conteúdo a cada navegação, e um aviso desses não pode sumir só       */
/* porque o usuário mudou de tela.                                     */
/* ------------------------------------------------------------------ */
function avisarSeSuspensa(barbearia) {
  const aprovacao = barbearia.aprovacao ?? "aprovada";
  const suspensa = barbearia.ativa === false;
  if (!suspensa && aprovacao === "aprovada") return;

  const estilo = {
    margin: "16px 16px 0",
    position: "sticky",
    top: "56px",
    zIndex: "20",
  };

  // Suspensa é o aviso mais urgente: a conta já funcionava e parou.
  // Pendente e rejeitada são estados de quem ainda não começou.
  const aviso = suspensa
    ? el("div", { class: "aviso aviso-erro", style: estilo }, [
        el("strong", {}, "Conta suspensa. "),
        "Seu link de agendamento saiu do ar e novos atendimentos não podem ser " +
          "lançados. O histórico continua aqui, intacto — fale com a plataforma para reativar.",
      ])
    : aprovacao === "pendente"
      ? el("div", { class: "aviso aviso-info", style: estilo }, [
          el("strong", {}, "Cadastro em análise. "),
          "Você já pode montar tudo — profissionais, serviços e horários. " +
            "O link de agendamento entra no ar assim que a plataforma aprovar o cadastro.",
        ])
      : el("div", { class: "aviso aviso-erro", style: estilo }, [
          el("strong", {}, "Cadastro não aprovado. "),
          barbearia.motivoRejeicao
            ? `Motivo: ${barbearia.motivoRejeicao} `
            : "",
          "O link de agendamento não está no ar. Fale com a plataforma para rever a decisão.",
        ]);

  conteudo.parentElement.insertBefore(aviso, conteudo);
}

/* ------------------------------------------------------------------ */
/* Navegação                                                           */
/* ------------------------------------------------------------------ */
function marcarNavegacao(caminho) {
  for (const link of $$("[data-nav] a")) {
    const destino = link.getAttribute("href").replace(/^#/, "");
    const ativo =
      destino === "/" ? caminho === "/" : caminho.startsWith(destino);
    if (ativo) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  }
}

/* ------------------------------------------------------------------ */
/* Link público                                                        */
/* ------------------------------------------------------------------ */
/**
 * O link de agendamento saiu do rodapé da coluna lateral e virou botão na
 * barra superior. Motivo: no celular não havia coluna lateral, então o
 * link — que é a razão de a barbearia divulgar o sistema — só existia no
 * desktop. Agora está no mesmo canto em qualquer largura.
 */
function montarBotaoLink(slug) {
  const url = linkPublico(slug);
  const botao = $("#btn-link");
  if (!botao) return;

  botao.addEventListener("click", () => abrirModalLink(url, slug));
}

function abrirModalLink(url, slug) {
  abrirModal("Link de agendamento", (fechar) =>
    el("div", {}, [
      el("p", { class: "suave pequeno" },
        "Cole no Instagram e no WhatsApp. É por aqui que seus clientes marcam horário."),
      el("p", { class: "resumo num", style: { marginTop: "12px", overflowWrap: "anywhere" } }, url),
      el("div", { class: "modal-acoes" }, [
        el(
          "button",
          {
            class: "btn btn-primario",
            type: "button",
            onclick: async (e) => {
              try {
                await navigator.clipboard.writeText(url);
                const antes = e.target.textContent;
                e.target.textContent = "Copiado!";
                setTimeout(() => (e.target.textContent = antes), 1800);
              } catch {
                // a área de transferência exige HTTPS ou localhost;
                // fora disso resta mostrar o endereço para copiar à mão
                toast("Copie o endereço acima manualmente.", "info", 6000);
              }
            },
          },
          "Copiar link",
        ),
        el("a", { class: "btn btn-secundario", href: url, target: "_blank", rel: "noreferrer" },
          "Abrir"),
        el("button", { class: "btn btn-fantasma", type: "button", onclick: fechar }, "Fechar"),
      ]),
    ]),
  );
}
