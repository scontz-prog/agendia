/**
 * Helpers de DOM.
 *
 * O sistema monta a interface direto no DOM, sem framework. Estas quatro
 * funções cobrem tudo que é usado — o objetivo é ter menos código para
 * manter, não reinventar o React.
 */

export const $ = (seletor, raiz = document) => raiz.querySelector(seletor);
export const $$ = (seletor, raiz = document) => [...raiz.querySelectorAll(seletor)];

/**
 * Cria um elemento.
 *   el("button", { class: "btn", onclick: fn }, "Salvar")
 * Atributos que começam com "on" viram listeners; "dataset" vira data-*.
 */
export function el(tag, atributos = {}, filhos = []) {
  const node = document.createElement(tag);

  for (const [chave, valor] of Object.entries(atributos)) {
    if (valor === null || valor === undefined || valor === false) continue;

    if (chave === "dataset") {
      Object.assign(node.dataset, valor);
    } else if (chave === "style" && typeof valor === "object") {
      for (const [prop, v] of Object.entries(valor)) {
        if (v === null || v === undefined) continue;
        // Object.assign não grava variáveis CSS (--algo): ele só copia
        // propriedades conhecidas do CSSStyleDeclaration e descarta o
        // resto em silêncio. Custom property exige setProperty.
        if (prop.startsWith("--")) node.style.setProperty(prop, String(v));
        else node.style[prop] = v;
      }
    } else if (chave.startsWith("on") && typeof valor === "function") {
      node.addEventListener(chave.slice(2), valor);
    } else if (chave === "html") {
      // usado só com texto que o próprio sistema gera
      node.innerHTML = valor;
    } else if (valor === true) {
      node.setAttribute(chave, "");
    } else {
      node.setAttribute(chave, valor);
    }
  }

  anexar(node, filhos);
  return node;
}

function anexar(node, filhos) {
  const lista = Array.isArray(filhos) ? filhos : [filhos];
  for (const filho of lista) {
    if (filho === null || filho === undefined || filho === false) continue;
    if (Array.isArray(filho)) anexar(node, filho);
    else node.append(filho instanceof Node ? filho : document.createTextNode(String(filho)));
  }
}

/** Substitui todo o conteúdo de um container. */
export function render(container, ...filhos) {
  container.replaceChildren();
  anexar(container, filhos);
  return container;
}

/** Estado vazio padronizado. */
export function vazio(titulo, descricao, acao) {
  return el("div", { class: "vazio" }, [
    el("strong", {}, titulo),
    descricao ? el("p", {}, descricao) : null,
    acao ?? null,
  ]);
}

/** Indicador de carregamento. */
export function carregando(texto = "Carregando…") {
  return el("div", { class: "carregando" }, [el("div", { class: "girando" }), texto]);
}

/** Lê um formulário como objeto simples, já com os valores aparados. */
export function dadosDoForm(form) {
  const dados = {};
  for (const [chave, valor] of new FormData(form).entries()) {
    dados[chave] = typeof valor === "string" ? valor.trim() : valor;
  }
  // checkboxes desmarcados não aparecem no FormData
  for (const campo of form.querySelectorAll('input[type="checkbox"][name]')) {
    dados[campo.name] = campo.checked;
  }
  return dados;
}
