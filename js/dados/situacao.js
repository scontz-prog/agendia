/**
 * Situação comercial da conta em uso.
 *
 * Mora num módulo isolado, e não dentro de `sessao.js`, por um motivo
 * concreto: `sessao` precisa importar `barbearias` para carregar o
 * contexto, e `barbearias` precisa consultar a trava antes de gravar. Se
 * a trava morasse em `sessao`, os dois módulos se importariam em círculo.
 *
 * Um pedaço de estado global é o preço; a alternativa seria repetir a
 * verificação em cada tela e esquecê-la em uma delas.
 */

let suspensa = false;
let pendente = false;

/**
 * Chamado por sessao.js sempre que o contexto do usuário muda.
 *
 * São duas situações diferentes, e confundi-las daria mensagem errada:
 * SUSPENSA é decisão comercial sobre uma conta que já funcionou;
 * PENDENTE é a conta que ainda não foi aprovada e nunca funcionou.
 */
export function registrarSituacao(barbearia) {
  // Aceita o documento inteiro ou só o booleano de `ativa`, porque
  // sessao.js chama com `true` nos casos em que não há conta nenhuma.
  const doc = typeof barbearia === "object" && barbearia !== null ? barbearia : { ativa: barbearia };

  suspensa = doc.ativa === false;
  // Sem o campo, a conta é antiga e continua aprovada — um cadastro que
  // já funcionava não pode parar por falta de um campo novo.
  pendente = (doc.aprovacao ?? "aprovada") !== "aprovada";
}

export const contaSuspensa = () => suspensa;

/** true enquanto a plataforma não aprovou (ou rejeitou) o cadastro. */
export const contaPendente = () => pendente;

/**
 * Barra a gravação quando a conta está suspensa.
 *
 * No Firebase quem recusa é a regra `contaAtiva()` — esta checagem não
 * substitui aquela, complementa: dá uma mensagem que o dono da barbearia
 * entende, em vez de um "permission-denied" cru, e faz o modo local se
 * comportar igual ao de produção (lá as regras não rodam, então sem isto
 * a suspensão pareceria não funcionar durante os testes).
 */
export function exigirContaAtiva() {
  if (suspensa) {
    throw new Error(
      "Conta suspensa: não é possível gravar novos dados. " +
        "O histórico continua disponível — fale com a plataforma para reativar.",
    );
  }
}
