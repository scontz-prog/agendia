/** Formatação para o português do Brasil. */

export function moeda(centavos) {
  return ((centavos ?? 0) / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

/** "45,00" ou "R$ 45" -> 4500 */
export function paraCentavos(texto) {
  const limpo = String(texto ?? "")
    .replace(/[^\d,.-]/g, "")
    .replace(/\.(?=\d{3}\b)/g, "")
    .replace(",", ".");
  const n = Number.parseFloat(limpo);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

export function centavosParaCampo(centavos) {
  return ((centavos ?? 0) / 100).toFixed(2).replace(".", ",");
}

export function digitos(valor) {
  return String(valor ?? "").replace(/\D/g, "");
}

export function telefone(valor) {
  const d = digitos(valor);
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return valor ?? "";
}

/** Máscara aplicada enquanto o usuário digita. */
export function mascararTelefone(valor) {
  const d = digitos(valor).slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

export function duracao(minutos) {
  if (!minutos) return "—";
  if (minutos < 60) return `${minutos} min`;
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
  return m === 0 ? `${h}h` : `${h}h${String(m).padStart(2, "0")}`;
}

/** 570 -> "09:30" */
export function minutosParaHora(minutos) {
  const m = ((minutos % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

/** "09:30" -> 570 */
export function horaParaMinutos(hora) {
  const [h, m] = String(hora ?? "0:0").split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

/** "2026-08-11" -> Date em horário local (sem pular um dia por causa de UTC) */
export function dataDoDia(dia) {
  const [a, m, d] = String(dia).split("-").map(Number);
  return new Date(a, m - 1, d);
}

export function somarDias(dia, quantidade) {
  const d = dataDoDia(dia);
  d.setDate(d.getDate() + quantidade);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

export function diaDaSemana(dia) {
  return dataDoDia(dia).getDay();
}

export function dataCurta(dia) {
  return dataDoDia(dia).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

/**
 * "terça-feira, 11 de agosto" -> "Terça-feira, 11 de agosto".
 * Feito aqui e não com `text-transform: capitalize`, que maiusculiza
 * toda palavra e produz "Terça-Feira, 11 De Agosto".
 */
export function capitalizar(texto) {
  const t = String(texto ?? "");
  return t.charAt(0).toUpperCase() + t.slice(1);
}

export function dataLonga(dia) {
  return capitalizar(
    dataDoDia(dia).toLocaleDateString("pt-BR", {
      weekday: "long",
      day: "2-digit",
      month: "long",
    }),
  );
}

export function diaSemanaCurto(dia) {
  return dataDoDia(dia)
    .toLocaleDateString("pt-BR", { weekday: "short" })
    .replace(".", "");
}

export const DIAS_SEMANA = [
  "Domingo",
  "Segunda",
  "Terça",
  "Quarta",
  "Quinta",
  "Sexta",
  "Sábado",
];

export const ROTULO_STATUS = {
  agendado: "Aguardando confirmação",
  confirmado: "Confirmado",
  realizado: "Realizado",
  cancelado: "Cancelado",
  faltou: "Não compareceu",
};

/** Transforma "Barbearia do João" em "barbearia-do-joao". */
export function paraSlug(texto) {
  return String(texto ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}
