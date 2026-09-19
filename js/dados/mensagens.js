/**
 * Central de comunicação — modelos de mensagem e histórico de envios.
 *
 * ETAPA 1: O ENVIO É MANUAL, E ISSO É UMA DECISÃO, NÃO UMA FALTA.
 * O sistema é um site estático: quando ninguém está com o navegador
 * aberto, nada dele está rodando. Mensagem automática às 8h da manhã
 * exige um serviço acordado às 8h da manhã, e disparar pela API oficial
 * exige uma chave secreta — que em JavaScript de navegador qualquer um
 * lê no console e passa a mandar mensagem no nome do estabelecimento.
 *
 * Então aqui o sistema faz tudo o que dá para fazer sem servidor: escolhe
 * os destinatários, troca as variáveis, abre o WhatsApp ou o e-mail com o
 * texto pronto e registra o que saiu. Quem aperta enviar é a pessoa.
 *
 * O QUE ISSO DEIXA PRONTO PARA DEPOIS
 * Modelos, variáveis e histórico ficam no formato que o envio automático
 * vai precisar. Quando existir backend, o que muda é quem chama
 * `registrarEnvio` — não o modelo de dados.
 */

import {
  getDocs,
  getDoc,
  setDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  serverTimestamp,
} from "../config/firebase.js";
import {
  colModelos,
  refModelo,
  colComunicacoes,
  refBarbearia,
  paraLista,
  paraObjeto,
  porOrdem,
} from "./base.js";
import { exigirContaAtiva, contaSuspensa } from "./situacao.js";
import { moeda, telefone as formatarTelefone, dataLonga, minutosParaHora } from "../lib/formato.js";
import { termos } from "../config/segmentos.js";

export const CANAIS = {
  whatsapp: { id: "whatsapp", nome: "WhatsApp", emblema: "💬" },
  email: { id: "email", nome: "E-mail", emblema: "✉️" },
};

/**
 * Variáveis que o autor do modelo pode usar.
 *
 * `exemplo` não é enfeite: é o que a tela mostra ao lado de cada variável
 * e o que alimenta a prévia quando ainda não há cliente selecionado.
 */
export const VARIAVEIS = [
  { chave: "nome", descricao: "Primeiro nome do cliente", exemplo: "Carlos" },
  { chave: "nome_completo", descricao: "Nome como está na ficha", exemplo: "Carlos Menezes" },
  { chave: "estabelecimento", descricao: "Nome do seu negócio", exemplo: "Barbearia Alpha" },
  { chave: "link", descricao: "Seu link de agendamento", exemplo: "…/agendar.html?b=sua-empresa" },
  { chave: "data", descricao: "Data do próximo atendimento", exemplo: "sexta-feira, 14 de agosto" },
  { chave: "hora", descricao: "Horário do próximo atendimento", exemplo: "14:00" },
  { chave: "servico", descricao: "Serviço do próximo atendimento", exemplo: "Corte" },
  { chave: "profissional", descricao: "Quem vai atender", exemplo: "João" },
  { chave: "valor", descricao: "Valor do próximo atendimento", exemplo: "R$ 40,00" },
  { chave: "telefone_estabelecimento", descricao: "Seu telefone de contato", exemplo: "(79) 99999-0000" },
];

/* ------------------------------------------------------------------ */
/* Modelos                                                             */
/* ------------------------------------------------------------------ */

export async function listarModelos(bid) {
  const snap = await getDocs(colModelos(bid));
  return paraLista(snap).sort(porOrdem);
}

export async function obterModelo(bid, id) {
  return paraObjeto(await getDoc(refModelo(bid, id)));
}

export async function salvarModelo(bid, dados) {
  exigirContaAtiva();

  const nome = String(dados.nome ?? "").trim();
  const texto = String(dados.texto ?? "").trim();
  const canal = CANAIS[dados.canal] ? dados.canal : "whatsapp";

  if (nome.length < 2) throw new Error("Dê um nome ao modelo, para achar depois.");
  if (texto.length < 5) throw new Error("Escreva a mensagem.");
  if (texto.length > 4000) throw new Error("A mensagem passou de 4000 caracteres.");

  // Assunto só existe em e-mail, mas WhatsApp e e-mail dividem o mesmo
  // modelo: quem escreveu para um canal e trocou depois não perde o texto.
  const assunto = String(dados.assunto ?? "").trim() || null;

  const corpo = {
    nome,
    canal,
    assunto,
    texto,
    ordem: Number(dados.ordem) || 0,
    atualizadoEm: serverTimestamp(),
  };

  if (dados.id) {
    await setDoc(refModelo(bid, dados.id), corpo, { merge: true });
    return dados.id;
  }

  const ref = await addDoc(colModelos(bid), { ...corpo, criadoEm: serverTimestamp() });
  return ref.id;
}

export async function excluirModelo(bid, id) {
  exigirContaAtiva();
  await deleteDoc(refModelo(bid, id));
}

/**
 * Modelos que toda conta nova recebe.
 *
 * Tela de modelos vazia é tela morta: a pessoa não sabe o que escrever
 * nem que existem variáveis. Três exemplos prontos ensinam a sintaxe e
 * já cobrem os casos mais pedidos — e ela edita em cima.
 */
export function modelosIniciais(barbearia) {
  const T = termos(barbearia);

  return [
    {
      nome: "Lembrete de horário",
      canal: "whatsapp",
      ordem: 1,
      texto:
        `Olá, {nome}! 👋\n\n` +
        `Passando para lembrar do seu horário na *{estabelecimento}*:\n\n` +
        `📅 {data}\n🕐 {hora}\n✂️ {servico} com {profissional}\n\n` +
        `Se precisar remarcar, é só responder esta mensagem.\n\n` +
        `_{estabelecimento}_`,
    },
    {
      nome: `${T.clientes === "pacientes" ? "Pacientes" : "Clientes"} sem retorno`,
      canal: "whatsapp",
      ordem: 2,
      texto:
        `Oi, {nome}! Tudo bem?\n\n` +
        `Faz um tempo que a gente não te vê por aqui na *{estabelecimento}*. ` +
        `Que tal marcar um horário?\n\n` +
        `🔗 {link}\n\n` +
        `_{estabelecimento}_`,
    },
    {
      nome: "Pagamento em aberto",
      canal: "whatsapp",
      ordem: 3,
      texto:
        `Olá, {nome}.\n\n` +
        `Consta um valor em aberto de *{valor}* referente ao atendimento de {data}.\n\n` +
        `Se já tiver sido pago, desconsidere esta mensagem. Qualquer dúvida, ` +
        `fale com a gente pelo {telefone_estabelecimento}.\n\n` +
        `_{estabelecimento}_`,
    },
  ];
}

/**
 * Grava os modelos iniciais — UMA VEZ na vida da conta.
 *
 * A marca fica no documento da conta, e não na contagem de modelos. Se o
 * critério fosse "a lista está vazia", quem apagasse os três de propósito
 * os veria voltar no próximo carregamento, sem entender por quê — e sem
 * nenhuma forma de recusar.
 */
export async function semearModelos(bid, barbearia) {
  if (barbearia?.modelosSemeadosEm) return listarModelos(bid);
  if (contaSuspensa()) return listarModelos(bid);

  const existentes = await listarModelos(bid);

  if (existentes.length === 0) {
    for (const m of modelosIniciais(barbearia)) {
      await addDoc(colModelos(bid), {
        ...m,
        assunto: null,
        criadoEm: serverTimestamp(),
        atualizadoEm: serverTimestamp(),
      });
    }
  }

  await marcarSemeado(bid, barbearia);
  return listarModelos(bid);
}

async function marcarSemeado(bid, barbearia) {
  // Marcar também o objeto em memória: dentro da mesma sessão o contexto
  // não é recarregado, e sem isto a semeadura seria tentada de novo a
  // cada ida e volta entre Mensagens e Configurações.
  if (barbearia) barbearia.modelosSemeadosEm = true;

  try {
    await updateDoc(refBarbearia(bid), { modelosSemeadosEm: serverTimestamp() });
  } catch (erro) {
    // Falhar aqui não estraga nada: sem a marca, a semeadura roda de
    // novo e não faz nada, porque a lista já está cheia.
    console.warn("Não foi possível marcar os modelos como semeados.", erro);
  }
}

/* ------------------------------------------------------------------ */
/* Substituição de variáveis                                           */
/* ------------------------------------------------------------------ */

/** "Carlos Menezes" -> "Carlos". Mensagem com nome inteiro soa cobrança. */
function primeiroNome(nome) {
  return String(nome ?? "").trim().split(/\s+/)[0] || "";
}

/**
 * Monta os valores das variáveis para um cliente.
 *
 * `agendamento` é opcional: nem toda mensagem é sobre um horário. Quando
 * não houver, as variáveis de data/hora/serviço saem vazias em vez de
 * imprimirem "undefined" na cara do cliente.
 */
export function valoresDoCliente(cliente, { barbearia, agendamento = null, link = "" } = {}) {
  return {
    nome: primeiroNome(cliente?.nome),
    nome_completo: String(cliente?.nome ?? "").trim(),
    estabelecimento: barbearia?.nome ?? "",
    link,
    data: agendamento?.dia ? dataLonga(agendamento.dia) : "",
    hora: agendamento?.inicioMin != null ? minutosParaHora(agendamento.inicioMin) : "",
    servico: agendamento?.servicoNome ?? "",
    profissional: agendamento?.barbeiroNome ?? "",
    valor: agendamento?.precoCentavos != null ? moeda(agendamento.precoCentavos) : "",
    telefone_estabelecimento: barbearia?.whatsapp || barbearia?.telefone
      ? formatarTelefone(barbearia.whatsapp || barbearia.telefone)
      : "",
  };
}

/** Valores de exemplo, para a prévia antes de escolher destinatário. */
export function valoresDeExemplo() {
  return Object.fromEntries(VARIAVEIS.map((v) => [v.chave, v.exemplo]));
}

/**
 * Troca {variavel} pelo valor. Variável desconhecida sai como está — some
 * do texto seria pior: a pessoa não descobriria que escreveu errado.
 */
export function aplicarVariaveis(texto, valores) {
  return String(texto ?? "").replace(/\{(\w+)\}/g, (original, chave) =>
    chave in valores ? valores[chave] : original,
  );
}

/** Variáveis usadas no texto que não existem — para avisar quem escreve. */
export function variaveisDesconhecidas(texto) {
  const conhecidas = new Set(VARIAVEIS.map((v) => v.chave));
  const usadas = [...String(texto ?? "").matchAll(/\{(\w+)\}/g)].map((m) => m[1]);
  return [...new Set(usadas.filter((v) => !conhecidas.has(v)))];
}

/* ------------------------------------------------------------------ */
/* Canais de envio                                                     */
/* ------------------------------------------------------------------ */

/**
 * Link do WhatsApp com o texto já preenchido.
 *
 * Prefixa 55 quando o número vem só com DDD, que é como o sistema guarda.
 * Sem país, o WhatsApp abre uma conversa vazia e a pessoa acha que o
 * sistema não funcionou.
 */
export function linkWhatsApp(telefoneCliente, texto) {
  const numero = String(telefoneCliente ?? "").replace(/\D/g, "");
  if (numero.length < 10) return null;
  const comPais = numero.length <= 11 ? `55${numero}` : numero;
  return `https://wa.me/${comPais}?text=${encodeURIComponent(texto)}`;
}

/**
 * Link de e-mail.
 *
 * Vários destinatários vão em CÓPIA OCULTA, sempre. Um cliente não pode
 * receber a lista de e-mails dos outros clientes do estabelecimento —
 * isso vaza a carteira inteira num campo "para".
 */
export function linkEmail(destinatarios, assunto, texto) {
  const lista = (Array.isArray(destinatarios) ? destinatarios : [destinatarios])
    .map((e) => String(e ?? "").trim())
    .filter((e) => e.includes("@"));

  if (lista.length === 0) return null;

  const partes = [
    `bcc=${encodeURIComponent(lista.join(","))}`,
    `subject=${encodeURIComponent(assunto ?? "")}`,
    `body=${encodeURIComponent(texto ?? "")}`,
  ];

  return `mailto:?${partes.join("&")}`;
}

/* ------------------------------------------------------------------ */
/* Histórico                                                           */
/* ------------------------------------------------------------------ */

/**
 * Registra que uma mensagem foi disparada.
 *
 * "Disparada" e não "entregue": por este caminho o WhatsApp não devolve
 * confirmação nenhuma, e o texto abaixo não pode fingir que devolve. O
 * campo `status` já existe com "enviado" para o dia em que houver
 * backend e webhook — aí ele passa a receber entregue/lido/falhou.
 */
export async function registrarEnvio(bid, { cliente, canal, modelo, texto, assunto = null }) {
  exigirContaAtiva();

  await addDoc(colComunicacoes(bid), {
    clienteId: cliente?.id ?? null,
    clienteNome: cliente?.nome ?? null,
    clienteTelefone: cliente?.telefone ?? null,
    clienteEmail: cliente?.email ?? null,
    canal,
    modeloId: modelo?.id ?? null,
    modeloNome: modelo?.nome ?? null,
    assunto,
    texto,
    status: "enviado",
    enviadoEm: serverTimestamp(),
  });
}

/** Registra o lote inteiro de uma vez. */
export async function registrarEnvios(bid, envios) {
  for (const envio of envios) {
    await registrarEnvio(bid, envio);
  }
}

export async function listarComunicacoes(bid, { clienteId = null } = {}) {
  // Consulta de campo único: filtrar por cliente E ordenar por data
  // exigiria índice composto, que em projeto novo é mais uma etapa de
  // configuração para esquecer. A ordenação é feita aqui.
  const consulta = clienteId
    ? query(colComunicacoes(bid), where("clienteId", "==", clienteId))
    : colComunicacoes(bid);

  const lista = paraLista(await getDocs(consulta));

  return lista.sort((a, b) => tempo(b.enviadoEm) - tempo(a.enviadoEm));
}

function tempo(valor) {
  if (!valor) return 0;
  if (typeof valor.toMillis === "function") return valor.toMillis();
  const d = new Date(valor);
  return Number.isNaN(d.getTime()) ? 0 : d.getTime();
}
