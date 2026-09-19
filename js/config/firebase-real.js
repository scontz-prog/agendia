/**
 * Driver de produção: Firebase de verdade, SDK carregado do CDN.
 *
 * Só é importado quando MODO = "firebase" em firebase-config.js. Expõe
 * exatamente os mesmos nomes que `local-db.js` — é o que permite trocar
 * de modo sem tocar em nenhum outro arquivo.
 */
import {
  initializeApp,
  deleteApp,
} from "https://www.gstatic.com/firebasejs/12.17.1/firebase-app.js";
import {
  getAuth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInAnonymously,
  signOut,
  onAuthStateChanged,
  updateProfile,
  sendPasswordResetEmail,
} from "https://www.gstatic.com/firebasejs/12.17.1/firebase-auth.js";
import {
  getFirestore,
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  runTransaction,
  writeBatch,
  serverTimestamp,
  Timestamp,
} from "https://www.gstatic.com/firebasejs/12.17.1/firebase-firestore.js";

import { firebaseConfig, APP_CHECK_SITE_KEY } from "./firebase-config.js";

const app = initializeApp(firebaseConfig);

/*
 * App Check ANTES de qualquer outro serviço: os pedidos ao Firestore só
 * levam o comprovante se ele já estiver ativo quando o banco é aberto.
 *
 * Só na instância principal, de propósito. A secundária (criar login de
 * funcionário) fala apenas com o Authentication — e o App Check deve ser
 * aplicado só no Firestore, que é onde está o risco real: agendamento
 * falso pelo link público.
 */
if (APP_CHECK_SITE_KEY) {
  const { initializeAppCheck, ReCaptchaV3Provider } = await import(
    "https://www.gstatic.com/firebasejs/12.17.1/firebase-app-check.js"
  );
  initializeAppCheck(app, {
    provider: new ReCaptchaV3Provider(APP_CHECK_SITE_KEY),
    isTokenAutoRefreshEnabled: true,
  });
}

export const modoLocal = false;
export const auth = getAuth(app);
export const db = getFirestore(app);

// E-mails do Firebase (redefinição de senha) em português. Sem isto eles
// saem no idioma padrão do projeto, inglês — e é o dono de um salão quem
// recebe quando esquece a senha.
auth.languageCode = "pt-BR";

/** No modo Firebase os dados são do servidor: não há o que resetar daqui. */
export function resetarDados() {
  throw new Error("Disponível apenas no modo local.");
}

export const CONTA_DEMO = null;
export const CONTA_ADMIN = null;

/**
 * Cria uma conta de autenticação SEM derrubar quem está logado.
 *
 * O SDK troca a sessão para o usuário recém-criado. Se o dono da
 * barbearia liberasse acesso a um barbeiro, seria expulso do próprio
 * painel no meio da operação — e voltaria logado como o barbeiro. A
 * saída é criar numa instância secundária do app, que tem sessão
 * própria, e destruí-la em seguida. A instância principal nem fica
 * sabendo que isso aconteceu.
 */
export async function criarLoginSemTrocarSessao(email, senha) {
  const secundario = initializeApp(firebaseConfig, `secundario-${crypto.randomUUID()}`);
  try {
    const authSecundario = getAuth(secundario);
    const cred = await createUserWithEmailAndPassword(authSecundario, email, senha);
    await signOut(authSecundario);
    return cred.user.uid;
  } finally {
    await deleteApp(secundario);
  }
}

export {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInAnonymously,
  signOut,
  onAuthStateChanged,
  updateProfile,
  sendPasswordResetEmail,
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  runTransaction,
  writeBatch,
  serverTimestamp,
  Timestamp,
};
