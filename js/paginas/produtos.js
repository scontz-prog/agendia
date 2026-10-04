/**
 * Produtos: o que o estabelecimento vende no balcão.
 *
 * Apresentado em grade, com a foto grande, porque é vitrine — a mesma
 * grade que o cliente vê no link de agendamento. Uma lista de linhas
 * como a de serviços economizaria espaço e esconderia justamente o que
 * faz o produto vender.
 */

import { el, render, carregando, vazio, dadosDoForm } from "../lib/dom.js";
import {
  abrirModal,
  fecharModal,
  sucesso,
  falha,
  confirmar,
  comCarregamento,
  mensagemDeErro,
} from "../lib/ui.js";
import { moeda, centavosParaCampo } from "../lib/formato.js";
import { campoImagem } from "../lib/envio-imagem.js";
import { PERFIL_PRODUTO } from "../lib/imagem.js";
import { recarregarRota } from "../lib/router.js";
import { contexto, ehGestor } from "../dados/sessao.js";
import { listarProdutos, salvarProduto, excluirProduto } from "../dados/produtos.js";

export async function telaProdutos({ container, ehAtual }) {
  const { barbearia } = contexto();
  container.append(carregando());

  const produtos = await listarProdutos(barbearia.id);
  if (!ehAtual()) return;

  const gestor = ehGestor();
  const novo = () =>
    el("button", { class: "btn btn-primario", type: "button", onclick: () => abrirForm(barbearia.id) },
      "Novo produto");

  render(
    container,

    el("div", { class: "cabecalho-tela" }, [
      el("div", {}, [
        el("h1", {}, "Produtos"),
        el("p", {}, "O catálogo aparece no link de agendamento, abaixo dos horários."),
      ]),
      gestor ? novo() : null,
    ]),

    produtos.length === 0
      ? vazio(
          "Nenhum produto cadastrado",
          "Cadastre o que você vende no balcão — pomada, shampoo, esmalte. Quem marca horário vê a vitrine antes de chegar.",
          gestor ? novo() : null,
        )
      : el(
          "div",
          { class: "catalogo" },
          produtos.map((p) => cartao(barbearia.id, p, gestor)),
        ),
  );
}

function cartao(bid, p, gestor) {
  return el("article", { class: `produto ${p.ativo ? "" : "inativo"}` }, [
    el("div", { class: "produto-foto" }, [
      p.fotoUrl
        ? el("img", { src: p.fotoUrl, alt: p.nome, loading: "lazy" })
        : el("span", { class: "sem-foto", "aria-hidden": "true" }, "📦"),
      p.ativo ? null : el("span", { class: "etiqueta etiqueta-neutra" }, "Fora do catálogo"),
    ]),
    el("div", { class: "produto-corpo" }, [
      el("h3", {}, p.nome),
      p.descricao ? el("p", { class: "pequeno suave" }, p.descricao) : null,
      el("p", { class: "preco num" }, moeda(p.precoCentavos)),
      gestor
        ? el("button", { class: "btn btn-secundario btn-mini", type: "button", onclick: () => abrirForm(bid, p) },
            "Editar")
        : null,
    ]),
  ]);
}

function abrirForm(bid, produto = null) {
  const erro = el("div", { class: "aviso aviso-erro oculto" });

  const foto = campoImagem({
    valorInicial: produto?.fotoUrl ?? null,
    perfil: PERFIL_PRODUTO,
    textoVazio: "sem foto",
    dica: "Quadrada fica melhor na vitrine. A imagem é reduzida automaticamente.",
  });

  const form = el("form", { onsubmit: enviar }, [
    grupo("Foto", foto.elemento),

    grupo("Nome", el("input", {
      class: "campo",
      name: "nome",
      required: true,
      value: produto?.nome ?? "",
      placeholder: "Pomada modeladora 120g",
    })),

    grupo("Descrição (opcional)", el("textarea", {
      class: "campo",
      name: "descricao",
      rows: 3,
      maxlength: 300,
      placeholder: "Fixação forte, brilho natural, cheiro de menta.",
    }, produto?.descricao ?? "")),

    el("div", { class: "dupla" }, [
      grupo("Preço (R$)", el("input", {
        class: "campo",
        name: "preco",
        inputmode: "decimal",
        value: produto ? centavosParaCampo(produto.precoCentavos) : "",
        placeholder: "35,00",
      })),
      grupo("Ordem na vitrine", el("input", {
        class: "campo",
        name: "ordem",
        type: "number",
        value: produto?.ordem ?? 0,
      })),
    ]),

    el("label", { class: "marcador" }, [
      el("input", { type: "checkbox", name: "ativo", checked: produto ? produto.ativo : true }),
      "Mostrar no catálogo",
    ]),

    erro,

    el("div", { class: "modal-acoes" }, [
      el("button", { class: "btn btn-secundario", type: "button", onclick: fecharModal }, "Cancelar"),
      el("button", { class: "btn btn-primario", type: "submit" }, "Salvar"),
    ]),

    produto
      ? el("button", {
          class: "btn btn-fantasma btn-bloco btn-mini",
          type: "button",
          style: { marginTop: "8px", color: "var(--erro)" },
          onclick: excluir,
        }, "Excluir produto")
      : null,
  ]);

  async function enviar(evento) {
    evento.preventDefault();
    erro.classList.add("oculto");
    const botao = form.querySelector('button[type="submit"]');
    try {
      await comCarregamento(botao, "Salvando…", () =>
        salvarProduto(bid, produto?.id, { ...dadosDoForm(form), fotoUrl: foto.valor() }),
      );
      fecharModal();
      sucesso("Produto salvo.");
      recarregarRota();
    } catch (falhou) {
      erro.textContent = mensagemDeErro(falhou);
      erro.classList.remove("oculto");
    }
  }

  async function excluir() {
    fecharModal();
    const ok = await confirmar(
      "Excluir produto",
      "Para tirar da vitrine sem perder o cadastro, prefira desmarcar “Mostrar no catálogo”.",
      "Excluir",
    );
    if (!ok) return;
    try {
      await excluirProduto(bid, produto.id);
      sucesso("Produto excluído.");
      recarregarRota();
    } catch (falhou) {
      falha(mensagemDeErro(falhou));
    }
  }

  abrirModal(produto ? `Editar ${produto.nome}` : "Novo produto", form);
}

function grupo(rotulo, ...filhos) {
  return el("div", { class: "grupo" }, [el("span", { class: "rotulo" }, rotulo), ...filhos]);
}
