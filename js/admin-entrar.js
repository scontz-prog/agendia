/**
 * ENTRADA DA ADMINISTRAÇÃO DA PLATAFORMA.
 *
 * Porta separada da entrada das barbearias, e deliberadamente enxuta:
 * não tem "criar conta" nem "cadastre sua barbearia". A permissão de
 * administrador é o documento `admins/{uid}`, criado à mão no console do
 * Firebase — não existe caminho para alguém virar administrador sozinho,
 * e uma tela de cadastro aqui só daria a impressão contrária.
 *
 * A separação é de interface, não de segurança: quem garante que um dono
 * de barbearia não leia dados da plataforma é o firestore.rules, não o
 * fato de haver duas páginas de login.
 */

import { $, el, render, dadosDoForm } from "./lib/dom.js";
import { falha, mensagemDeErro, comCarregamento, toast } from "./lib/ui.js";
import { configPendente, modoLocal, CONTA_ADMIN, resetarDados } from "./config/firebase.js";
import { entrar, recuperarSenha, observarSessao, sair } from "./dados/sessao.js";
import { souAdministrador } from "./dados/admin.js";

const conteudo = $("#conteudo");
const extra = $("#extra");

let jaRedirecionou = false;

observarSessao(async (ctx) => {
  if (ctx?.usuario) {
    if (await souAdministrador()) {
      if (jaRedirecionou) return;
      jaRedirecionou = true;
      location.replace("admin.html");
      return;
    }
    telaSemPermissao(ctx);
    return;
  }
  telaLogin();
});

/* ------------------------------------------------------------------ */
/* Login                                                               */
/* ------------------------------------------------------------------ */
function telaLogin() {
  const erro = el("div", { class: "aviso aviso-erro oculto" });

  const form = el(
    "form",
    {
      onsubmit: async (evento) => {
        evento.preventDefault();
        erro.classList.add("oculto");
        const dados = dadosDoForm(form);
        const botao = form.querySelector('button[type="submit"]');
        try {
          await comCarregamento(botao, "Entrando…", () => entrar(dados.email, dados.senha));
        } catch (falhou) {
          erro.textContent = mensagemDeErro(falhou);
          erro.classList.remove("oculto");
        }
      },
    },
    [
      el("div", { class: "grupo" }, [
        el("label", { class: "rotulo", for: "email" }, "E-mail"),
        el("input", {
          class: "campo",
          id: "email",
          name: "email",
          type: "email",
          autocomplete: "email",
          required: true,
          placeholder: "voce@suaplataforma.com",
        }),
      ]),
      el("div", { class: "grupo" }, [
        el("label", { class: "rotulo", for: "senha" }, "Senha"),
        el("input", {
          class: "campo",
          id: "senha",
          name: "senha",
          type: "password",
          autocomplete: "current-password",
          required: true,
          placeholder: "••••••••",
        }),
      ]),
      erro,
      el("button", { class: "btn btn-primario btn-bloco", type: "submit", style: { marginTop: "16px" } },
        "Entrar na administração"),
      el(
        "button",
        {
          class: "btn btn-fantasma btn-bloco btn-mini",
          type: "button",
          style: { marginTop: "6px" },
          onclick: async () => {
            const email = form.querySelector("#email").value;
            if (!email) return falha("Digite seu e-mail no campo acima e clique de novo.");
            try {
              await recuperarSenha(email);
              toast("Enviamos um link de redefinição para o seu e-mail.", "sucesso", 6000);
            } catch (falhou) {
              falha(mensagemDeErro(falhou));
            }
          },
        },
        "Esqueci minha senha",
      ),
    ],
  );

  render(
    conteudo,
    !modoLocal && configPendente
      ? el("div", { class: "aviso aviso-info", style: { marginBottom: "16px" } }, [
          "Preencha ",
          el("code", {}, "js/config/firebase-config.js"),
          " antes de usar.",
        ])
      : null,
    el("h1", { style: { fontSize: "1.0625rem" } }, "Acesso restrito"),
    el("p", { class: "suave pequeno", style: { margin: "4px 0 20px" } },
      "Área de gestão das contas da plataforma."),
    form,
  );

  render(extra, atalhoDemo());
}

/* ------------------------------------------------------------------ */
/* Conta sem permissão de administrador                                */
/* ------------------------------------------------------------------ */
function telaSemPermissao(ctx) {
  const daBarbearia = Boolean(ctx?.barbearia);

  render(
    conteudo,
    el("div", { class: "centro" }, [
      el("div", { style: { fontSize: "1.75rem" }, "aria-hidden": "true" }, "🔒"),
      el("h1", { style: { marginTop: "8px", fontSize: "1.0625rem" } }, "Sem permissão"),
      el("p", { class: "suave pequeno", style: { marginTop: "6px" } },
        daBarbearia
          ? "Esta conta é de uma barbearia. O painel dela fica em outro endereço."
          : "Esta conta não tem permissão de administração da plataforma."),
      el("p", { class: "fraco pequeno", style: { marginTop: "10px" } },
        modoLocal
          ? `No modo local, entre com ${CONTA_ADMIN?.email ?? "admin@agendia.local"}.`
          : `Para liberar, crie o documento admins/${ctx?.usuario?.uid} no console do Firebase.`),
      daBarbearia
        ? el("a", { class: "btn btn-primario btn-bloco", href: "painel.html", style: { marginTop: "16px" } },
            "Ir para o painel da barbearia")
        : null,
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
}

/* ------------------------------------------------------------------ */
/* Demonstração (modo local)                                           */
/* ------------------------------------------------------------------ */
function atalhoDemo() {
  if (!modoLocal || !CONTA_ADMIN) return null;

  return el("div", { class: "cartao cartao-corpo", style: { marginTop: "16px" } }, [
    el("p", { class: "rotulo", style: { marginBottom: "8px" } }, "Modo local — demonstração"),
    el(
      "button",
      {
        class: "btn btn-primario btn-bloco",
        type: "button",
        onclick: async (e) => {
          try {
            await comCarregamento(e.target, "Entrando…", () =>
              entrar(CONTA_ADMIN.email, CONTA_ADMIN.senha),
            );
          } catch (erro) {
            falha(mensagemDeErro(erro));
          }
        },
      },
      "Entrar como administrador",
    ),
    el("p", { class: "fraco pequeno centro", style: { marginTop: "8px" } },
      `${CONTA_ADMIN.email} · senha ${CONTA_ADMIN.senha}`),
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
