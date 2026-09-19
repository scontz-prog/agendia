/**
 * ENTRADA DA BARBEARIA.
 *
 * Esta porta é só de quem opera uma barbearia. A administração da
 * plataforma tem a sua, em `admin-entrar.html`. Separar as duas não é
 * capricho visual: são públicos diferentes, com expectativas diferentes,
 * e uma tela única obrigaria os dois a se reconhecerem no meio de opções
 * que não lhes dizem respeito.
 *
 * Login, criação de conta e cadastro da barbearia ficam juntos aqui
 * porque são um fluxo só — quem cria a conta precisa cadastrar a
 * barbearia em seguida, e quem fechou o navegador no meio volta direto
 * para o passo que faltava.
 */

import { $, el, render, dadosDoForm } from "./lib/dom.js";
import { falha, mensagemDeErro, comCarregamento, toast } from "./lib/ui.js";
import { paraSlug, mascararTelefone } from "./lib/formato.js";
import {
  configPendente,
  modoLocal,
  CONTA_DEMO,
  resetarDados,
} from "./config/firebase.js";
import {
  entrar,
  cadastrar,
  recuperarSenha,
  observarSessao,
  contexto,
  sair,
} from "./dados/sessao.js";
import { criarBarbearia } from "./dados/barbearias.js";
import { souAdministrador } from "./dados/admin.js";
import {
  LISTA_SEGMENTOS,
  SEGMENTO_PADRAO,
  termos,
  flexoes,
  maiuscula,
} from "./config/segmentos.js";

const conteudo = $("#conteudo");
const rodape = $("#rodape");
const extra = $("#extra");

/* ------------------------------------------------------------------ */
/* Roteamento simples pelo hash                                        */
/* ------------------------------------------------------------------ */
let jaRedirecionou = false;

observarSessao(async (ctx) => {
  if (ctx?.perfil && ctx?.barbearia) {
    if (jaRedirecionou) return;
    jaRedirecionou = true;
    location.replace("painel.html");
    return;
  }

  if (ctx?.usuario) {
    // Uma conta sem barbearia pode ser duas coisas: o administrador da
    // plataforma, ou alguém que parou no meio do cadastro. Perguntar ao
    // banco antes evita apresentar ao administrador um formulário de
    // "cadastre sua barbearia" — e, agora que as portas são separadas,
    // evita também mandá-lo para cá em silêncio.
    if (await souAdministrador()) {
      telaPortaErrada();
      return;
    }
    telaBarbearia(ctx.usuario);
    return;
  }

  desenharPorHash();
});

window.addEventListener("hashchange", () => {
  if (!contexto()?.usuario) desenharPorHash();
});

function desenharPorHash() {
  if (location.hash === "#criar") telaCriarConta();
  else telaLogin();
}

/* ------------------------------------------------------------------ */
/* Aviso do modo atual                                                 */
/* ------------------------------------------------------------------ */
function avisoModo() {
  if (modoLocal) return null;
  if (!configPendente) return null;
  return el("div", { class: "aviso aviso-info", style: { marginBottom: "16px" } }, [
    "Antes de usar, preencha ",
    el("code", {}, "js/config/firebase-config.js"),
    " com os dados do seu projeto Firebase. O passo a passo está no README.",
  ]);
}

/**
 * Conta de administração que entrou pela porta da barbearia.
 * Em vez de redirecionar calado — o que faria a pessoa duvidar de onde
 * está — a tela diz o que aconteceu e oferece o caminho certo.
 */
function telaPortaErrada() {
  render(
    conteudo,
    el("div", { class: "centro" }, [
      el("div", { style: { fontSize: "1.75rem" }, "aria-hidden": "true" }, "🔑"),
      el("h1", { style: { marginTop: "8px", fontSize: "1.0625rem" } },
        "Esta é uma conta de administração"),
      el("p", { class: "suave pequeno", style: { marginTop: "6px" } },
        "Você entrou pela área dos estabelecimentos. A administração da plataforma tem acesso próprio."),
      el("a", { class: "btn btn-primario btn-bloco", href: "admin.html", style: { marginTop: "16px" } },
        "Ir para a administração"),
      el(
        "button",
        {
          class: "btn btn-fantasma btn-bloco btn-mini",
          type: "button",
          style: { marginTop: "6px" },
          onclick: async () => {
            await sair();
            location.reload();
          },
        },
        "Sair e entrar com outra conta",
      ),
    ]),
  );
  render(extra);
  render(rodape, "");
}

/**
 * Atalho da demonstração. Só existe no modo local — é o que permite
 * avaliar o sistema inteiro sem criar conta em lugar nenhum.
 */
function painelDemo() {
  if (!modoLocal || !CONTA_DEMO) return null;

  return el("div", { class: "cartao cartao-corpo", style: { marginTop: "16px" } }, [
    el("p", { class: "rotulo", style: { marginBottom: "8px" } }, "Modo local — demonstração"),
    el("p", { class: "suave pequeno" },
      "Os dados ficam só neste navegador. Já existem contas montadas em segmentos diferentes, com agenda, clientes e histórico do mês."),

    el(
      "button",
      {
        class: "btn btn-primario btn-bloco",
        type: "button",
        style: { marginTop: "12px" },
        onclick: async (e) => {
          try {
            await comCarregamento(e.target, "Entrando…", () =>
              entrar(CONTA_DEMO.email, CONTA_DEMO.senha),
            );
          } catch (erro) {
            falha(mensagemDeErro(erro));
          }
        },
      },
      "Entrar na conta de demonstração",
    ),

    el("p", { class: "fraco pequeno centro", style: { marginTop: "8px" } },
      `${CONTA_DEMO.email} · senha ${CONTA_DEMO.senha}`),

    // O atalho do administrador saiu daqui de propósito: ele agora mora
    // na porta dele, em admin-entrar.html.

    el(
      "button",
      {
        class: "btn btn-fantasma btn-bloco btn-mini",
        type: "button",
        style: { marginTop: "10px" },
        onclick: () => {
          resetarDados();
          toast("Dados de demonstração recriados.", "sucesso");
        },
      },
      "Recriar dados de demonstração",
    ),
  ]);
}

/* ------------------------------------------------------------------ */
/* Login                                                               */
/* ------------------------------------------------------------------ */
function telaLogin() {
  const erro = el("div", { class: "aviso aviso-erro oculto" });

  const form = el(
    "form",
    {
      onsubmit: async (e) => {
        e.preventDefault();
        erro.classList.add("oculto");
        const dados = dadosDoForm(form);
        const botao = form.querySelector('button[type="submit"]');

        try {
          await comCarregamento(botao, "Entrando…", () =>
            entrar(dados.email, dados.senha),
          );
        } catch (falhou) {
          erro.textContent = mensagemDeErro(falhou);
          erro.classList.remove("oculto");
        }
      },
    },
    [
      campo({ id: "email", rotulo: "E-mail", tipo: "email", placeholder: "voce@suaempresa.com", autocomplete: "email" }),
      campo({ id: "senha", rotulo: "Senha", tipo: "password", placeholder: "••••••••", autocomplete: "current-password" }),
      erro,
      el(
        "button",
        { class: "btn btn-primario btn-bloco", type: "submit", style: { marginTop: "16px" } },
        "Entrar",
      ),
      el(
        "button",
        {
          class: "btn btn-fantasma btn-bloco",
          type: "button",
          style: { marginTop: "6px" },
          onclick: () => pedirRecuperacao(form.querySelector("#email").value),
        },
        "Esqueci minha senha",
      ),
    ],
  );

  render(
    conteudo,
    avisoModo(),
    el("h1", { style: { fontSize: "1.125rem" } }, "Entrar no painel"),
    el("p", { class: "suave pequeno", style: { margin: "4px 0 20px" } },
      "Acesse a agenda e a gestão do seu negócio."),
    form,
  );

  render(extra, painelDemo());
  render(rodape, "Ainda não tem conta? ", el("a", { href: "#criar" }, "Cadastre sua empresa"));
}

async function pedirRecuperacao(email) {
  if (!email) {
    falha("Digite seu e-mail no campo acima e clique de novo.");
    return;
  }
  try {
    await recuperarSenha(email);
    toast("Enviamos um link de redefinição para o seu e-mail.", "sucesso", 6000);
  } catch (erro) {
    falha(mensagemDeErro(erro));
  }
}

/* ------------------------------------------------------------------ */
/* Criar conta                                                         */
/* ------------------------------------------------------------------ */
function telaCriarConta() {
  const erro = el("div", { class: "aviso aviso-erro oculto" });

  const form = el(
    "form",
    {
      onsubmit: async (e) => {
        e.preventDefault();
        erro.classList.add("oculto");
        const dados = dadosDoForm(form);
        const botao = form.querySelector('button[type="submit"]');

        if (dados.senha.length < 6) {
          erro.textContent = "A senha precisa ter ao menos 6 caracteres.";
          erro.classList.remove("oculto");
          return;
        }

        try {
          await comCarregamento(botao, "Criando…", () =>
            cadastrar(dados.nome, dados.email, dados.senha),
          );
          // observarSessao leva para a tela da barbearia
        } catch (falhou) {
          erro.textContent = mensagemDeErro(falhou);
          erro.classList.remove("oculto");
        }
      },
    },
    [
      campo({ id: "nome", rotulo: "Seu nome", placeholder: "João Silva", autocomplete: "name" }),
      campo({ id: "email", rotulo: "E-mail", tipo: "email", placeholder: "voce@suaempresa.com", autocomplete: "email" }),
      campo({
        id: "senha",
        rotulo: "Senha",
        tipo: "password",
        placeholder: "mínimo 6 caracteres",
        autocomplete: "new-password",
        minlength: 6,
      }),
      erro,
      el(
        "button",
        { class: "btn btn-primario btn-bloco", type: "submit", style: { marginTop: "16px" } },
        "Criar conta",
      ),
    ],
  );

  render(
    conteudo,
    avisoModo(),
    el("h1", { style: { fontSize: "1.125rem" } }, "Criar conta"),
    el("p", { class: "suave pequeno", style: { margin: "4px 0 20px" } },
      "No próximo passo você escolhe o segmento e cadastra os dados do seu negócio."),
    form,
  );

  render(extra);
  render(rodape, "Já tem conta? ", el("a", { href: "#" }, "Entrar"));
}

/* ------------------------------------------------------------------ */
/* Cadastro da barbearia (onboarding)                                  */
/* ------------------------------------------------------------------ */
/**
 * O segmento é perguntado AQUI, e não depois em Configurações.
 *
 * Antes toda conta nascia como "barbearia" e quem abrisse um consultório
 * caía num painel escrito "Barbeiros" e "Cortes", tendo que descobrir
 * sozinho onde se corrige isso — logo no primeiro minuto de uso, que é
 * quando o sistema menos pode parecer errado. Perguntar custa um campo, e
 * o formulário inteiro já responde na escolha.
 */
function telaBarbearia(usuario) {
  const erro = el("div", { class: "aviso aviso-erro oculto" });
  const previa = el("p", { class: "fraco pequeno", style: { marginTop: "6px" } });
  const titulo = el("h1", { style: { fontSize: "1.125rem" } });
  const subtitulo = el("p", { class: "suave pequeno", style: { margin: "4px 0 20px" } });

  /** Segmento marcado no seletor neste instante. */
  const escolhido = () => form.querySelector("#segmento").value;

  function atualizarPrevia() {
    const T = termos(escolhido());
    const nome = form.querySelector("#nome").value;
    const slug = form.querySelector("#slug").value;
    const exemplo = paraSlug(flexoes(escolhido()).seu);
    render(
      previa,
      `Seus ${T.clientes} vão agendar em `,
      el("span", { class: "destaque", style: { fontFamily: "ui-monospace, monospace" } },
        `agendar.html?b=${paraSlug(slug || nome) || exemplo}`),
    );
  }

  /** Reescreve os rótulos da tela na língua do segmento escolhido. */
  function aplicarSegmento() {
    const T = termos(escolhido());
    const f = flexoes(escolhido());

    titulo.textContent = `Cadastre ${f.seu}`;
    subtitulo.textContent =
      `É o último passo. Depois você cadastra ${T.profissionais} e ${T.servicos}.`;
    form.querySelector('label[for="nome"]').textContent = `Nome ${f.de}`;
    form.querySelector("#nome").placeholder = `${maiuscula(T.estabelecimento)} Alpha`;
    form.querySelector('button[type="submit"]').textContent = `Criar ${T.estabelecimento}`;
    atualizarPrevia();
  }

  const form = el(
    "form",
    {
      onsubmit: async (e) => {
        e.preventDefault();
        erro.classList.add("oculto");
        const dados = dadosDoForm(form);
        const botao = form.querySelector('button[type="submit"]');

        try {
          await comCarregamento(botao, "Criando…", () => criarBarbearia(usuario, dados));
          location.replace("painel.html");
        } catch (falhou) {
          erro.textContent = mensagemDeErro(falhou);
          erro.classList.remove("oculto");
        }
      },
    },
    [
      el("div", { class: "grupo" }, [
        el("label", { class: "rotulo", for: "segmento" }, "Tipo de negócio"),
        el(
          "select",
          { class: "campo", id: "segmento", name: "segmento", onchange: aplicarSegmento },
          LISTA_SEGMENTOS.map((s) =>
            el(
              "option",
              { value: s.id, selected: s.id === SEGMENTO_PADRAO },
              `${s.emblema}  ${s.nome}`,
            ),
          ),
        ),
        el("p", { class: "fraco pequeno", style: { marginTop: "6px" } },
          "Define como o sistema chama as coisas. Pode ser mudado depois em Configurações."),
      ]),
      campo({
        id: "nome",
        rotulo: "Nome",
        minlength: 3,
        oninput: atualizarPrevia,
      }),
      el("div", { class: "grupo" }, [
        el("label", { class: "rotulo", for: "slug" }, "Endereço do seu link"),
        el("input", {
          class: "campo",
          id: "slug",
          name: "slug",
          placeholder: "deixe em branco para usar o nome",
          oninput: atualizarPrevia,
        }),
        previa,
      ]),
      campo({
        id: "telefone",
        rotulo: "Telefone / WhatsApp",
        tipo: "tel",
        placeholder: "(79) 99999-0000",
        obrigatorio: false,
        mascara: mascararTelefone,
      }),
      erro,
      el(
        "button",
        { class: "btn btn-primario btn-bloco", type: "submit", style: { marginTop: "16px" } },
      ),
    ],
  );

  render(conteudo, titulo, subtitulo, form);

  aplicarSegmento();
  render(extra);
  render(rodape, "");
}

/* ------------------------------------------------------------------ */
/* Campo de formulário                                                 */
/* ------------------------------------------------------------------ */
function campo({
  id,
  rotulo,
  tipo = "text",
  placeholder = "",
  autocomplete,
  minlength,
  obrigatorio = true,
  oninput,
  mascara,
}) {
  const input = el("input", {
    class: "campo",
    id,
    name: id,
    type: tipo,
    placeholder,
    autocomplete,
    minlength,
    required: obrigatorio,
    oninput: (e) => {
      if (mascara) e.target.value = mascara(e.target.value);
      oninput?.(e);
    },
  });

  return el("div", { class: "grupo" }, [
    el("label", { class: "rotulo", for: id }, rotulo),
    input,
  ]);
}
