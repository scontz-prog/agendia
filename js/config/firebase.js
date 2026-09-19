/**
 * Seletor de driver.
 *
 * Todo o sistema importa daqui — `import { db, collection } from
 * "../config/firebase.js"`. Este arquivo decide, em tempo de
 * carregamento, se por baixo está o Firestore de verdade ou a emulação
 * local, e repassa a mesma interface nos dois casos.
 *
 * Por isso nenhum módulo de dados ou de tela precisa saber em que modo
 * está rodando, e virar a chave não deixa código morto espalhado.
 */
import { MODO, configPendente } from "./firebase-config.js";

const usarLocal = MODO !== "firebase";

if (!usarLocal && configPendente) {
  throw new Error(
    'MODO está como "firebase", mas firebaseConfig ainda tem os valores de exemplo. ' +
      "Preencha as chaves em js/config/firebase-config.js ou volte MODO para \"local\".",
  );
}

const driver = usarLocal
  ? await import("./local-db.js")
  : await import("./firebase-real.js");

export const modoLocal = driver.modoLocal;
export const auth = driver.auth;
export const db = driver.db;
export const CONTA_DEMO = driver.CONTA_DEMO;
export const CONTA_ADMIN = driver.CONTA_ADMIN;
export const resetarDados = driver.resetarDados;
export const criarLoginSemTrocarSessao = driver.criarLoginSemTrocarSessao;
export { configPendente };

export const {
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
} = driver;

/**
 * No modo Firebase, interrompe cedo e com mensagem clara quando as
 * chaves ainda não foram preenchidas. No modo local não há o que exigir.
 */
export function exigirConfig() {
  if (!modoLocal && configPendente) {
    throw new Error(
      "Firebase não configurado: preencha js/config/firebase-config.js com os dados do seu projeto.",
    );
  }
}

/* ------------------------------------------------------------------ */
/* Selo permanente do modo local                                       */
/*                                                                     */
/* Fica visível em todas as telas de propósito: a pior confusão        */
/* possível nesta etapa seria cadastrar dados reais achando que estão   */
/* salvos na nuvem, quando na verdade vivem só neste navegador.        */
/* ------------------------------------------------------------------ */
if (modoLocal && typeof document !== "undefined") {
  const marcar = () => {
    if (document.querySelector(".selo-local")) return;
    const selo = document.createElement("div");
    selo.className = "selo-local";
    selo.title =
      "Os dados estão apenas neste navegador (localStorage). Nada é enviado para a internet.";
    selo.textContent = "MODO LOCAL — dados apenas neste navegador";
    document.body.prepend(selo);
  };

  if (document.body) marcar();
  else document.addEventListener("DOMContentLoaded", marcar, { once: true });
}
