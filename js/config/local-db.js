/**
 * MODO LOCAL — Firestore e Authentication emulados no navegador.
 *
 * Existe para uma coisa só: permitir avaliar e testar o sistema inteiro
 * antes de criar qualquer projeto no Firebase. Este arquivo expõe
 * exatamente os mesmos nomes que `firebase-real.js`, então NENHUM módulo
 * de `js/dados/` ou `js/paginas/` sabe qual dos dois está rodando.
 * Trocar de modo é uma linha em `firebase-config.js`.
 *
 * Os dados ficam em `localStorage`, ou seja: presos a este navegador,
 * neste computador. Limpar os dados do site apaga tudo. É de propósito —
 * isto é bancada de teste, não banco de produção.
 *
 * A senha da conta de demonstração fica em texto puro no localStorage.
 * Aceitável porque nada aqui sai da máquina e a conta é fictícia; ao
 * virar a chave para o Firebase, quem cuida disso é o Authentication.
 */

import {
  construirDemo,
  CAMINHOS_A_REFAZER,
  fichasDeExemplo,
  CONTA_DEMO,
  CONTA_ADMIN,
} from "./dados-demo.js";

const CHAVE_DOCS = "agendia:local:documentos";
const CHAVE_USUARIOS = "agendia:local:usuarios";
const CHAVE_SESSAO = "agendia:local:sessao";
const CHAVE_VERSAO = "agendia:local:versao";

/**
 * Suba este número sempre que a demonstração ganhar algo novo (uma conta,
 * uma barbearia, um campo). Quem já tem dados no navegador recebe só o que
 * falta, sem perder o que criou testando.
 *
 * 1 — demonstração inicial
 * 2 — conta de administrador, barbearias Beta e Studio, último acesso
 * 3 — acesso de barbeiro restrito à própria agenda
 * 4 — contas de vitrine em segmentos diferentes (salão e clínica)
 * 5 — e-mail em parte das fichas, para a central de mensagens ter o que
 *     mostrar no canal de e-mail
 * 6 — aprovação de cadastro: admin principal, contas aprovadas e uma
 *     conta pendente na fila
 */
const VERSAO_DADOS = 6;

export const modoLocal = true;
export { CONTA_DEMO, CONTA_ADMIN };

/* ================================================================== */
/* Armazenamento                                                       */
/* ================================================================== */

function ler(chave, padrao) {
  try {
    const bruto = localStorage.getItem(chave);
    return bruto ? JSON.parse(bruto) : padrao;
  } catch {
    return padrao;
  }
}

function escrever(chave, valor) {
  localStorage.setItem(chave, JSON.stringify(valor));
}

let documentos = ler(CHAVE_DOCS, null);
let usuarios = ler(CHAVE_USUARIOS, null);

function salvarDocs() {
  escrever(CHAVE_DOCS, documentos);
}

/**
 * Garante que a demonstração exista e esteja atualizada.
 *
 * Primeira visita: monta tudo. Visita seguinte com a demonstração
 * desatualizada: acrescenta apenas o que falta — nunca sobrescreve um
 * documento existente. Sem isso, quem testou o sistema antes de a conta
 * de administrador existir ficaria preso a uma versão antiga da
 * demonstração, sem entender por que o login não funciona.
 */
function garantirDemo() {
  if (!documentos || !usuarios) {
    const demo = construirDemo();
    documentos = demo.documentos;
    usuarios = demo.usuarios;
    persistirTudo();
    return;
  }

  if (Number(ler(CHAVE_VERSAO, 0)) >= VERSAO_DADOS) return;

  const demo = construirDemo();

  // As contas de vitrine e as fichas de exemplo são refeitas; todo o
  // resto é só completado.
  const refazer = [...CAMINHOS_A_REFAZER, ...fichasDeExemplo()];
  for (const caminho of Object.keys(documentos)) {
    const ehFixo = refazer.some(
      (raiz) => caminho === raiz || caminho.startsWith(`${raiz}/`),
    );
    if (ehFixo) delete documentos[caminho];
  }

  for (const [caminho, dados] of Object.entries(demo.documentos)) {
    if (documentos[caminho] === undefined) documentos[caminho] = dados;
  }
  for (const novo of demo.usuarios) {
    const jaExiste = usuarios.some(
      (u) => u.email?.toLowerCase() === novo.email.toLowerCase(),
    );
    if (!jaExiste) usuarios.push(novo);
  }

  persistirTudo();
}

function persistirTudo() {
  salvarDocs();
  escrever(CHAVE_USUARIOS, usuarios);
  escrever(CHAVE_VERSAO, VERSAO_DADOS);
}

garantirDemo();

/** Apaga tudo e recria a demonstração do zero. */
export function resetarDados() {
  localStorage.removeItem(CHAVE_DOCS);
  localStorage.removeItem(CHAVE_USUARIOS);
  localStorage.removeItem(CHAVE_SESSAO);
  localStorage.removeItem(CHAVE_VERSAO);
  documentos = null;
  usuarios = null;
  garantirDemo();
}

/** Deixa o sistema em branco, como uma instalação nova. */
export function limparDados() {
  documentos = {};
  usuarios = [];
  persistirTudo();
  localStorage.removeItem(CHAVE_SESSAO);
}

/** Espelho dos dados, para inspecionar pelo console do navegador. */
export function exportarDados() {
  return JSON.parse(JSON.stringify(documentos));
}

/* ================================================================== */
/* Referências                                                         */
/* ================================================================== */

const ALFABETO = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

function novoId() {
  let id = "";
  const bytes = crypto.getRandomValues(new Uint8Array(20));
  for (const b of bytes) id += ALFABETO[b % ALFABETO.length];
  return id;
}

export const db = { __local: true };

export function collection(_db, ...segmentos) {
  return { __tipo: "col", caminho: segmentos.join("/") };
}

export function doc(primeiro, ...resto) {
  // doc(colRef) -> id automático | doc(colRef, id) | doc(db, "col", id, …)
  if (primeiro && primeiro.__tipo === "col") {
    const id = resto[0] ?? novoId();
    return { __tipo: "doc", caminho: `${primeiro.caminho}/${id}`, id };
  }
  const caminho = resto.join("/");
  return { __tipo: "doc", caminho, id: resto[resto.length - 1] };
}

/* ================================================================== */
/* Consultas                                                           */
/* ================================================================== */

export const where = (campo, operador, valor) => ({ __c: "where", campo, operador, valor });
export const orderBy = (campo, direcao = "asc") => ({ __c: "orderBy", campo, direcao });
export const limit = (quantidade) => ({ __c: "limit", quantidade });

export function query(origem, ...clausulas) {
  return {
    __tipo: "query",
    caminho: origem.caminho,
    clausulas: [...(origem.clausulas ?? []), ...clausulas],
  };
}

/** Documentos filhos diretos de uma coleção (não de subcoleções). */
function filhosDe(caminho) {
  const prefixo = `${caminho}/`;
  const profundidade = prefixo.split("/").length;
  return Object.entries(documentos)
    .filter(([p]) => p.startsWith(prefixo) && p.split("/").length === profundidade)
    .map(([p, dados]) => ({ id: p.split("/").pop(), caminho: p, dados }));
}

function comparar(a, b) {
  if (a === b) return 0;
  if (a === null || a === undefined) return -1;
  if (b === null || b === undefined) return 1;
  if (typeof a === "string" && typeof b === "string") return a < b ? -1 : 1;
  return a < b ? -1 : 1;
}

function passaNoFiltro(dados, { campo, operador, valor }) {
  const atual = dados[campo];

  // O Firestore ordena null antes de qualquer string; um `>=` contra
  // texto descarta os nulos. Reproduzir isso aqui evita que a lista de
  // "clientes sem retorno" se comporte diferente nos dois modos.
  if (atual === null || atual === undefined) {
    return operador === "==" && valor === null;
  }

  switch (operador) {
    case "==":
      return atual === valor;
    case "!=":
      return atual !== valor;
    case ">":
      return comparar(atual, valor) > 0;
    case ">=":
      return comparar(atual, valor) >= 0;
    case "<":
      return comparar(atual, valor) < 0;
    case "<=":
      return comparar(atual, valor) <= 0;
    case "in":
      return Array.isArray(valor) && valor.includes(atual);
    default:
      throw new Error(`Operador não suportado no modo local: ${operador}`);
  }
}

function executar(consulta) {
  let linhas = filhosDe(consulta.caminho);
  const clausulas = consulta.clausulas ?? [];

  for (const c of clausulas.filter((x) => x.__c === "where")) {
    linhas = linhas.filter((l) => passaNoFiltro(l.dados, c));
  }

  for (const c of clausulas.filter((x) => x.__c === "orderBy")) {
    linhas.sort((a, b) => {
      const r = comparar(a.dados[c.campo], b.dados[c.campo]);
      return c.direcao === "desc" ? -r : r;
    });
  }

  const corte = clausulas.find((x) => x.__c === "limit");
  if (corte) linhas = linhas.slice(0, corte.quantidade);

  return linhas;
}

/* ================================================================== */
/* Leitura                                                             */
/* ================================================================== */

const clonar = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));

function instantaneo(caminho) {
  const dados = documentos[caminho];
  return {
    id: caminho.split("/").pop(),
    ref: { __tipo: "doc", caminho },
    exists: () => dados !== undefined,
    data: () => clonar(dados),
  };
}

export async function getDoc(ref) {
  return instantaneo(ref.caminho);
}

export async function getDocs(consulta) {
  const linhas = executar(consulta.__tipo === "col" ? { ...consulta, clausulas: [] } : consulta);
  return {
    size: linhas.length,
    empty: linhas.length === 0,
    docs: linhas.map((l) => instantaneo(l.caminho)),
    forEach(fn) {
      this.docs.forEach(fn);
    },
  };
}

/* ================================================================== */
/* Escrita                                                             */
/* ================================================================== */

const SENTINELA_AGORA = "__navalha_agora__";
export const serverTimestamp = () => SENTINELA_AGORA;

function resolverSentinelas(dados) {
  const saida = {};
  for (const [chave, valor] of Object.entries(dados)) {
    saida[chave] = valor === SENTINELA_AGORA ? new Date().toISOString() : valor;
  }
  return saida;
}

function erroPermissao(mensagem) {
  const erro = new Error(mensagem);
  erro.code = "permission-denied";
  return erro;
}

/**
 * Aplica uma escrita respeitando a mesma restrição que a regra do
 * Firestore impõe em produção: documento de reserva é create-only.
 * É o que garante que a trava de horário duplicado seja testável aqui.
 */
function aplicarSet(caminho, dados, opcoes = {}) {
  const existe = documentos[caminho] !== undefined;

  if (existe && !opcoes.merge && caminho.includes("/reservas/")) {
    throw erroPermissao("Esse horário já está reservado.");
  }

  const resolvido = resolverSentinelas(dados);
  documentos[caminho] =
    opcoes.merge && existe ? { ...documentos[caminho], ...resolvido } : resolvido;
}

export async function setDoc(ref, dados, opcoes) {
  aplicarSet(ref.caminho, dados, opcoes);
  salvarDocs();
}

export async function addDoc(colRef, dados) {
  const id = novoId();
  const caminho = `${colRef.caminho}/${id}`;
  documentos[caminho] = resolverSentinelas(dados);
  salvarDocs();
  return { id, caminho, __tipo: "doc" };
}

export async function updateDoc(ref, dados) {
  if (documentos[ref.caminho] === undefined) {
    const erro = new Error("Documento não encontrado.");
    erro.code = "not-found";
    throw erro;
  }
  documentos[ref.caminho] = { ...documentos[ref.caminho], ...resolverSentinelas(dados) };
  salvarDocs();
}

export async function deleteDoc(ref) {
  delete documentos[ref.caminho];
  salvarDocs();
}

/**
 * Transação. O JavaScript do navegador é de linha única, então nada roda
 * entre a leitura e a escrita — o efeito é o mesmo atomicamente. As
 * escritas ficam em espera e só são aplicadas se o corpo inteiro passar;
 * se algo falhar no meio, nenhuma metade é gravada.
 */
export async function runTransaction(_db, corpo) {
  const pendentes = [];

  const tx = {
    get: async (ref) => instantaneo(ref.caminho),
    set: (ref, dados, opcoes) => pendentes.push(["set", ref.caminho, dados, opcoes]),
    update: (ref, dados) => pendentes.push(["update", ref.caminho, dados]),
    delete: (ref) => pendentes.push(["delete", ref.caminho]),
  };

  const resultado = await corpo(tx);

  const anterior = clonar(documentos);
  try {
    for (const [acao, caminho, dados, opcoes] of pendentes) {
      if (acao === "set") aplicarSet(caminho, dados, opcoes);
      else if (acao === "update") documentos[caminho] = { ...documentos[caminho], ...resolverSentinelas(dados) };
      else delete documentos[caminho];
    }
  } catch (erro) {
    documentos = anterior; // desfaz tudo
    throw erro;
  }

  salvarDocs();
  return resultado;
}

export function writeBatch() {
  const acoes = [];
  return {
    set: (ref, dados, opcoes) => acoes.push(["set", ref.caminho, dados, opcoes]),
    update: (ref, dados) => acoes.push(["update", ref.caminho, dados]),
    delete: (ref) => acoes.push(["delete", ref.caminho]),
    commit: async () => {
      for (const [acao, caminho, dados, opcoes] of acoes) {
        if (acao === "set") aplicarSet(caminho, dados, opcoes);
        else if (acao === "update") documentos[caminho] = { ...documentos[caminho], ...resolverSentinelas(dados) };
        else delete documentos[caminho];
      }
      salvarDocs();
    },
  };
}

export const Timestamp = {
  now: () => ({ toDate: () => new Date() }),
  fromDate: (data) => ({ toDate: () => data }),
};

/* ================================================================== */
/* Authentication                                                      */
/* ================================================================== */

const ouvintes = new Set();
let usuarioAtual = null;

export const auth = {
  get currentUser() {
    return usuarioAtual;
  },
};

function publicar() {
  for (const ouvinte of ouvintes) ouvinte(usuarioAtual);
}

function erroAuth(codigo, mensagem) {
  const erro = new Error(mensagem);
  erro.code = codigo;
  return erro;
}

function comoUsuario(registro) {
  return {
    uid: registro.uid,
    email: registro.email,
    displayName: registro.displayName ?? null,
    isAnonymous: Boolean(registro.isAnonymous),
  };
}

// restaura a sessão de quem já estava logado antes de recarregar a página
(function restaurar() {
  const uid = ler(CHAVE_SESSAO, null);
  const registro = uid && usuarios.find((u) => u.uid === uid);
  if (registro) usuarioAtual = comoUsuario(registro);
})();

export function onAuthStateChanged(_auth, callback) {
  ouvintes.add(callback);
  // assíncrono como o SDK real, para o consumidor não depender da ordem
  queueMicrotask(() => callback(usuarioAtual));
  return () => ouvintes.delete(callback);
}

export async function signInWithEmailAndPassword(_auth, email, senha) {
  const registro = usuarios.find(
    (u) => u.email?.toLowerCase() === String(email).toLowerCase(),
  );
  if (!registro || registro.senha !== senha) {
    throw erroAuth("auth/invalid-credential", "E-mail ou senha incorretos.");
  }
  usuarioAtual = comoUsuario(registro);
  escrever(CHAVE_SESSAO, registro.uid);
  publicar();
  return { user: usuarioAtual };
}

function registrarLogin(email, senha) {
  const normalizado = String(email).toLowerCase().trim();
  if (usuarios.some((u) => u.email?.toLowerCase() === normalizado)) {
    throw erroAuth("auth/email-already-in-use", "Já existe uma conta com esse e-mail.");
  }
  if (String(senha).length < 6) {
    throw erroAuth("auth/weak-password", "A senha precisa ter ao menos 6 caracteres.");
  }

  const registro = { uid: novoId(), email: normalizado, senha, displayName: null };
  usuarios.push(registro);
  escrever(CHAVE_USUARIOS, usuarios);
  return registro;
}

export async function createUserWithEmailAndPassword(_auth, email, senha) {
  const registro = registrarLogin(email, senha);
  usuarioAtual = comoUsuario(registro);
  escrever(CHAVE_SESSAO, registro.uid);
  publicar();
  return { user: usuarioAtual };
}

/**
 * Cria a conta sem mexer na sessão de quem está logado.
 *
 * No Firebase isso exige uma instância secundária do app, porque o SDK
 * troca a sessão ao criar usuário. Aqui é só não tocar em `usuarioAtual`
 * — mas a função existe com o mesmo nome para que a tela de acessos
 * funcione igual nos dois modos.
 */
export async function criarLoginSemTrocarSessao(email, senha) {
  return registrarLogin(email, senha).uid;
}

export async function signInAnonymously() {
  // não persiste: visitante do link público não deve virar sessão do painel
  usuarioAtual = { uid: `anon-${novoId()}`, email: null, displayName: null, isAnonymous: true };
  publicar();
  return { user: usuarioAtual };
}

export async function updateProfile(usuario, { displayName }) {
  const registro = usuarios.find((u) => u.uid === usuario.uid);
  if (registro) {
    registro.displayName = displayName;
    escrever(CHAVE_USUARIOS, usuarios);
  }
  if (usuarioAtual?.uid === usuario.uid) usuarioAtual.displayName = displayName;
}

export async function signOut() {
  usuarioAtual = null;
  localStorage.removeItem(CHAVE_SESSAO);
  publicar();
}

export async function sendPasswordResetEmail(_auth, email) {
  const registro = usuarios.find((u) => u.email?.toLowerCase() === String(email).toLowerCase());
  if (!registro) throw erroAuth("auth/user-not-found", "Não encontramos uma conta com esse e-mail.");
  throw erroAuth(
    "local/sem-email",
    `Modo local: não há envio de e-mail. A senha cadastrada é "${registro.senha}".`,
  );
}

/* ================================================================== */
/* Diagnóstico pelo console                                            */
/* ================================================================== */
if (typeof window !== "undefined") {
  window.agendia = {
    dados: exportarDados,
    resetar: () => {
      resetarDados();
      location.reload();
    },
    limpar: () => {
      limparDados();
      location.reload();
    },
    contaDemo: CONTA_DEMO,
  };
}
