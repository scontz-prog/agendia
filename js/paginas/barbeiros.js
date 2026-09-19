/**
 * Quem atende: comissão, cor na agenda e foto.
 *
 * O nome da tela vem do segmento — "Barbeiros" numa barbearia,
 * "Especialistas" numa clínica. A coleção continua se chamando
 * `barbeiros` no banco: renomear documento por motivo de rótulo seria
 * migração de dados para não ganhar nada.
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
import { telefone, mascararTelefone } from "../lib/formato.js";
import { recarregarRota } from "../lib/router.js";
import { campoImagem } from "../lib/envio-imagem.js";
import { PERFIL_FOTO } from "../lib/imagem.js";
import { avatarBarbeiro } from "../lib/marca.js";
import { contexto, ehGestor } from "../dados/sessao.js";
import { listarBarbeiros, salvarBarbeiro, excluirBarbeiro, CORES } from "../dados/barbeiros.js";
import { termos, maiuscula } from "../config/segmentos.js";

export async function telaBarbeiros({ container, ehAtual }) {
  const { barbearia } = contexto();
  const T = termos(barbearia);
  container.append(carregando());

  const barbeiros = await listarBarbeiros(barbearia.id);
  if (!ehAtual()) return;

  const gestor = ehGestor();
  const botaoNovo = () =>
    el(
      "button",
      { class: "btn btn-primario", type: "button", onclick: () => abrirForm(barbearia.id, null, T) },
      `Novo ${T.profissional}`,
    );

  render(
    container,
    el("div", { class: "cabecalho-tela" }, [
      el("div", {}, [
        el("h1", {}, maiuscula(T.profissionais)),
        el("p", {}, "Quem atende, a comissão de cada um e a cor na agenda."),
      ]),
      gestor ? botaoNovo() : null,
    ]),

    barbeiros.length === 0
      ? vazio(
          `Nenhum ${T.profissional} cadastrado`,
          `Cadastre ao menos um ${T.profissional} para começar a receber agendamentos.`,
          gestor ? botaoNovo() : null,
        )
      : el(
          "ul",
          { class: "cartao lista" },
          barbeiros.map((b) => linha(barbearia.id, b, gestor, T)),
        ),
  );
}

function linha(bid, b, gestor, T) {
  return el("li", {}, [
    el("div", { class: "item" }, [
      avatarBarbeiro(b, { tamanho: 40 }),
      el("div", { class: "crescer" }, [
        el("p", { class: "truncar", style: { fontWeight: "500" } }, b.nome),
        el("p", { class: "pequeno suave" },
          [telefone(b.telefone) || "sem telefone", `comissão ${Number(b.comissao ?? 0).toFixed(0)}%`].join(" · ")),
      ]),
      b.ativo
        ? null
        : el("span", { class: "etiqueta etiqueta-neutra" }, "Inativo"),
      gestor
        ? el("button", { class: "btn btn-secundario btn-mini", type: "button", onclick: () => abrirForm(bid, b, T) }, "Editar")
        : null,
    ]),
  ]);
}

function abrirForm(bid, barbeiro = null, T = termos(null)) {
  const erro = el("div", { class: "aviso aviso-erro oculto" });
  let cor = barbeiro?.cor ?? CORES[0];

  const paleta = el(
    "div",
    { class: "linha", style: { flexWrap: "wrap", gap: "8px" } },
    CORES.map((c) =>
      el("button", {
        type: "button",
        "aria-label": `Cor ${c}`,
        "aria-pressed": String(c === cor),
        style: {
          width: "34px",
          height: "34px",
          borderRadius: "50%",
          background: c,
          outline: c === cor ? "2px solid var(--destaque)" : "none",
          outlineOffset: "2px",
        },
        onclick: (e) => {
          cor = c;
          for (const botao of paleta.children) botao.setAttribute("aria-pressed", "false");
          for (const botao of paleta.children) botao.style.outline = "none";
          e.currentTarget.setAttribute("aria-pressed", "true");
          e.currentTarget.style.outline = "2px solid var(--destaque)";
        },
      }),
    ),
  );

  const foto = campoImagem({
    valorInicial: barbeiro?.fotoUrl ?? null,
    perfil: PERFIL_FOTO,
    redonda: true,
    textoVazio: "sem foto",
    dica: `Aparece para ${T.cliente === "paciente" ? "o paciente" : "o cliente"} na hora de escolher.`,
  });

  const form = el("form", { onsubmit: enviar }, [
    grupo("Foto de perfil", foto.elemento),

    grupo("Nome", el("input", { class: "campo", name: "nome", required: true, value: barbeiro?.nome ?? "", placeholder: "Lucas" })),

    el("div", { class: "dupla" }, [
      grupo("Telefone", el("input", {
        class: "campo",
        name: "telefone",
        type: "tel",
        value: telefone(barbeiro?.telefone),
        placeholder: "(79) 99999-0000",
        oninput: (e) => (e.target.value = mascararTelefone(e.target.value)),
      })),
      grupo("Comissão (%)", el("input", {
        class: "campo",
        name: "comissao",
        type: "number",
        min: 0,
        max: 100,
        step: 1,
        value: barbeiro?.comissao ?? 0,
      })),
    ]),

    grupo("Cor na agenda", paleta),

    el("div", { class: "dupla" }, [
      grupo("Ordem na agenda", el("input", { class: "campo", name: "ordem", type: "number", value: barbeiro?.ordem ?? 0 })),
      el("label", { class: "marcador", style: { marginTop: "22px" } }, [
        el("input", { type: "checkbox", name: "ativo", checked: barbeiro ? barbeiro.ativo : true }),
        "Ativo na agenda e no link público",
      ]),
    ]),

    erro,

    el("div", { class: "modal-acoes" }, [
      el("button", { class: "btn btn-secundario", type: "button", onclick: fecharModal }, "Cancelar"),
      el("button", { class: "btn btn-primario", type: "submit" }, "Salvar"),
    ]),

    barbeiro
      ? el(
          "button",
          {
            class: "btn btn-fantasma btn-bloco btn-mini",
            type: "button",
            style: { marginTop: "8px", color: "var(--erro)" },
            onclick: excluir,
          },
          `Excluir ${T.profissional}`,
        )
      : null,
  ]);

  async function enviar(evento) {
    evento.preventDefault();
    erro.classList.add("oculto");
    const dados = { ...dadosDoForm(form), cor, fotoUrl: foto.valor() };
    const botao = form.querySelector('button[type="submit"]');

    try {
      await comCarregamento(botao, "Salvando…", () => salvarBarbeiro(bid, barbeiro?.id, dados));
      fecharModal();
      sucesso(`${maiuscula(T.profissional)} salvo.`);
      recarregarRota();
    } catch (falhou) {
      erro.textContent = mensagemDeErro(falhou);
      erro.classList.remove("oculto");
    }
  }

  async function excluir() {
    fecharModal();
    const ok = await confirmar(
      `Excluir ${T.profissional}`,
      "Os atendimentos já lançados continuam no histórico. Se ele só saiu de férias, prefira desmarcar “Ativo”.",
      "Excluir",
    );
    if (!ok) return;
    try {
      await excluirBarbeiro(bid, barbeiro.id);
      sucesso(`${maiuscula(T.profissional)} excluído.`);
      recarregarRota();
    } catch (falhou) {
      falha(mensagemDeErro(falhou));
    }
  }

  abrirModal(barbeiro ? `Editar ${barbeiro.nome}` : `Novo ${T.profissional}`, form);
}

function grupo(rotulo, campo) {
  return el("div", { class: "grupo" }, [el("span", { class: "rotulo" }, rotulo), campo]);
}
