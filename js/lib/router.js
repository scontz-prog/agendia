/**
 * Roteador por hash (#/agenda).
 *
 * Hash em vez de History API porque o GitHub Pages é hospedagem estática:
 * um refresh em /painel/agenda devolveria 404, já que não existe servidor
 * para reescrever a rota. Com hash, o arquivo pedido é sempre o mesmo.
 */

const rotas = new Map();
let container = null;
let aoTrocar = null;
let rotaPadrao = "/";
let tokenAtual = 0;

export function registrar(caminho, render) {
  rotas.set(caminho, render);
}

export function iniciarRoteador({ alvo, padrao = "/", aoNavegar }) {
  container = alvo;
  rotaPadrao = padrao;
  aoTrocar = aoNavegar;
  window.addEventListener("hashchange", resolver);
  resolver();
}

export function rotaAtual() {
  const bruto = location.hash.replace(/^#/, "") || rotaPadrao;
  const [caminho, consulta = ""] = bruto.split("?");
  return { caminho: caminho || rotaPadrao, params: new URLSearchParams(consulta) };
}

export function irPara(caminho) {
  location.hash = caminho;
}

/** Redesenha a rota atual — usado depois de salvar algo. */
export function recarregarRota() {
  resolver();
}

async function resolver() {
  const { caminho, params } = rotaAtual();
  const render = rotas.get(caminho) ?? rotas.get(rotaPadrao);

  if (!render) return;

  aoTrocar?.(caminho);

  // Cada navegação recebe um token. Se o usuário trocar de tela enquanto
  // a busca no Firestore ainda está em voo, o resultado antigo é
  // descartado em vez de sobrescrever a tela nova.
  const meuToken = ++tokenAtual;
  const ehAtual = () => meuToken === tokenAtual;

  container.replaceChildren();
  window.scrollTo(0, 0);

  try {
    await render({ container, params, ehAtual });
  } catch (erro) {
    console.error(erro);
    if (!ehAtual()) return;
    container.replaceChildren();
    const aviso = document.createElement("div");
    aviso.className = "aviso aviso-erro";
    aviso.textContent = erro?.message ?? "Falha ao carregar a tela.";
    container.append(aviso);
  }
}
