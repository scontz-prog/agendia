/**
 * Campo de envio de imagem: prévia, botão de escolher e botão de remover.
 *
 * Devolve um objeto com `elemento` (para colocar na tela) e `valor()` (o
 * data URI atual, ou null). Quem chama decide quando gravar — o campo não
 * fala com o banco, só prepara a imagem.
 */

import { el } from "./dom.js";
import { prepararImagem, tamanhoDe, formatarTamanho, PERFIL_LOGO } from "./imagem.js";

export function campoImagem({
  valorInicial = null,
  perfil = PERFIL_LOGO,
  redonda = false,
  textoVazio = "sem imagem",
  dica = "",
  aoMudar = () => {},
} = {}) {
  let atual = valorInicial ?? null;

  const previa = el("div", { class: `envio-previa ${redonda ? "redonda" : ""}` });
  const situacao = el("p", { class: "envio-dica" });
  const entrada = el("input", {
    type: "file",
    accept: "image/png,image/jpeg,image/webp",
    onchange: escolher,
  });

  const botaoEscolher = el(
    "button",
    { class: "btn btn-secundario btn-mini", type: "button", onclick: () => entrada.click() },
    "Escolher imagem",
  );

  const botaoRemover = el(
    "button",
    {
      class: "btn btn-fantasma btn-mini",
      type: "button",
      style: { color: "var(--erro)" },
      onclick: () => definir(null),
    },
    "Remover",
  );

  function desenharPrevia() {
    previa.replaceChildren(
      atual
        ? el("img", { src: atual, alt: "Prévia" })
        : el("span", { class: "vazia" }, textoVazio),
    );
    botaoRemover.classList.toggle("oculto", !atual);
    situacao.textContent = atual
      ? `Guardada · ${formatarTamanho(tamanhoDe(atual))}`
      : dica;
  }

  function definir(valor) {
    atual = valor;
    desenharPrevia();
    aoMudar(atual);
  }

  async function escolher(evento) {
    const arquivo = evento.target.files?.[0];
    // permite escolher o mesmo arquivo de novo depois de remover
    evento.target.value = "";
    if (!arquivo) return;

    situacao.textContent = "Preparando imagem…";
    try {
      definir(await prepararImagem(arquivo, perfil));
    } catch (erro) {
      situacao.textContent = erro.message;
      situacao.style.color = "var(--erro)";
      setTimeout(() => {
        situacao.style.color = "";
        desenharPrevia();
      }, 5000);
    }
  }

  const elemento = el("div", { class: "envio" }, [
    previa,
    el("div", { class: "envio-controles" }, [
      el("div", { class: "linha-botoes" }, [botaoEscolher, botaoRemover]),
      situacao,
      entrada,
    ]),
  ]);

  desenharPrevia();

  return {
    elemento,
    valor: () => atual,
    definir,
  };
}
