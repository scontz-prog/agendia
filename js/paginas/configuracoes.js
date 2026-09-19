/** Configurações: dados da barbearia, expediente, folgas e link público. */

import { el, render, carregando, dadosDoForm } from "../lib/dom.js";
import {
  abrirModal,
  fecharModal,
  sucesso,
  falha,
  confirmar,
  comCarregamento,
  mensagemDeErro,
  toast,
} from "../lib/ui.js";
import {
  telefone,
  mascararTelefone,
  minutosParaHora,
  dataCurta,
  DIAS_SEMANA,
} from "../lib/formato.js";
import { FUSOS_BRASIL, hojeNaBarbearia } from "../lib/fuso.js";
import { recarregarRota } from "../lib/router.js";
import { contexto, ehGestor, atualizarBarbeariaNoContexto } from "../dados/sessao.js";
import { modoLocal, resetarDados } from "../config/firebase.js";
import { LISTA_SEGMENTOS, termos, flexoes, maiuscula } from "../config/segmentos.js";
import {
  salvarDadosBarbearia,
  salvarHorarios,
  salvarLogo,
  salvarLembretes,
  linkPublico,
  horariosPadrao,
} from "../dados/barbearias.js";
import { campoImagem } from "../lib/envio-imagem.js";
import { PERFIL_LOGO } from "../lib/imagem.js";
import { marcaBarbearia } from "../lib/marca.js";
import { listarBarbeiros } from "../dados/barbeiros.js";
import {
  listarBloqueiosFuturos,
  criarBloqueio,
  excluirBloqueio,
} from "../dados/bloqueios.js";
import {
  semearModelos,
  salvarModelo,
  excluirModelo,
  variaveisDesconhecidas,
  VARIAVEIS,
  CANAIS,
} from "../dados/mensagens.js";

export async function telaConfiguracoes({ container, ehAtual }) {
  const { barbearia } = contexto();
  container.append(carregando());

  const hoje = hojeNaBarbearia(barbearia.timezone);
  const [barbeiros, bloqueios, modelos] = await Promise.all([
    listarBarbeiros(barbearia.id, { somenteAtivos: true }),
    listarBloqueiosFuturos(barbearia.id, hoje),
    semearModelos(barbearia.id, barbearia),
  ]);

  if (!ehAtual()) return;
  const gestor = ehGestor();

  render(
    container,
    el("div", { class: "cabecalho-tela" }, [
      el("div", {}, [
        el("h1", {}, "Configurações"),
        el("p", {}, "Dados da barbearia, horário de funcionamento e folgas."),
      ]),
    ]),

    gestor
      ? null
      : el("div", { class: "aviso aviso-info", style: { marginBottom: "20px" } },
          "Só o dono ou o gerente pode alterar estas configurações."),

    secaoIdentidade(barbearia, gestor),
    secaoLink(barbearia),
    secaoDados(barbearia, gestor),
    secaoHorarios(barbearia, gestor),
    secaoBloqueios(barbearia, barbeiros, bloqueios, hoje),
    secaoModelos(barbearia, modelos, gestor),
    secaoLembretes(barbearia, modelos, gestor),
    secaoModoLocal(),
  );
}

/* ------------------------------------------------------------------ */
/* Notificações por e-mail                                             */
/*                                                                     */
/* Esta tela só GRAVA a configuração. Quem envia é a Cloud Function     */
/* (functions/index.js), que roda no Google — o site continua estático  */
/* e não envia nada por conta própria.                                  */
/* ------------------------------------------------------------------ */
function secaoLembretes(barbearia, modelos, gestor) {
  const T = termos(barbearia);
  const cfg = barbearia.lembretes ?? {};
  const porEmail = modelos.filter((m) => m.canal === "email");
  const erro = el("div", { class: "aviso aviso-erro oculto" });

  const caixa = (name, marcado, rotulo, ajuda) =>
    el("label", { class: "linha", style: { gap: "10px", alignItems: "flex-start", marginBottom: "12px", cursor: gestor ? "pointer" : "default" } }, [
      el("input", { type: "checkbox", class: "caixa-selecao", name, checked: marcado, disabled: !gestor, style: { marginTop: "2px" } }),
      el("span", {}, [
        el("span", {}, rotulo),
        ajuda ? el("span", { class: "fraco pequeno", style: { display: "block", marginTop: "2px" } }, ajuda) : null,
      ]),
    ]);

  const form = el("form", { onsubmit: enviar }, [
    el("fieldset", { disabled: !gestor, style: { border: "none", padding: "0" } }, [
      caixa("confirmacaoCliente", cfg.confirmacaoCliente !== false,
        `Confirmar ao ${T.cliente} por e-mail quando ele agendar`,
        "Sai na hora, com data, horário e profissional."),

      caixa("avisoEmpresa", cfg.avisoEmpresa !== false,
        "Me avisar por e-mail a cada agendamento feito pelo link",
        "Os lançados aqui no painel não geram aviso — você mesmo acabou de marcar."),

      grupo("E-mail que recebe os avisos",
        el("input", {
          class: "campo", name: "emailAvisos", type: "email",
          value: cfg.emailAvisos ?? barbearia.email ?? "",
          placeholder: "voce@seunegocio.com",
        })),

      el("hr", { style: { border: "none", borderTop: "1px solid var(--borda)", margin: "16px 0" } }),

      caixa("ativo", Boolean(cfg.ativo),
        "Enviar lembrete antes do horário",
        `O ${T.cliente} recebe um e-mail algumas horas antes. Quem cancelou não recebe, e ninguém é lembrado duas vezes.`),

      el("div", { class: "dupla" }, [
        grupo("Quanto tempo antes",
          el("select", { class: "campo", name: "antecedenciaHoras" },
            [1, 2, 3, 6, 12, 24, 48].map((h) =>
              el("option", { value: String(h), selected: Number(cfg.antecedenciaHoras ?? 2) === h },
                h < 24 ? `${h} hora${h > 1 ? "s" : ""} antes` : h === 24 ? "1 dia antes" : "2 dias antes")))),
        grupo("Texto do lembrete",
          el("select", { class: "campo", name: "modeloId" }, [
            el("option", { value: "", selected: !cfg.modeloId }, "Texto padrão do Agendia"),
            ...porEmail.map((m) => el("option", { value: m.id, selected: m.id === cfg.modeloId }, m.nome)),
          ])),
      ]),

      erro,

      el("button", { class: "btn btn-primario", type: "submit", style: { marginTop: "14px" } },
        "Salvar notificações"),
    ]),
  ]);

  async function enviar(evento) {
    evento.preventDefault();
    erro.classList.add("oculto");
    const botao = form.querySelector('button[type="submit"]');
    const marcado = (n) => form.querySelector(`[name="${n}"]`).checked;
    const dados = dadosDoForm(form);
    const config = {
      confirmacaoCliente: marcado("confirmacaoCliente"),
      avisoEmpresa: marcado("avisoEmpresa"),
      emailAvisos: dados.emailAvisos,
      ativo: marcado("ativo"),
      antecedenciaHoras: dados.antecedenciaHoras,
      modeloId: dados.modeloId,
      linkPublico: linkPublico(barbearia.slug),
    };

    try {
      await comCarregamento(botao, "Salvando…", () => salvarLembretes(barbearia.id, config));
      atualizarBarbeariaNoContexto({ lembretes: { ...config, antecedenciaHoras: Number(config.antecedenciaHoras) } });
      sucesso("Notificações salvas.");
    } catch (falhou) {
      erro.textContent = mensagemDeErro(falhou);
      erro.classList.remove("oculto");
    }
  }

  return el("section", { class: "cartao cartao-corpo secao" }, [
    el("h2", {}, "Notificações por e-mail"),
    el("p", { class: "suave pequeno", style: { margin: "4px 0 14px" } },
      `Avisos automáticos para você e para os seus ${T.clientes}, sem ninguém precisar abrir o sistema.`),

    // Guardar a configuração não faz o e-mail sair. Dizer isso aqui evita
    // a pior descoberta: a de quem confiou no aviso e só percebeu que nada
    // saiu quando o cliente não apareceu.
    el("div", { class: "aviso aviso-info", style: { marginBottom: "14px" } }, [
      el("strong", {}, "Os envios dependem do serviço de e-mail da plataforma. "),
      modoLocal
        ? "No modo local nada é enviado — a configuração só fica guardada."
        : "Se nada estiver chegando, fale com a plataforma.",
    ]),

    form,
  ]);
}

/* ------------------------------------------------------------------ */
/* Modelos de mensagem                                                 */
/*                                                                     */
/* O modelo mora na conta, e não no código, porque cada estabelecimento */
/* tem um jeito de falar. Uma clínica não escreve como uma barbearia,   */
/* e um texto fixo no sistema obrigaria os dois ao mesmo tom.          */
/* ------------------------------------------------------------------ */
function secaoModelos(barbearia, modelos, gestor) {
  const T = termos(barbearia);

  return el("section", { class: "cartao cartao-corpo secao" }, [
    el("div", { class: "entre" }, [
      el("h2", {}, "Modelos de mensagem"),
      gestor
        ? el(
            "button",
            {
              class: "btn btn-secundario btn-mini",
              type: "button",
              onclick: () => abrirModelo(barbearia, null),
            },
            "Novo modelo",
          )
        : null,
    ]),
    el("p", { class: "suave pequeno", style: { margin: "4px 0 14px" } },
      `Textos prontos para avisar seus ${T.clientes}. Use {nome}, {data}, {hora} e as demais variáveis — elas são trocadas pelos dados de cada um na hora do envio.`),

    modelos.length === 0
      ? el("p", { class: "fraco pequeno" }, "Nenhum modelo cadastrado.")
      : el(
          "ul",
          { class: "lista", style: { borderTop: "1px solid var(--borda)" } },
          modelos.map((m) =>
            el("li", {}, [
              el("div", { class: "item", style: { paddingInline: "0" } }, [
                el("span", { "aria-hidden": "true", style: { flexShrink: "0" } },
                  CANAIS[m.canal]?.emblema ?? "•"),
                el("div", { class: "crescer" }, [
                  el("p", { class: "pequeno", style: { fontWeight: "500" } }, m.nome),
                  el("p", { class: "pequeno fraco truncar" },
                    m.texto.replace(/\s+/g, " ").slice(0, 70) + (m.texto.length > 70 ? "…" : "")),
                ]),
                gestor
                  ? el(
                      "button",
                      {
                        class: "btn btn-secundario btn-mini",
                        type: "button",
                        onclick: () => abrirModelo(barbearia, m),
                      },
                      "Editar",
                    )
                  : null,
              ]),
            ]),
          ),
        ),
  ]);
}

function abrirModelo(barbearia, modelo) {
  const erro = el("div", { class: "aviso aviso-erro oculto" });
  const aviso = el("p", { class: "pequeno oculto", style: { marginTop: "6px", color: "var(--alerta)" } });

  const area = el("textarea", {
    class: "campo",
    name: "texto",
    rows: 9,
    required: true,
    style: { fontFamily: "inherit", lineHeight: "1.5" },
    oninput: (e) => conferirVariaveis(e.target.value),
  }, modelo?.texto ?? "");

  function conferirVariaveis(texto) {
    const erradas = variaveisDesconhecidas(texto);
    aviso.classList.toggle("oculto", erradas.length === 0);
    if (erradas.length) {
      aviso.textContent =
        `Não conheço ${erradas.map((v) => `{${v}}`).join(", ")} — vai sair assim mesmo na mensagem.`;
    }
  }

  /* Clicar na variável escreve no ponto onde o cursor está. Copiar da
     lista à mão é onde nascem os {nome } e {Nome} que não funcionam. */
  function inserir(chave) {
    const marca = `{${chave}}`;
    const inicio = area.selectionStart ?? area.value.length;
    const fim = area.selectionEnd ?? area.value.length;
    area.value = area.value.slice(0, inicio) + marca + area.value.slice(fim);
    area.focus();
    area.setSelectionRange(inicio + marca.length, inicio + marca.length);
    conferirVariaveis(area.value);
  }

  const grupoAssunto = el(
    "div",
    { class: `grupo ${modelo?.canal === "email" ? "" : "oculto"}` },
    [
      el("span", { class: "rotulo" }, "Assunto do e-mail"),
      el("input", { class: "campo", name: "assunto", value: modelo?.assunto ?? "" }),
    ],
  );

  const form = el("form", { onsubmit: enviar }, [
    el("div", { class: "dupla" }, [
      grupo("Nome do modelo", el("input", {
        class: "campo",
        name: "nome",
        required: true,
        value: modelo?.nome ?? "",
        placeholder: "Lembrete de horário",
      })),
      grupo(
        "Canal",
        el(
          "select",
          {
            class: "campo",
            name: "canal",
            onchange: (e) => grupoAssunto.classList.toggle("oculto", e.target.value !== "email"),
          },
          Object.values(CANAIS).map((c) =>
            el("option", { value: c.id, selected: c.id === (modelo?.canal ?? "whatsapp") },
              `${c.emblema}  ${c.nome}`),
          ),
        ),
      ),
    ]),

    grupoAssunto,

    grupo("Mensagem", area, aviso),

    el("p", { class: "rotulo", style: { marginTop: "14px", marginBottom: "6px" } }, "Variáveis"),
    el(
      "div",
      { class: "variaveis" },
      VARIAVEIS.map((v) =>
        el(
          "button",
          {
            type: "button",
            class: "chip-variavel",
            title: `${v.descricao} — ex.: ${v.exemplo}`,
            onclick: () => inserir(v.chave),
          },
          `{${v.chave}}`,
        ),
      ),
    ),

    erro,

    el("div", { class: "modal-acoes" }, [
      el("button", { class: "btn btn-secundario", type: "button", onclick: fecharModal }, "Cancelar"),
      el("button", { class: "btn btn-primario", type: "submit" }, "Salvar"),
    ]),

    modelo
      ? el(
          "button",
          {
            class: "btn btn-fantasma btn-bloco btn-mini",
            type: "button",
            style: { marginTop: "8px", color: "var(--erro)" },
            onclick: excluir,
          },
          "Excluir modelo",
        )
      : null,
  ]);

  async function enviar(evento) {
    evento.preventDefault();
    erro.classList.add("oculto");
    const botao = form.querySelector('button[type="submit"]');

    try {
      await comCarregamento(botao, "Salvando…", () =>
        salvarModelo(barbearia.id, { ...dadosDoForm(form), id: modelo?.id }),
      );
      fecharModal();
      sucesso("Modelo salvo.");
      recarregarRota();
    } catch (falhou) {
      erro.textContent = mensagemDeErro(falhou);
      erro.classList.remove("oculto");
    }
  }

  async function excluir() {
    fecharModal();
    const ok = await confirmar(
      "Excluir modelo",
      "O histórico das mensagens já enviadas com ele continua guardado.",
      "Excluir",
    );
    if (!ok) return;
    try {
      await excluirModelo(barbearia.id, modelo.id);
      sucesso("Modelo excluído.");
      recarregarRota();
    } catch (falhou) {
      falha(mensagemDeErro(falhou));
    }
  }

  conferirVariaveis(area.value);
  abrirModal(modelo ? `Editar ${modelo.nome}` : "Novo modelo", form);
}

/* ------------------------------------------------------------------ */
/* Modo local                                                          */
/* ------------------------------------------------------------------ */
function secaoModoLocal() {
  if (!modoLocal) return null;

  return el("section", { class: "cartao cartao-corpo secao" }, [
    el("h2", {}, "Modo local"),
    el("p", { class: "suave pequeno", style: { margin: "4px 0 12px" } },
      "Os dados estão apenas neste navegador (localStorage). Nada é enviado para a internet, e limpar os dados do site apaga tudo. Para passar a gravar de verdade, troque MODO para \"firebase\" em js/config/firebase-config.js."),

    el("div", { class: "linha", style: { flexWrap: "wrap" } }, [
      el(
        "button",
        {
          class: "btn btn-secundario",
          type: "button",
          onclick: async () => {
            const ok = await confirmar(
              "Recriar demonstração",
              "Todos os cadastros e agendamentos atuais serão apagados e a barbearia de exemplo volta ao estado original.",
              "Recriar",
            );
            if (!ok) return;
            resetarDados();
            location.reload();
          },
        },
        "Recriar dados de demonstração",
      ),
      el(
        "button",
        {
          class: "btn btn-secundario",
          type: "button",
          onclick: () => {
            console.log(window.agendia?.dados?.());
            toast("Dados despejados no console do navegador (F12).", "info", 5000);
          },
        },
        "Inspecionar dados no console",
      ),
    ]),
  ]);
}

/* ------------------------------------------------------------------ */
/* Identidade visual                                                   */
/* ------------------------------------------------------------------ */
function secaoIdentidade(barbearia, gestor) {
  const erro = el("div", { class: "aviso aviso-erro oculto" });

  const campo = campoImagem({
    valorInicial: barbearia.logoUrl ?? null,
    perfil: PERFIL_LOGO,
    textoVazio: "sem logo",
    dica: "PNG com fundo transparente fica melhor. Reduzimos automaticamente.",
    aoMudar: () => atualizarPrevia(),
  });

  const previaTopo = el("div", {
    class: "cartao cartao-corpo centro",
    style: { marginTop: "14px", background: "var(--superficie-2)" },
  });

  function atualizarPrevia() {
    render(
      previaTopo,
      el("p", { class: "rotulo", style: { marginBottom: "8px" } }, "Como vai aparecer"),
      marcaBarbearia({ ...barbearia, logoUrl: campo.valor() }, { altura: 48 }),
    );
  }

  const botao = el("button", { class: "btn btn-primario", type: "button", onclick: enviar }, "Salvar logo");

  async function enviar() {
    erro.classList.add("oculto");
    try {
      await comCarregamento(botao, "Salvando…", async () => {
        await salvarLogo(barbearia.id, campo.valor());
        await atualizarBarbeariaNoContexto();
      });
      sucesso("Logo salva.");
      // a barra superior mostra a logo: precisa ser remontada
      location.reload();
    } catch (falhou) {
      erro.textContent = mensagemDeErro(falhou);
      erro.classList.remove("oculto");
    }
  }

  const conteudo = el("div", {}, [
    el("fieldset", { disabled: !gestor, style: { border: "none" } }, [
      campo.elemento,
      previaTopo,
      erro,
      gestor ? el("div", { style: { marginTop: "14px" } }, botao) : null,
    ]),
  ]);

  atualizarPrevia();

  return el("section", { class: "cartao cartao-corpo secao" }, [
    el("h2", {}, "Logo da barbearia"),
    el("p", { class: "suave pequeno", style: { margin: "4px 0 14px" } },
      "Aparece no topo do painel e no seu link de agendamento. Sem logo, mostramos o nome da barbearia."),
    conteudo,
  ]);
}

/* ------------------------------------------------------------------ */
/* Link público                                                        */
/* ------------------------------------------------------------------ */
function secaoLink(barbearia) {
  const url = linkPublico(barbearia.slug);

  return el("section", { class: "cartao cartao-corpo secao" }, [
    el("h2", {}, "Link de agendamento"),
    el("p", { class: "suave pequeno", style: { margin: "4px 0 12px" } },
      "Cole no Instagram e no WhatsApp. O endereço não muda depois de criado — seus clientes podem já tê-lo salvo."),
    el("p", { class: "resumo num", style: { overflowWrap: "anywhere" } }, url),
    el("div", { class: "linha", style: { marginTop: "12px", flexWrap: "wrap" } }, [
      el(
        "button",
        {
          class: "btn btn-secundario",
          type: "button",
          onclick: async (e) => {
            try {
              await navigator.clipboard.writeText(url);
              const antes = e.target.textContent;
              e.target.textContent = "Copiado!";
              setTimeout(() => (e.target.textContent = antes), 1800);
            } catch {
              toast("Copie o endereço acima manualmente.", "info", 5000);
            }
          },
        },
        "Copiar link",
      ),
      el("a", { class: "btn btn-secundario", href: url, target: "_blank", rel: "noreferrer" }, "Abrir"),
    ]),
  ]);
}

/* ------------------------------------------------------------------ */
/* Dados                                                               */
/* ------------------------------------------------------------------ */
function secaoDados(barbearia, gestor) {
  const erro = el("div", { class: "aviso aviso-erro oculto" });
  const T = termos(barbearia);

  const form = el("form", { onsubmit: enviar }, [
    el("fieldset", { disabled: !gestor, style: { border: "none" } }, [
      el("div", { class: "dupla" }, [
        grupo("Nome", el("input", { class: "campo", name: "nome", required: true, value: barbearia.nome })),
        /* O SEGMENTO NÃO SE EDITA AQUI.
           Ele é escolhido no cadastro e define o vocabulário do sistema
           inteiro para esta conta. Trocar de ramo é outro cadastro, não
           uma edição de perfil — quem altera é a administração da
           plataforma, e a regra do Firestore recusa a gravação vinda
           daqui mesmo que alguém chame a API na mão. */
        grupo(
          "Segmento",
          el("p", { class: "campo campo-leitura" },
            `${T.segmento.emblema}  ${T.segmento.nome}`),
          el("p", { class: "fraco pequeno", style: { marginTop: "6px" } },
            "Define o vocabulário do sistema inteiro e não muda depois do cadastro. Para corrigir, fale com a administração da plataforma."),
        ),
      ]),

      el("div", { class: "dupla" }, [
        grupo(
          "Fuso horário",
          el(
            "select",
            { class: "campo", name: "timezone" },
            FUSOS_BRASIL.map((f) =>
              el("option", { value: f.id, selected: f.id === barbearia.timezone }, f.nome),
            ),
          ),
        ),
      ]),

      el("div", { class: "dupla" }, [
        grupo("Telefone", el("input", {
          class: "campo",
          name: "telefone",
          type: "tel",
          value: telefone(barbearia.telefone),
          oninput: (e) => (e.target.value = mascararTelefone(e.target.value)),
        })),
        grupo("WhatsApp", el("input", {
          class: "campo",
          name: "whatsapp",
          type: "tel",
          value: telefone(barbearia.whatsapp),
          oninput: (e) => (e.target.value = mascararTelefone(e.target.value)),
        })),
      ]),

      el("div", { class: "dupla" }, [
        grupo("Endereço", el("input", {
          class: "campo",
          name: "endereco",
          value: barbearia.endereco ?? "",
          placeholder: "Rua, número, bairro",
        })),
        grupo("Instagram", el("input", {
          class: "campo",
          name: "instagram",
          value: barbearia.instagram ?? "",
          placeholder: "barbeariaalpha",
        })),
      ]),

      erro,

      gestor
        ? el("button", { class: "btn btn-primario", type: "submit" }, "Salvar dados")
        : null,
    ]),
  ]);

  async function enviar(evento) {
    evento.preventDefault();
    erro.classList.add("oculto");
    const botao = form.querySelector('button[type="submit"]');

    try {
      await comCarregamento(botao, "Salvando…", async () => {
        await salvarDadosBarbearia(barbearia.id, dadosDoForm(form));
        await atualizarBarbeariaNoContexto();
      });
      sucesso("Dados salvos.");
      recarregarRota();
    } catch (falhou) {
      erro.textContent = mensagemDeErro(falhou);
      erro.classList.remove("oculto");
    }
  }

  return el("section", { class: "cartao cartao-corpo secao" }, [
    el("h2", { style: { marginBottom: "14px" } }, "Dados da barbearia"),
    form,
  ]);
}

/* ------------------------------------------------------------------ */
/* Horário de funcionamento                                            */
/* ------------------------------------------------------------------ */
function secaoHorarios(barbearia, gestor) {
  const atuais = barbearia.horarios ?? horariosPadrao();
  const erro = el("div", { class: "aviso aviso-erro oculto" });

  const linhas = DIAS_SEMANA.map((nome, dia) => {
    const h = atuais[dia] ?? atuais[String(dia)] ?? { ativo: false, abre: "09:00", fecha: "19:00" };
    return el(
      "div",
      {
        class: "linha",
        style: {
          flexWrap: "wrap",
          gap: "10px",
          padding: "10px 12px",
          marginBottom: "8px",
          background: "var(--superficie-2)",
          border: "1px solid var(--borda)",
          borderRadius: "var(--raio-sm)",
        },
      },
      [
        el("label", { class: "marcador", style: { width: "132px" } }, [
          el("input", { type: "checkbox", name: `ativo_${dia}`, checked: h.ativo }),
          nome,
        ]),
        el("input", { class: "campo", style: { width: "110px" }, type: "time", name: `abre_${dia}`, value: h.abre, "aria-label": `Abertura ${nome}` }),
        el("span", { class: "fraco pequeno" }, "às"),
        el("input", { class: "campo", style: { width: "110px" }, type: "time", name: `fecha_${dia}`, value: h.fecha, "aria-label": `Fechamento ${nome}` }),
      ],
    );
  });

  const form = el("form", { onsubmit: enviar }, [
    el("fieldset", { disabled: !gestor, style: { border: "none" } }, [
      ...linhas,
      erro,
      gestor
        ? el("button", { class: "btn btn-primario", type: "submit", style: { marginTop: "8px" } }, "Salvar horários")
        : null,
    ]),
  ]);

  async function enviar(evento) {
    evento.preventDefault();
    erro.classList.add("oculto");
    const dados = dadosDoForm(form);
    const botao = form.querySelector('button[type="submit"]');

    const horarios = {};
    for (let dia = 0; dia <= 6; dia++) {
      const abre = dados[`abre_${dia}`] || "09:00";
      const fecha = dados[`fecha_${dia}`] || "19:00";
      if (fecha <= abre) {
        erro.textContent = `${DIAS_SEMANA[dia]}: o fechamento precisa ser depois da abertura.`;
        erro.classList.remove("oculto");
        return;
      }
      horarios[dia] = { ativo: Boolean(dados[`ativo_${dia}`]), abre, fecha };
    }

    try {
      await comCarregamento(botao, "Salvando…", async () => {
        await salvarHorarios(barbearia.id, horarios);
        await atualizarBarbeariaNoContexto();
      });
      sucesso("Horários salvos.");
      recarregarRota();
    } catch (falhou) {
      erro.textContent = mensagemDeErro(falhou);
      erro.classList.remove("oculto");
    }
  }

  return el("section", { class: "cartao cartao-corpo secao" }, [
    el("h2", {}, "Horário de funcionamento"),
    el("p", { class: "suave pequeno", style: { margin: "4px 0 14px" } },
      "É a faixa de horários que aparece no link público."),
    form,
  ]);
}

/* ------------------------------------------------------------------ */
/* Bloqueios                                                           */
/* ------------------------------------------------------------------ */
function secaoBloqueios(barbearia, barbeiros, bloqueios, hoje) {
  const T = termos(barbearia);
  const F = flexoes(barbearia);
  const erro = el("div", { class: "aviso aviso-erro oculto" });
  const nomePorId = new Map(barbeiros.map((b) => [b.id, b.nome]));

  const form = el("form", { onsubmit: enviar }, [
    el("div", { class: "dupla" }, [
      grupo("Data", el("input", { class: "campo", name: "dia", type: "date", required: true, min: hoje })),
      grupo(
        maiuscula(T.profissional),
        el(
          "select",
          { class: "campo", name: "barbeiroId" },
          [
            el("option", { value: "" }, maiuscula(F.inteiro)),
            ...barbeiros.map((b) => el("option", { value: b.id }, b.nome)),
          ],
        ),
      ),
    ]),

    el("div", { class: "dupla" }, [
      grupo("Das", el("input", { class: "campo", name: "inicio", type: "time", value: "00:00" })),
      grupo("Até", el("input", { class: "campo", name: "fim", type: "time", value: "23:59" })),
    ]),

    grupo("Motivo (opcional)", el("input", {
      class: "campo",
      name: "motivo",
      placeholder: "Feriado municipal, férias, almoço…",
    })),

    erro,

    el("button", { class: "btn btn-secundario", type: "submit" }, "Adicionar bloqueio"),
  ]);

  async function enviar(evento) {
    evento.preventDefault();
    erro.classList.add("oculto");
    const botao = form.querySelector('button[type="submit"]');

    try {
      await comCarregamento(botao, "Adicionando…", () =>
        criarBloqueio(barbearia.id, dadosDoForm(form)),
      );
      sucesso("Bloqueio adicionado.");
      recarregarRota();
    } catch (falhou) {
      erro.textContent = mensagemDeErro(falhou);
      erro.classList.remove("oculto");
    }
  }

  async function remover(bloqueio) {
    const ok = await confirmar("Remover bloqueio", "O horário volta a aceitar agendamentos.", "Remover");
    if (!ok) return;
    try {
      await excluirBloqueio(barbearia.id, bloqueio.id);
      sucesso("Bloqueio removido.");
      recarregarRota();
    } catch (falhou) {
      falha(mensagemDeErro(falhou));
    }
  }

  return el("section", { class: "cartao cartao-corpo secao" }, [
    el("h2", {}, "Folgas e bloqueios"),
    el("p", { class: "suave pequeno", style: { margin: "4px 0 14px" } },
      `Feriados, férias e intervalos. Sem ${T.profissional} selecionado, fecha ${F.o} inteir${F.feminino ? "a" : "o"} no período.`),
    form,

    bloqueios.length === 0
      ? el("p", { class: "fraco pequeno", style: { marginTop: "16px" } },
          "Nenhum bloqueio futuro cadastrado.")
      : el(
          "ul",
          { class: "lista", style: { marginTop: "16px", borderTop: "1px solid var(--borda)" } },
          bloqueios.map((b) =>
            el("li", {}, [
              el("div", { class: "item", style: { paddingInline: "0" } }, [
                el("div", { class: "crescer" }, [
                  el("p", { class: "pequeno", style: { fontWeight: "500" } },
                    `${dataCurta(b.dia)} · ${minutosParaHora(b.inicioMin)} às ${minutosParaHora(b.fimMin)}`),
                  el("p", { class: "pequeno suave" },
                    [
                      b.barbeiroId
                        ? (nomePorId.get(b.barbeiroId) ?? maiuscula(T.profissional))
                        : maiuscula(F.inteiro),
                      b.motivo,
                    ]
                      .filter(Boolean)
                      .join(" — ")),
                ]),
                el(
                  "button",
                  { class: "btn btn-fantasma btn-mini", type: "button", style: { color: "var(--erro)" }, onclick: () => remover(b) },
                  "Remover",
                ),
              ]),
            ]),
          ),
        ),
  ]);
}

function grupo(rotulo, ...filhos) {
  return el("div", { class: "grupo" }, [el("span", { class: "rotulo" }, rotulo), ...filhos]);
}
