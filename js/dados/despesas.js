/**
 * Despesas do estabelecimento.
 *
 * POR QUE ISTO EXISTE
 * O painel já mostrava quanto entrou. Faturamento sozinho não diz se o
 * mês foi bom: um mês de recorde em atendimentos pode fechar no vermelho
 * se o aluguel subiu e o estoque foi reposto. Com as despesas ao lado da
 * receita, a tela passa a responder "sobrou ou faltou", que é a pergunta
 * que o dono realmente faz.
 *
 * ESCOPO DELIBERADO
 * Isto não é um sistema de contabilidade: não há plano de contas, rateio,
 * competência nem conciliação bancária. É um caderno de despesas — data,
 * valor, categoria e descrição — porque é o que um salão preenche de
 * verdade entre um atendimento e outro. Mais campos do que isso viram
 * campos em branco.
 */

import {
  getDocs,
  getDoc,
  setDoc,
  addDoc,
  deleteDoc,
  query,
  where,
  serverTimestamp,
} from "../config/firebase.js";
import { colDespesas, refDespesa, paraLista, paraObjeto } from "./base.js";
import { exigirContaAtiva } from "./situacao.js";

/**
 * Categorias fixas, e poucas.
 *
 * Deixar o dono inventar categoria livre parece mais flexível, mas o que
 * acontece é "produto", "produtos" e "Produtos" virarem três linhas
 * diferentes no relatório. Com lista fechada, o resumo por categoria
 * sempre fecha.
 */
export const CATEGORIAS = {
  aluguel: { id: "aluguel", nome: "Aluguel e condomínio", emblema: "🏠" },
  produtos: { id: "produtos", nome: "Produtos e materiais", emblema: "🧴" },
  pessoal: { id: "pessoal", nome: "Pessoal e comissões", emblema: "👥" },
  contas: { id: "contas", nome: "Água, luz e internet", emblema: "💡" },
  impostos: { id: "impostos", nome: "Impostos e taxas", emblema: "🧾" },
  equipamentos: { id: "equipamentos", nome: "Equipamentos e manutenção", emblema: "🛠️" },
  marketing: { id: "marketing", nome: "Divulgação", emblema: "📣" },
  outros: { id: "outros", nome: "Outros", emblema: "•" },
};

export const LISTA_CATEGORIAS = Object.values(CATEGORIAS);

export const categoria = (id) => CATEGORIAS[id] ?? CATEGORIAS.outros;

/** Despesas de um mês ("2026-10"). Consulta de campo único, sem índice. */
export async function listarDespesasDoMes(bid, mes) {
  const snap = await getDocs(
    query(colDespesas(bid), where("mes", "==", mes)),
  );
  return paraLista(snap).sort((a, b) => String(b.dia).localeCompare(String(a.dia)));
}

/** Despesas de vários meses de uma vez, para a evolução. */
export async function listarDespesasDosMeses(bid, meses) {
  if (meses.length === 0) return [];
  // `in` aceita até 30 valores; a evolução usa 6
  const snap = await getDocs(query(colDespesas(bid), where("mes", "in", meses.slice(0, 30))));
  return paraLista(snap);
}

export async function obterDespesa(bid, id) {
  return paraObjeto(await getDoc(refDespesa(bid, id)));
}

export async function salvarDespesa(bid, dados) {
  exigirContaAtiva();

  const descricao = String(dados.descricao ?? "").trim();
  const dia = String(dados.dia ?? "").trim();
  const centavos = paraCentavos(dados.valor);

  if (descricao.length < 2) throw new Error("Descreva a despesa.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dia)) throw new Error("Informe a data da despesa.");
  if (!(centavos > 0)) throw new Error("Informe um valor maior que zero.");

  const corpo = {
    descricao,
    categoria: CATEGORIAS[dados.categoria] ? dados.categoria : "outros",
    valorCentavos: centavos,
    dia,
    // O mês fica gravado junto para a consulta ser de igualdade, não de
    // intervalo: é o que mantém tudo sem índice composto.
    mes: dia.slice(0, 7),
    observacoes: String(dados.observacoes ?? "").trim() || null,
    atualizadoEm: serverTimestamp(),
  };

  if (dados.id) {
    await setDoc(refDespesa(bid, dados.id), corpo, { merge: true });
    return dados.id;
  }

  const ref = await addDoc(colDespesas(bid), { ...corpo, criadoEm: serverTimestamp() });
  return ref.id;
}

export async function excluirDespesa(bid, id) {
  exigirContaAtiva();
  await deleteDoc(refDespesa(bid, id));
}

/** "1.234,56" ou "1234.56" -> 123456. Aceita o que o dono digitar. */
export function paraCentavos(valor) {
  if (typeof valor === "number") return Math.round(valor * 100);
  const limpo = String(valor ?? "")
    .replace(/[^\d,.-]/g, "")
    .replace(/\.(?=\d{3}\b)/g, "")
    .replace(",", ".");
  const n = Number(limpo);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

/** Soma por categoria, maior primeiro. */
export function porCategoria(despesas) {
  const mapa = new Map();
  for (const d of despesas) {
    const atual = mapa.get(d.categoria) ?? { id: d.categoria, total: 0, quantidade: 0 };
    atual.total += d.valorCentavos ?? 0;
    atual.quantidade += 1;
    mapa.set(d.categoria, atual);
  }
  return [...mapa.values()].sort((a, b) => b.total - a.total);
}

export const somar = (despesas) =>
  despesas.reduce((t, d) => t + (d.valorCentavos ?? 0), 0);
