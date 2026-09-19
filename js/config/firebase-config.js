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
export const MODO = "local";

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
  apiKey: "COLE_SUA_API_KEY",
  authDomain: "SEU-PROJETO.firebaseapp.com",
  projectId: "SEU-PROJETO",
  storageBucket: "SEU-PROJETO.firebasestorage.app",
  messagingSenderId: "000000000000",
  appId: "1:000000000000:web:0000000000000000000000",
};

/** Versão do SDK carregada do CDN do Google (modo "firebase"). */
export const VERSAO_SDK = "12.17.1";

/** true enquanto o firebaseConfig ainda estiver com os valores de exemplo. */
export const configPendente = firebaseConfig.apiKey === "COLE_SUA_API_KEY";
