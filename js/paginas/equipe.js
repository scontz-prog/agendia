/**
 * Acessos ao painel — quem entra e com que alcance.
 *
 * Só o dono chega aqui. O gerente vê o resto do sistema, mas não
 * distribui acesso: quem pode criar login pode criar um para si mesmo com
 * o alcance que quiser, e isso tem que parar no dono.
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
import { recarregarRota } from "../lib/router.js";
import { avatarBarbeiro, iniciais } from "../lib/marca.js";
import { contexto } from "../dados/sessao.js";
import { listarBarbeiros } from "../dados/barbeiros.js";
import {
  listarEquipe,
  liberarAcesso,
  mudarPapel,
  revogarAcesso,
  papeisDoSegmento,
  papeisConcediveis,
  rotuloPapel,
} from "../dados/equipe.js";
import { termos, flexoes } from "../config/segmentos.js";

export async function telaEquipe({ container, ehAtual }) {
  const { barbearia, perfil, usuario } = contexto();
  const T = termos(barbearia);
  const F = flexoes(barbearia);

  if (perfil.papel !== "dono") {
    render(
      container,
      vazio(
        "Área do dono",
        `Só quem é dono ${F.de} libera e remove acessos ao painel.`,
      ),
    );
    return;
  }

  container.append(carregando("Carregando os acessos…"));

  const [equipe, barbeiros] = await Promise.all([
    listarEquipe(barbearia.id),
    listarBarbeiros(barbearia.id, { somenteAtivos: true }),
  ]);

  if (!ehAtual()) return;

  const porId = new Map(barbeiros.map((b) => [b.id, b]));

  render(
    container,

    el("div", { class: "cabecalho-tela" }, [
      el("div", {}, [
        el("h1", {}, "Acessos ao painel"),
        el("p", {}, `Quem entra no sistema ${F.de} e o que cada um enxerga.`),
      ]),
      el(
        "button",
        {
          class: "btn btn-primario",
          type: "button",
          onclick: () => abrirFormulario(barbearia, barbeiros),
        },
        "Liberar acesso",
      ),
    ]),

    el("div", { class: "aviso aviso-info", style: { marginBottom: "18px" } }, [
      el("strong", {}, "Como funciona. "),
      "Você cria o login aqui e entrega o e-mail e a senha à pessoa. ",
      `Ela entra pelo mesmo endereço ${F.de}. Remover o acesso não apaga `,
      "a conta dela — apenas deixa de abrir o painel, na hora.",
    ]),

    el(
      "ul",
      { class: "cartao lista" },
      equipe.map((pessoa) =>
        linha(pessoa, {
          souEu: pessoa.id === usuario.uid,
          barbeiro: porId.get(pessoa.barbeiroId),
          barbeiros,
          barbearia,
        }),
      ),
    ),

    el("section", { class: "secao", style: { marginTop: "24px" } }, [
      el("h2", { class: "secao-titulo" }, "O que cada nível enxerga"),
      el(
        "ul",
        { class: "cartao lista" },
        Object.values(papeisDoSegmento(barbearia)).map((p) =>
          el("li", {}, [
            el("div", { class: "item" }, [
              el("span", { class: `etiqueta ${p.id === "barbeiro" ? "etiqueta-confirmado" : "etiqueta-realizado"}` },
                p.nome),
              el("span", { class: "crescer pequeno suave" }, p.descricao),
            ]),
          ]),
        ),
      ),
    ]),
  );
}

/* ------------------------------------------------------------------ */
/* Cada pessoa                                                         */
/* ------------------------------------------------------------------ */
function linha(pessoa, { souEu, barbeiro, barbeiros, barbearia }) {
  const ehDono = pessoa.papel === "dono";
  const T = termos(barbearia);

  return el("li", {}, [
    el("div", { class: "item" }, [
      barbeiro
        ? avatarBarbeiro(barbeiro, { tamanho: 40 })
        : el(
            "span",
            {
              class: "avatar avatar-iniciais",
              "aria-hidden": "true",
              style: { width: "40px", height: "40px", fontSize: "15px" },
            },
            iniciais(pessoa.nome),
          ),

      el("div", { class: "crescer" }, [
        el("p", { class: "truncar", style: { fontWeight: "500" } }, [
          pessoa.nome,
          souEu ? el("span", { class: "pequeno fraco" }, " · você") : null,
        ]),
        el("p", { class: "pequeno suave truncar" }, pessoa.email ?? ""),
        pessoa.papel === "barbeiro"
          ? el("p", { class: "pequeno fraco truncar" },
              barbeiro
                ? `Agenda de ${barbeiro.nome}`
                : `⚠ sem ${T.profissional} vinculado — não vai ver agenda nenhuma`)
          : null,
      ]),

      el("span", { class: `etiqueta ${ehDono ? "etiqueta-realizado" : "etiqueta-neutra"}` },
        rotuloPapel(pessoa.papel, barbearia)),

      ehDono || souEu
        ? null
        : el(
            "button",
            {
              class: "btn btn-secundario btn-mini",
              type: "button",
              onclick: () => abrirAjuste(pessoa, barbeiros, barbearia),
            },
            "Alterar",
          ),
    ]),
  ]);
}

/* ------------------------------------------------------------------ */
/* Liberar acesso                                                      */
/* ------------------------------------------------------------------ */
function abrirFormulario(barbearia, barbeiros) {
  const erro = el("div", { class: "aviso aviso-erro oculto" });
  const T = termos(barbearia);

  const seletorBarbeiro = el(
    "select",
    { class: "campo", name: "barbeiroId" },
    [
      el("option", { value: "" }, "— escolha —"),
      ...barbeiros.map((b) => el("option", { value: b.id }, b.nome)),
    ],
  );

  const grupoBarbeiro = el("div", { class: "grupo" }, [
    el("span", { class: "rotulo" }, `Agenda de qual ${T.profissional}`),
    seletorBarbeiro,
    el("p", { class: "fraco pequeno", style: { marginTop: "6px" } },
      "É a agenda que essa pessoa vai ver ao entrar."),
  ]);

  const seletorPapel = el(
    "select",
    {
      class: "campo",
      name: "papel",
      onchange: (e) => grupoBarbeiro.classList.toggle("oculto", e.target.value !== "barbeiro"),
    },
    papeisConcediveis(barbearia).map((p) =>
      el("option", { value: p.id, selected: p.id === "barbeiro" }, `${p.nome} — ${p.descricao}`),
    ),
  );

  const form = el("form", { onsubmit: enviar }, [
    el("div", { class: "dupla" }, [
      grupo("Nome", el("input", { class: "campo", name: "nome", required: true, placeholder: "Lucas Andrade" })),
      grupo("E-mail", el("input", {
        class: "campo",
        name: "email",
        type: "email",
        required: true,
        autocomplete: "off",
        placeholder: "lucas@exemplo.com",
      })),
    ]),

    grupo(
      "Senha provisória",
      el("input", {
        class: "campo",
        name: "senha",
        required: true,
        minlength: 6,
        autocomplete: "new-password",
        placeholder: "mínimo 6 caracteres",
      }),
      el("p", { class: "fraco pequeno", style: { marginTop: "6px" } },
        "Entregue à pessoa. Ela pode trocar depois usando “Esqueci minha senha”."),
    ),

    grupo("Nível de acesso", seletorPapel),
    grupoBarbeiro,

    erro,

    el("div", { class: "modal-acoes" }, [
      el("button", { class: "btn btn-secundario", type: "button", onclick: fecharModal }, "Cancelar"),
      el("button", { class: "btn btn-primario", type: "submit" }, "Liberar acesso"),
    ]),
  ]);

  async function enviar(evento) {
    evento.preventDefault();
    erro.classList.add("oculto");
    const botao = form.querySelector('button[type="submit"]');

    try {
      await comCarregamento(botao, "Liberando…", () =>
        liberarAcesso(barbearia.id, dadosDoForm(form)),
      );
      fecharModal();
      sucesso("Acesso liberado.");
      recarregarRota();
    } catch (falhou) {
      erro.textContent = mensagemDeErro(falhou);
      erro.classList.remove("oculto");
    }
  }

  abrirModal("Liberar acesso ao painel", form);
}

/* ------------------------------------------------------------------ */
/* Alterar ou revogar                                                  */
/* ------------------------------------------------------------------ */
function abrirAjuste(pessoa, barbeiros, barbearia) {
  const erro = el("div", { class: "aviso aviso-erro oculto" });
  const T = termos(barbearia);

  const seletorBarbeiro = el(
    "select",
    { class: "campo", name: "barbeiroId" },
    [
      el("option", { value: "" }, "— escolha —"),
      ...barbeiros.map((b) =>
        el("option", { value: b.id, selected: b.id === pessoa.barbeiroId }, b.nome),
      ),
    ],
  );

  const grupoBarbeiro = el(
    "div",
    { class: `grupo ${pessoa.papel === "barbeiro" ? "" : "oculto"}` },
    [el("span", { class: "rotulo" }, `Agenda de qual ${T.profissional}`), seletorBarbeiro],
  );

  const seletorPapel = el(
    "select",
    {
      class: "campo",
      name: "papel",
      onchange: (e) => grupoBarbeiro.classList.toggle("oculto", e.target.value !== "barbeiro"),
    },
    papeisConcediveis(barbearia).map((p) =>
      el("option", { value: p.id, selected: p.id === pessoa.papel }, `${p.nome} — ${p.descricao}`),
    ),
  );

  const form = el("form", { onsubmit: enviar }, [
    el("p", { class: "resumo", style: { marginBottom: "16px" } }, [
      el("strong", {}, pessoa.nome),
      el("br"),
      el("span", { class: "suave pequeno" }, pessoa.email ?? ""),
    ]),

    grupo("Nível de acesso", seletorPapel),
    grupoBarbeiro,
    erro,

    el("div", { class: "modal-acoes" }, [
      el("button", { class: "btn btn-secundario", type: "button", onclick: fecharModal }, "Cancelar"),
      el("button", { class: "btn btn-primario", type: "submit" }, "Salvar"),
    ]),

    el(
      "button",
      {
        class: "btn btn-fantasma btn-bloco btn-mini",
        type: "button",
        style: { marginTop: "8px", color: "var(--erro)" },
        onclick: remover,
      },
      "Remover acesso ao painel",
    ),
  ]);

  async function enviar(evento) {
    evento.preventDefault();
    erro.classList.add("oculto");
    const dados = dadosDoForm(form);
    const botao = form.querySelector('button[type="submit"]');

    try {
      await comCarregamento(botao, "Salvando…", () =>
        mudarPapel(pessoa.id, dados.papel, dados.barbeiroId),
      );
      fecharModal();
      sucesso("Acesso atualizado.");
      recarregarRota();
    } catch (falhou) {
      erro.textContent = mensagemDeErro(falhou);
      erro.classList.remove("oculto");
    }
  }

  async function remover() {
    fecharModal();
    const ok = await confirmar(
      `Remover o acesso de ${pessoa.nome}?`,
      "O painel deixa de abrir na hora. A conta de login continua existindo — " +
        "os atendimentos já lançados por essa pessoa não mudam.",
      "Remover acesso",
    );
    if (!ok) return;

    try {
      await revogarAcesso(pessoa.id);
      sucesso("Acesso removido.");
      recarregarRota();
    } catch (falhou) {
      falha(mensagemDeErro(falhou));
    }
  }

  abrirModal("Alterar acesso", form);
}

function grupo(rotulo, ...filhos) {
  return el("div", { class: "grupo" }, [el("span", { class: "rotulo" }, rotulo), ...filhos]);
}
