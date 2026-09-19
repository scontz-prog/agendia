/**
 * Marcas na interface: a da plataforma (Agendia) e a de cada barbearia.
 *
 * A MARCA AGENDIA É COMPOSTA, NÃO UMA IMAGEM
 * Só o desenho (caderno + relógio) vem de arquivo. "AGENDIA" e o lema são
 * texto. Isso resolve de uma vez três coisas que imagem não resolve: o
 * nome fica nítido em qualquer tamanho sem exportar variações, a cor é
 * ajustável por CSS (é assim que ele é prata), e o nome do produto vira
 * texto de verdade para leitor de tela.
 *
 * REGRA DE HIERARQUIA
 * Quem o cliente final precisa reconhecer é a barbearia, não a
 * plataforma. Por isso a marca da barbearia aparece grande e centralizada,
 * e a Agendia fica pequena, num canto. Inverter isso transformaria o link
 * de agendamento numa propaganda da plataforma em cima do cliente que a
 * barbearia levou anos para conquistar.
 */

import { el } from "./dom.js";

const SIMBOLO = "assets/agendia-simbolo.webp";

export const NOME_PRODUTO = "AGENDIA";
export const LEMA_PRODUTO = "Organização e tempo";

/**
 * Marca completa. `variante` aceita:
 *   "horizontal" — desenho à esquerda, nome à direita (padrão)
 *   "empilhada"  — desenho em cima, nome embaixo
 *   "simbolo"    — só o desenho
 */
export function marcaAgendia({
  altura = 40,
  variante = "horizontal",
  href = null,
  lema = true,
} = {}) {
  const classes = ["marca-agendia"];
  if (variante === "empilhada") classes.push("empilhada");
  if (variante === "simbolo") classes.push("so-simbolo");

  const filhos = [
    el("img", { src: SIMBOLO, alt: variante === "simbolo" ? "Agendia" : "" }),
    el("span", { class: "marca-agendia-texto" }, [
      el("span", { class: "marca-agendia-nome" }, NOME_PRODUTO),
      lema ? el("span", { class: "marca-agendia-lema" }, LEMA_PRODUTO) : null,
    ]),
  ];

  const atributos = {
    class: classes.join(" "),
    style: { "--marca-altura": `${altura}px` },
    title: "Agendia — organização e tempo",
  };

  return href
    ? el("a", { ...atributos, href }, filhos)
    : el("span", atributos, filhos);
}

/** Só o desenho — para cantos e espaços apertados. */
export function simboloAgendia({ altura = 28, href = null } = {}) {
  return marcaAgendia({ altura, variante: "simbolo", href });
}

/** Assinatura discreta de rodapé, para a página pública. */
export function assinaturaAgendia() {
  return el("div", { class: "assinatura-agendia" }, [
    el("span", {}, "agendamento por"),
    marcaAgendia({ altura: 32, lema: false }),
  ]);
}

/**
 * Marca da barbearia: usa a logo enviada; sem logo, cai para o nome em
 * tipografia — nunca deixa um buraco nem um ícone genérico no lugar.
 */
export function marcaBarbearia(barbearia, { altura = 44, classe = "" } = {}) {
  if (barbearia?.logoUrl) {
    return el("img", {
      src: barbearia.logoUrl,
      alt: barbearia.nome ?? "Logo da barbearia",
      class: `logo-barbearia ${classe}`,
      style: { maxHeight: `${altura}px` },
    });
  }

  return el("span", { class: `nome-barbearia ${classe}` }, barbearia?.nome ?? "");
}

/* ------------------------------------------------------------------ */
/* Avatares                                                            */
/* ------------------------------------------------------------------ */

/** Iniciais de "João Pedro Silva" -> "JS". */
export function iniciais(nome) {
  const partes = String(nome ?? "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (partes.length === 0) return "?";
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
  return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase();
}

/**
 * Avatar do barbeiro. Sem foto, mostra as iniciais sobre a cor que o
 * barbeiro já tem na agenda — o cliente continua conseguindo diferenciar
 * um do outro, e a tela não fica com silhuetas cinzas genéricas.
 */
export function avatarBarbeiro(barbeiro, { tamanho = 44 } = {}) {
  const estilo = {
    width: `${tamanho}px`,
    height: `${tamanho}px`,
    fontSize: `${Math.round(tamanho * 0.38)}px`,
  };

  if (barbeiro?.fotoUrl) {
    return el("img", {
      src: barbeiro.fotoUrl,
      alt: barbeiro.nome ?? "Barbeiro",
      class: "avatar",
      style: { ...estilo, borderColor: barbeiro.cor ?? "var(--borda-forte)" },
    });
  }

  return el(
    "span",
    {
      class: "avatar avatar-iniciais",
      "aria-hidden": "true",
      style: {
        ...estilo,
        background: `${barbeiro?.cor ?? "#6d0300"}33`,
        borderColor: barbeiro?.cor ?? "var(--borda-forte)",
        color: barbeiro?.cor ?? "var(--texto-suave)",
      },
    },
    iniciais(barbeiro?.nome),
  );
}
