/**
 * Sessão do usuário do painel.
 *
 * Guarda em memória o trio usuário + perfil + barbearia. O `barbeariaId`
 * sai sempre do documento `usuarios/{uid}`, nunca da URL ou de um campo
 * de formulário: é o mesmo valor que as regras do Firestore conferem, o
 * que impede que trocar um id na barra de endereço abra outra barbearia.
 */

import {
  auth,
  getDoc,
  updateProfile,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInAnonymously,
  signOut,
  onAuthStateChanged,
  sendPasswordResetEmail,
  exigirConfig,
} from "../config/firebase.js";
import { refUsuario, paraObjeto } from "./base.js";
import { obterBarbearia } from "./barbearias.js";
import { registrarAcesso } from "./admin.js";
import {
  contaSuspensa,
  contaPendente,
  exigirContaAtiva,
  registrarSituacao,
} from "./situacao.js";

let contextoAtual = null;

export function contexto() {
  return contextoAtual;
}

export const barbeariaId = () => contextoAtual?.barbearia?.id ?? null;
export const ehGestor = () =>
  contextoAtual?.perfil?.papel === "dono" || contextoAtual?.perfil?.papel === "gerente";

/* ------------------------------------------------------------------ */
/* Entrada e saída                                                     */
/* ------------------------------------------------------------------ */

export async function entrar(email, senha) {
  exigirConfig();
  const cred = await signInWithEmailAndPassword(auth, email, senha);
  return cred.user;
}

export async function cadastrar(nome, email, senha) {
  exigirConfig();
  const cred = await createUserWithEmailAndPassword(auth, email, senha);
  if (nome) await updateProfile(cred.user, { displayName: nome.trim() });
  return cred.user;
}

export async function recuperarSenha(email) {
  exigirConfig();
  await sendPasswordResetEmail(auth, email);
}

export async function sair() {
  contextoAtual = null;
  registrarSituacao(true);
  await signOut(auth);
}

/**
 * Login anônimo, usado só pela página pública de agendamento.
 * Serve para que as regras possam exigir `request.auth != null` mesmo em
 * quem nunca criou conta, e para que cada visitante tenha uma identidade
 * rastreável se um dia for preciso bloquear abuso.
 */
export async function entrarComoVisitante() {
  exigirConfig();
  if (auth.currentUser) return auth.currentUser;
  const cred = await signInAnonymously(auth);
  return cred.user;
}

/* ------------------------------------------------------------------ */
/* Carregamento do contexto                                            */
/* ------------------------------------------------------------------ */

export async function carregarContexto(usuario) {
  const perfil = paraObjeto(await getDoc(refUsuario(usuario.uid)));
  if (!perfil) {
    contextoAtual = { usuario, perfil: null, barbearia: null };
    registrarSituacao(true);
    return contextoAtual;
  }

  const barbearia = await obterBarbearia(perfil.barbeariaId);
  contextoAtual = { usuario, perfil, barbearia };
  registrarSituacao(barbearia);

  carimbarAcesso(barbearia);
  return contextoAtual;
}

export { contaSuspensa, contaPendente, exigirContaAtiva };

/**
 * Registra que a conta teve uso, no máximo uma vez por hora.
 *
 * É o único sinal que o administrador da plataforma tem de que uma
 * barbearia continua viva — e é deliberadamente o mínimo: um carimbo de
 * data, não um rastro do que foi feito. Falha em silêncio porque atrasar
 * o carregamento do painel por causa de uma métrica seria trocar o
 * essencial pelo acessório.
 */
function carimbarAcesso(barbearia) {
  if (!barbearia) return;

  const anterior = barbearia.ultimoAcessoEm;
  const quando =
    typeof anterior === "string" ? new Date(anterior) : anterior?.toDate?.();

  if (quando && Date.now() - quando.getTime() < 60 * 60 * 1000) return;

  registrarAcesso(barbearia.id).catch(() => {});
}

/** Recarrega os dados da barbearia depois de salvar as configurações. */
export async function atualizarBarbeariaNoContexto() {
  if (!contextoAtual?.perfil) return null;
  contextoAtual.barbearia = await obterBarbearia(contextoAtual.perfil.barbeariaId);
  return contextoAtual.barbearia;
}

/**
 * Observa o estado de autenticação.
 * Devolve, a cada mudança: null (deslogado), {perfil: null} (logado mas
 * ainda sem barbearia — precisa passar pelo onboarding) ou o contexto
 * completo.
 */
export function observarSessao(aoMudar) {
  return onAuthStateChanged(auth, async (usuario) => {
    if (!usuario || usuario.isAnonymous) {
      contextoAtual = null;
      aoMudar(null);
      return;
    }
    try {
      aoMudar(await carregarContexto(usuario));
    } catch (erro) {
      console.error("Falha ao carregar o contexto da sessão", erro);
      aoMudar({ usuario, perfil: null, barbearia: null, erro });
    }
  });
}
