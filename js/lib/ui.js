/** Toast, modal e confirmação — os três padrões de interação do sistema. */

import { el, $ } from "./dom.js";

/* ------------------------------------------------------------------ */
/* Toast                                                               */
/* ------------------------------------------------------------------ */
function containerToasts() {
  let c = $(".toasts");
  if (!c) {
    c = el("div", { class: "toasts", role: "status", "aria-live": "polite" });
    document.body.append(c);
  }
  return c;
}

export function toast(mensagem, tipo = "info", ms = 3500) {
  const node = el("div", { class: `toast toast-${tipo}` }, mensagem);
  containerToasts().append(node);
  setTimeout(() => {
    node.style.opacity = "0";
    node.style.transition = "opacity .2s";
    setTimeout(() => node.remove(), 220);
  }, ms);
}

export const sucesso = (m) => toast(m, "sucesso");
export const falha = (m) => toast(m, "erro", 5000);

/* ------------------------------------------------------------------ */
/* Modal                                                               */
/* ------------------------------------------------------------------ */
let modalAberto = null;

/**
 * Abre um modal. `conteudo` pode ser um nó ou uma função que recebe
 * `fechar` e devolve o nó — útil para o botão "Cancelar" de dentro do
 * formulário conseguir fechar.
 */
export function abrirModal(titulo, conteudo) {
  fecharModal();

  const caixa = el("div", { class: "modal-caixa", role: "dialog", "aria-modal": "true" });
  const fundo = el("div", { class: "modal-fundo", onclick: fecharModal });
  const modal = el("div", { class: "modal" }, [fundo, caixa]);

  caixa.append(
    el("div", { class: "modal-topo" }, [
      el("h2", { id: "modal-titulo" }, titulo),
      el(
        "button",
        { class: "modal-fechar", type: "button", "aria-label": "Fechar", onclick: fecharModal },
        "✕",
      ),
    ]),
  );
  caixa.setAttribute("aria-labelledby", "modal-titulo");

  const corpo = typeof conteudo === "function" ? conteudo(fecharModal) : conteudo;
  caixa.append(corpo);

  document.body.append(modal);
  document.body.style.overflow = "hidden";
  document.addEventListener("keydown", aoTeclar);

  // foca o primeiro campo: no celular já abre o teclado no lugar certo
  const primeiro = caixa.querySelector("input, select, textarea, button");
  primeiro?.focus({ preventScroll: true });

  modalAberto = modal;
  return fecharModal;
}

function aoTeclar(evento) {
  if (evento.key === "Escape") fecharModal();
}

export function fecharModal() {
  if (!modalAberto) return;
  modalAberto.remove();
  modalAberto = null;
  document.body.style.overflow = "";
  document.removeEventListener("keydown", aoTeclar);
}

/* ------------------------------------------------------------------ */
/* Confirmação                                                         */
/* ------------------------------------------------------------------ */
export function confirmar(titulo, mensagem, rotuloOk = "Confirmar") {
  return new Promise((resolve) => {
    abrirModal(titulo, (fechar) =>
      el("div", {}, [
        el("p", { class: "suave" }, mensagem),
        el("div", { class: "modal-acoes" }, [
          el(
            "button",
            {
              class: "btn btn-secundario",
              type: "button",
              onclick: () => {
                fechar();
                resolve(false);
              },
            },
            "Cancelar",
          ),
          el(
            "button",
            {
              class: "btn btn-perigo",
              type: "button",
              onclick: () => {
                fechar();
                resolve(true);
              },
            },
            rotuloOk,
          ),
        ]),
      ]),
    );
  });
}

/* ------------------------------------------------------------------ */
/* Estado de botão durante uma operação                                */
/* ------------------------------------------------------------------ */
/**
 * Desabilita o botão e troca o texto enquanto a promessa não resolve.
 * Evita o clique duplo que gera dois agendamentos.
 */
export async function comCarregamento(botao, textoOcupado, tarefa) {
  const original = botao.textContent;
  botao.disabled = true;
  botao.textContent = textoOcupado;
  try {
    return await tarefa();
  } finally {
    botao.disabled = false;
    botao.textContent = original;
  }
}

/** Traduz os códigos do Firebase para algo que o dono da barbearia entenda. */
export function mensagemDeErro(erro) {
  const codigo = erro?.code ?? "";
  const mapa = {
    "auth/invalid-credential": "E-mail ou senha incorretos.",
    "auth/invalid-login-credentials": "E-mail ou senha incorretos.",
    "auth/wrong-password": "E-mail ou senha incorretos.",
    "auth/user-not-found": "Não encontramos uma conta com esse e-mail.",
    "auth/email-already-in-use": "Já existe uma conta com esse e-mail.",
    "auth/weak-password": "A senha precisa ter ao menos 6 caracteres.",
    "auth/invalid-email": "E-mail inválido.",
    "auth/too-many-requests": "Muitas tentativas. Aguarde alguns minutos.",
    "auth/network-request-failed": "Sem conexão com o servidor.",
    "auth/operation-not-allowed":
      "Ative o provedor de login no console do Firebase (Authentication › Sign-in method).",
    "permission-denied": "Você não tem permissão para esta operação.",
    unavailable: "Sem conexão com o banco de dados.",
  };
  return mapa[codigo] ?? erro?.message ?? "Não foi possível concluir a operação.";
}
