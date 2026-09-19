/**
 * Teste da lógica pura da função. Roda com:  node teste.js
 *
 * Não substitui testar o envio de verdade; cobre o que não dá para
 * conferir a olho — virada de mês, fuso e substituição de variável.
 */

import assert from "node:assert/strict";
import {
  agoraNoFuso,
  somarDias,
  dataLonga,
  minutosParaHora,
  moeda,
  telefoneFormatado,
  aplicarVariaveis,
  valoresDo,
  diasEntre,
  minutosAte,
  TEXTO_CONFIRMACAO,
  TEXTO_LEMBRETE,
  textoAvisoEmpresa,
} from "./texto.js";

let passou = 0;
function teste(nome, fn) {
  try {
    fn();
    passou += 1;
    console.log(`  ok   ${nome}`);
  } catch (erro) {
    console.error(`  FALHOU  ${nome}\n         ${erro.message}`);
    process.exitCode = 1;
  }
}

console.log("\nRelógio e datas");

teste("véspera de um dia comum", () => {
  assert.equal(somarDias("2026-09-08", 1), "2026-09-09");
});

teste("atravessa a virada do mês", () => {
  assert.equal(somarDias("2026-09-30", 1), "2026-10-01");
});

teste("atravessa a virada do ano", () => {
  assert.equal(somarDias("2026-12-31", 1), "2027-01-01");
});

teste("ano bissexto", () => {
  assert.equal(somarDias("2028-02-28", 1), "2028-02-29");
});

teste("dois dias antes", () => {
  assert.equal(somarDias("2026-03-02", 2), "2026-03-04");
});

teste("mesmo dia (diasAntes = 0)", () => {
  assert.equal(somarDias("2026-09-08", 0), "2026-09-08");
});

teste("23h em Brasília ainda é o mesmo dia lá, e não o seguinte em UTC", () => {
  // 2026-09-09T02:00Z = 23h do dia 8 em São Paulo (UTC-3)
  const r = agoraNoFuso("America/Sao_Paulo", new Date("2026-09-09T02:00:00Z"));
  assert.equal(r.dia, "2026-09-08");
  assert.equal(r.hora, 23);
});

teste("mesma hora UTC dá dia e hora diferentes em Manaus", () => {
  const r = agoraNoFuso("America/Manaus", new Date("2026-09-09T02:00:00Z"));
  assert.equal(r.dia, "2026-09-08");
  assert.equal(r.hora, 22); // UTC-4
});

teste("meia-noite não vira hora 24", () => {
  const r = agoraNoFuso("America/Sao_Paulo", new Date("2026-09-09T03:00:00Z"));
  assert.equal(r.hora, 0);
  assert.equal(r.dia, "2026-09-09");
});

console.log("\nFormatação");

// Dois dígitos no dia, igual ao painel — a prévia que o dono aprova e o
// e-mail que o cliente recebe têm que ser a mesma frase.
teste("data por extenso, no formato do painel", () => {
  assert.equal(dataLonga("2026-09-08"), "Terça-feira, 08 de setembro");
});

teste("data no primeiro dia do mês", () => {
  assert.equal(dataLonga("2026-03-01"), "Domingo, 01 de março");
});

teste("hora a partir de minutos", () => {
  assert.equal(minutosParaHora(540), "09:00");
  assert.equal(minutosParaHora(825), "13:45");
  assert.equal(minutosParaHora(0), "00:00");
});

teste("moeda em reais", () => {
  assert.equal(moeda(4000).replace(/ /g, " "), "R$ 40,00");
  assert.equal(moeda(0).replace(/ /g, " "), "R$ 0,00");
});

teste("telefone com 11 e com 10 dígitos", () => {
  assert.equal(telefoneFormatado("79988110006"), "(79) 98811-0006");
  assert.equal(telefoneFormatado("7933110006"), "(79) 3311-0006");
});

console.log("\nVariáveis do modelo");

teste("troca as conhecidas", () => {
  assert.equal(
    aplicarVariaveis("Olá, {nome}, às {hora}", { nome: "Ana", hora: "09:00" }),
    "Olá, Ana, às 09:00",
  );
});

teste("desconhecida sai como está, para o erro aparecer", () => {
  assert.equal(aplicarVariaveis("Oi {inventada}", { nome: "Ana" }), "Oi {inventada}");
});

teste("monta os valores de um agendamento real", () => {
  const v = valoresDo(
    {
      dia: "2026-09-09",
      inicioMin: 540,
      servicoNome: "Corte",
      barbeiroNome: "João",
      precoCentavos: 4000,
      clienteNome: "Carlos Menezes",
    },
    { nome: "Carlos Menezes", email: "carlos@exemplo.com" },
    { nome: "Barbearia Alpha", whatsapp: "79999990000" },
    "https://exemplo.com/agendar.html?b=alpha",
  );

  assert.equal(v.nome, "Carlos");
  assert.equal(v.nome_completo, "Carlos Menezes");
  assert.equal(v.data, "Quarta-feira, 09 de setembro");
  assert.equal(v.hora, "09:00");
  assert.equal(v.servico, "Corte");
  assert.equal(v.profissional, "João");
  assert.equal(v.valor.replace(/ /g, " "), "R$ 40,00");
  assert.equal(v.telefone_estabelecimento, "(79) 99999-0000");
});

teste("modelo do painel sai inteiro, sem chave sobrando", () => {
  const modelo =
    "Olá, {nome}!\n\nSeu horário na {estabelecimento}:\n{data} às {hora}\n{servico} com {profissional}\nValor: {valor}";

  const texto = aplicarVariaveis(
    modelo,
    valoresDo(
      { dia: "2026-09-09", inicioMin: 840, servicoNome: "Escova", barbeiroNome: "Renata", precoCentavos: 5500 },
      { nome: "Ana Paula" },
      { nome: "Salão Bella Vita", telefone: "79988887777" },
    ),
  );

  assert.ok(!texto.includes("{"), `sobrou variável não trocada:\n${texto}`);
  assert.ok(texto.includes("Ana"));
  assert.ok(texto.includes("14:00"));
});

console.log("\nAntecedência do lembrete");

teste("dias entre datas, atravessando o mês", () => {
  assert.equal(diasEntre("2026-09-30", "2026-10-01"), 1);
  assert.equal(diasEntre("2026-09-19", "2026-09-19"), 0);
  assert.equal(diasEntre("2026-12-31", "2027-01-02"), 2);
});

teste("minutos até um horário hoje", () => {
  const agora = { dia: "2026-09-19", minutos: 14 * 60 };
  assert.equal(minutosAte(agora, "2026-09-19", 16 * 60), 120);
});

teste("minutos até amanhã cedo, a partir da noite", () => {
  const agora = { dia: "2026-09-19", minutos: 22 * 60 };
  assert.equal(minutosAte(agora, "2026-09-20", 9 * 60), 11 * 60);
});

teste("horário que já passou dá negativo (não recebe lembrete)", () => {
  const agora = { dia: "2026-09-19", minutos: 15 * 60 };
  assert.ok(minutosAte(agora, "2026-09-19", 14 * 60) < 0);
});

teste("agoraNoFuso também devolve os minutos do dia", () => {
  const r = agoraNoFuso("America/Sao_Paulo", new Date("2026-09-19T17:30:00Z"));
  assert.equal(r.minutos, 14 * 60 + 30); // 14:30 em Brasília
});

console.log("\nTextos dos e-mails");

const ag = {
  dia: "2026-09-20", inicioMin: 600, servicoNome: "Escova", barbeiroNome: "Renata",
  precoCentavos: 5500, clienteNome: "Ana Paula Souza", clienteTelefone: "79988776655",
  clienteEmail: "ana@exemplo.com",
};
const est = { nome: "Salão Teste", whatsapp: "79999990000" };

for (const [nome, t] of [["confirmação", TEXTO_CONFIRMACAO], ["lembrete", TEXTO_LEMBRETE]]) {
  teste(`${nome}: nenhuma variável sobra sem trocar`, () => {
    const v = valoresDo(ag, { nome: ag.clienteNome }, est, "");
    const saida = aplicarVariaveis(t.assunto, v) + "\n" + aplicarVariaveis(t.texto, v);
    assert.ok(!saida.includes("{"), saida);
    assert.ok(saida.includes("Ana") && saida.includes("10:00") && saida.includes("Salão Teste"));
  });
}

teste("aviso à empresa traz os dados do minicadastro", () => {
  const { assunto, texto } = textoAvisoEmpresa(ag, est);
  assert.ok(assunto.includes("Ana Paula Souza"));
  for (const trecho of ["(79) 98877-6655", "ana@exemplo.com", "Escova com Renata", "10:00"]) {
    assert.ok(texto.includes(trecho), `faltou "${trecho}" em:\n${texto}`);
  }
});



console.log(`
${passou} teste(s) passaram.
`);
