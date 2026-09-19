/** Serviços: preço e duração alimentam os horários do link público. */

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
import { moeda, duracao, centavosParaCampo } from "../lib/formato.js";
import { recarregarRota } from "../lib/router.js";
import { contexto, ehGestor } from "../dados/sessao.js";
import { listarServicos, salvarServico, excluirServico } from "../dados/servicos.js";

const DURACOES = [15, 30, 45, 60, 90];

export async function telaServicos({ container, ehAtual }) {
  const { barbearia } = contexto();
  container.append(carregando());

  const servicos = await listarServicos(barbearia.id);
  if (!ehAtual()) return;

  const gestor = ehGestor();

  render(
    container,
    el("div", { class: "cabecalho-tela" }, [
      el("div", {}, [
        el("h1", {}, "Serviços"),
        el("p", {}, "A duração define de quanto em quanto tempo o horário aparece para o cliente."),
      ]),
      gestor
        ? el("button", { class: "btn btn-primario", type: "button", onclick: () => abrirForm(barbearia.id) }, "Novo serviço")
        : null,
    ]),

    servicos.length === 0
      ? vazio(
          "Nenhum serviço cadastrado",
          "Sem serviço não há o que agendar. Comece por corte, barba e o combo.",
          gestor
            ? el("button", { class: "btn btn-primario", type: "button", onclick: () => abrirForm(barbearia.id) }, "Novo serviço")
            : null,
        )
      : el(
          "ul",
          { class: "cartao lista" },
          servicos.map((s) => linha(barbearia.id, s, gestor)),
        ),
  );
}

function linha(bid, s, gestor) {
  return el("li", {}, [
    el("div", { class: "item" }, [
      el("div", { class: "crescer" }, [
        el("p", { class: "truncar", style: { fontWeight: "500" } }, s.nome),
        el("p", { class: "pequeno suave truncar" }, s.descricao ?? duracao(s.duracaoMin)),
      ]),
      el("span", { style: { textAlign: "right", flexShrink: "0" } }, [
        el("span", { class: "num", style: { display: "block", fontWeight: "500" } }, moeda(s.precoCentavos)),
        el("span", { class: "pequeno fraco", style: { display: "block" } }, duracao(s.duracaoMin)),
      ]),
      s.ativo ? null : el("span", { class: "etiqueta etiqueta-neutra" }, "Inativo"),
      gestor
        ? el("button", { class: "btn btn-secundario btn-mini", type: "button", onclick: () => abrirForm(bid, s) }, "Editar")
        : null,
    ]),
  ]);
}

function abrirForm(bid, servico = null) {
  const erro = el("div", { class: "aviso aviso-erro oculto" });

  const form = el("form", { onsubmit: enviar }, [
    grupo("Nome", el("input", {
      class: "campo",
      name: "nome",
      required: true,
      value: servico?.nome ?? "",
      placeholder: "Corte + Barba",
    })),

    grupo("Descrição (opcional)", el("input", {
      class: "campo",
      name: "descricao",
      value: servico?.descricao ?? "",
      placeholder: "Máquina, tesoura e acabamento na navalha",
    })),

    el("div", { class: "dupla" }, [
      grupo("Preço (R$)", el("input", {
        class: "campo",
        name: "preco",
        inputmode: "decimal",
        value: servico ? centavosParaCampo(servico.precoCentavos) : "",
        placeholder: "45,00",
      })),
      grupo(
        "Duração (minutos)",
        el("input", {
          class: "campo",
          name: "duracaoMin",
          type: "number",
          min: 5,
          max: 480,
          step: 5,
          required: true,
          list: "duracoes",
          value: servico?.duracaoMin ?? 30,
        }),
        el("datalist", { id: "duracoes" }, DURACOES.map((d) => el("option", { value: d }))),
        el("p", { class: "fraco pequeno", style: { marginTop: "6px" } },
          "Múltiplos de 15 aproveitam melhor a grade da agenda."),
      ),
    ]),

    el("div", { class: "dupla" }, [
      grupo("Ordem na lista", el("input", { class: "campo", name: "ordem", type: "number", value: servico?.ordem ?? 0 })),
      el("label", { class: "marcador", style: { marginTop: "22px" } }, [
        el("input", { type: "checkbox", name: "ativo", checked: servico ? servico.ativo : true }),
        "Disponível para agendamento",
      ]),
    ]),

    erro,

    el("div", { class: "modal-acoes" }, [
      el("button", { class: "btn btn-secundario", type: "button", onclick: fecharModal }, "Cancelar"),
      el("button", { class: "btn btn-primario", type: "submit" }, "Salvar"),
    ]),

    servico
      ? el(
          "button",
          {
            class: "btn btn-fantasma btn-bloco btn-mini",
            type: "button",
            style: { marginTop: "8px", color: "var(--erro)" },
            onclick: excluir,
          },
          "Excluir serviço",
        )
      : null,
  ]);

  async function enviar(evento) {
    evento.preventDefault();
    erro.classList.add("oculto");
    const botao = form.querySelector('button[type="submit"]');

    try {
      await comCarregamento(botao, "Salvando…", () =>
        salvarServico(bid, servico?.id, dadosDoForm(form)),
      );
      fecharModal();
      sucesso("Serviço salvo.");
      recarregarRota();
    } catch (falhou) {
      erro.textContent = mensagemDeErro(falhou);
      erro.classList.remove("oculto");
    }
  }

  async function excluir() {
    fecharModal();
    const ok = await confirmar(
      "Excluir serviço",
      "Os atendimentos já lançados guardam o nome e o preço da época, então o histórico não muda. Para tirar do link público, prefira desmarcar “Disponível”.",
      "Excluir",
    );
    if (!ok) return;
    try {
      await excluirServico(bid, servico.id);
      sucesso("Serviço excluído.");
      recarregarRota();
    } catch (falhou) {
      falha(mensagemDeErro(falhou));
    }
  }

  abrirModal(servico ? `Editar ${servico.nome}` : "Novo serviço", form);
}

function grupo(rotulo, ...filhos) {
  return el("div", { class: "grupo" }, [el("span", { class: "rotulo" }, rotulo), ...filhos]);
}
