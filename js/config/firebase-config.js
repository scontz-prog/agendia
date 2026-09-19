/**
 * ┌──────────────────────────────────────────────────────────────────┐
 * │  A CHAVE DE MODO — é o único ajuste desta etapa                  │
 * └──────────────────────────────────────────────────────────────────┘
 *
 *   "local"     → tudo roda no navegador, sobre localStorage, com uma
 *                 barbearia de demonstração já montada. Não precisa de
 *                 conta, projeto, internet nem Firebase. É o modo de
 *                 avaliar a estrutura e testar as funcionalidades.
 *
 *   "firebase"  → usa o Firebase de verdade. Antes de virar a chave,
 *                 preencha `firebaseConfig` abaixo e publique o
 *                 `firestore.rules`. O passo a passo está no README.
 *
 * A troca não exige mexer em mais nenhum arquivo: as duas
 * implementações expõem exatamente a mesma interface.
 */
export const MODO = "firebase";

/**
 * Credenciais do projeto Firebase — só usadas quando MODO = "firebase".
 *
 * Pegue em: console.firebase.google.com › Configurações do projeto ›
 * Seus aplicativos › App da Web › Configuração do SDK.
 *
 * Estes valores são PÚBLICOS por natureza — ficam no navegador de quem
 * abre o site, e não tem como escondê-los num site estático. Quem
 * protege os dados são as regras do Firestore (firestore.rules), não o
 * sigilo destas chaves. Nunca coloque aqui chave de conta de serviço.
 */
export const firebaseConfig = {
  apiKey: "AIzaSyABJ8vroJh3V--Lf_zY-XSviR5SEWGTPzs",
  authDomain: "agendia-5dfef.firebaseapp.com",
  projectId: "agendia-5dfef",
  storageBucket: "agendia-5dfef.firebasestorage.app",
  messagingSenderId: "852610822488",
  appId: "1:852610822488:web:954c06b9c754d461b6752d",
};

/** Versão do SDK carregada do CDN do Google (modo "firebase"). */
export const VERSAO_SDK = "12.17.1";

/** true enquanto o firebaseConfig ainda estiver com os valores de exemplo. */
export const configPendente = firebaseConfig.apiKey === "COLE_SUA_API_KEY";
