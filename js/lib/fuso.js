/**
 * Relógio da barbearia.
 *
 * Decisão de modelagem: horário de atendimento é gravado como HORA LOCAL
 * DA BARBEARIA (`dia` = "2026-08-11" e `inicioMin` = minutos desde a
 * meia-noite), não como instante UTC. A barbearia é um lugar físico com
 * um fuso só, e o cliente vai até lá — converter para UTC e de volta só
 * cria oportunidade de errar uma hora.
 *
 * O fuso é usado apenas para responder "que horas são AGORA na
 * barbearia", que é o necessário para esconder horários já passados.
 */

const PADRAO = "America/Sao_Paulo";

export const FUSOS_BRASIL = [
  { id: "America/Sao_Paulo", nome: "Brasília (SP, RJ, MG, SE, BA…)" },
  { id: "America/Fortaleza", nome: "Fortaleza (CE, RN, PB, PE, PI)" },
  { id: "America/Belem", nome: "Belém (PA, AP)" },
  { id: "America/Manaus", nome: "Manaus (AM, RR, RO, MT, MS)" },
  { id: "America/Cuiaba", nome: "Cuiabá (MT)" },
  { id: "America/Rio_Branco", nome: "Rio Branco (AC)" },
  { id: "America/Noronha", nome: "Fernando de Noronha" },
];

/** { dia: "2026-08-11", minutos: 834 } no fuso informado. */
export function agoraNaBarbearia(timeZone = PADRAO) {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

  const partes = Object.fromEntries(
    fmt.formatToParts(new Date()).map((p) => [p.type, p.value]),
  );

  return {
    dia: `${partes.year}-${partes.month}-${partes.day}`,
    // "24" aparece à meia-noite em algumas engines
    minutos: (Number(partes.hour) % 24) * 60 + Number(partes.minute),
  };
}

export function hojeNaBarbearia(timeZone = PADRAO) {
  return agoraNaBarbearia(timeZone).dia;
}

/** true se o horário (dia + minutos) já passou na barbearia. */
export function jaPassou(dia, minutos, timeZone = PADRAO) {
  const agora = agoraNaBarbearia(timeZone);
  if (dia < agora.dia) return true;
  if (dia > agora.dia) return false;
  return minutos <= agora.minutos;
}
