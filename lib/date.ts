// Utilidades de fecha/hora (locale es-AR, sin dependencias externas).

import { DIAS_SEMANA } from "./types";

// Orden lunes→domingo para presentar días de la semana.
const ORDEN_LUNES = [1, 2, 3, 4, 5, 6, 0];

// Días (0=dom..6=sáb) -> etiqueta legible, ordenada lunes→domingo.
// [2,4] -> "Martes y jueves"; [1] -> "Lunes"; [1,3,5] -> "Lunes, miércoles y viernes".
export function formatDiasSemana(dias: number[]): string {
  const orden = ORDEN_LUNES.filter((d) => dias.includes(d));
  if (orden.length === 0) return "";
  const nombres = orden.map((d, i) =>
    i === 0 ? DIAS_SEMANA[d] : DIAS_SEMANA[d].toLowerCase()
  );
  if (nombres.length === 1) return nombres[0];
  return `${nombres.slice(0, -1).join(", ")} y ${nombres[nombres.length - 1]}`;
}

// Próxima fecha (>= hoy, dentro de 7 días) que caiga en alguno de los días dados
// (0=dom..6=sáb). Sirve para ordenar/ubicar actividades recurrentes. null si vacío.
export function proximaOcurrencia(dias: number[], ref = new Date()): Date | null {
  if (!dias || dias.length === 0) return null;
  const base = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate());
  for (let i = 0; i < 7; i++) {
    const d = addDays(base, i);
    if (dias.includes(d.getDay())) return d;
  }
  return base;
}

export function todayISO(): string {
  return toISODate(new Date());
}

export function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// Lunes como inicio de semana.
export function startOfWeek(ref = new Date()): Date {
  const d = new Date(ref);
  const day = d.getDay(); // 0=domingo
  const diff = (day + 6) % 7; // días desde el lunes
  d.setDate(d.getDate() - diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

// Primer día del mes de `ref`.
export function startOfMonth(ref = new Date()): Date {
  const d = new Date(ref.getFullYear(), ref.getMonth(), 1);
  d.setHours(0, 0, 0, 0);
  return d;
}

// Último día del mes de `ref`.
export function endOfMonth(ref = new Date()): Date {
  const d = new Date(ref.getFullYear(), ref.getMonth() + 1, 0);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function addMonths(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth() + n, 1);
}

// Matriz del mes: semanas (lunes→domingo) que cubren el mes de `ref`,
// incluyendo días de relleno de los meses adyacentes.
export function monthMatrix(ref = new Date()): Date[][] {
  const first = startOfMonth(ref);
  const gridStart = startOfWeek(first); // lunes de la primera semana
  const weeks: Date[][] = [];
  for (let w = 0; w < 6; w++) {
    const week: Date[] = [];
    for (let i = 0; i < 7; i++) week.push(addDays(gridStart, w * 7 + i));
    weeks.push(week);
    // Cortar cuando ya pasamos el fin de mes y completamos la semana.
    const last = week[6];
    if (last.getMonth() !== ref.getMonth() && last > endOfMonth(ref)) break;
  }
  return weeks;
}

export function formatMesAnio(d: Date): string {
  return d.toLocaleDateString("es-AR", { month: "long", year: "numeric" });
}

// "HH:MM:SS" -> "HH:MM"
export function formatHora(hora?: string | null): string {
  if (!hora) return "";
  return hora.slice(0, 5);
}

export function formatFechaCorta(iso: string): string {
  const d = new Date(iso + (iso.length === 10 ? "T00:00:00" : ""));
  return d.toLocaleDateString("es-AR", { day: "2-digit", month: "short" });
}

export function formatFechaLarga(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("es-AR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
  });
}

// ¿Los dos ISO caen en el mismo día calendario (hora local)?
export function mismoDia(isoA: string, isoB: string): boolean {
  return toISODate(new Date(isoA)) === toISODate(new Date(isoB));
}

// ¿La fecha (YYYY-MM-DD) cae dentro de [inicio, fin]? Compara solo por día, no por
// hora — sirve para pintar eventos de varios días (ej. un campamento vie-dom) en
// cada día que abarcan, no solo en el de `fecha_inicio`.
export function fechaEnRango(fechaISO: string, inicioISO: string, finISO: string): boolean {
  const inicio = toISODate(new Date(inicioISO));
  const fin = toISODate(new Date(finISO));
  return fechaISO >= inicio && fechaISO <= fin;
}

// Rango corto para eventos de varios días: "vie 25 jul – dom 27" (mismo mes) o
// "vie 30 jul – sáb 1 ago" (cruza de mes). Para eventos de un solo día usar
// `formatFechaLarga`.
export function formatRangoFechas(isoInicio: string, isoFin: string): string {
  const di = new Date(isoInicio);
  const df = new Date(isoFin);
  const mismoMes = di.getMonth() === df.getMonth() && di.getFullYear() === df.getFullYear();
  const inicio = di.toLocaleDateString("es-AR", { weekday: "short", day: "2-digit", month: "short" });
  const fin = df.toLocaleDateString(
    "es-AR",
    mismoMes ? { weekday: "short", day: "2-digit" } : { weekday: "short", day: "2-digit", month: "short" }
  );
  return `${inicio} – ${fin}`;
}

// "vie 25 jul, 19:00" — fecha corta + hora, para mostrar el inicio/fin de un
// evento de varios días junto a su horario.
export function formatFechaHoraCorta(iso: string): string {
  const d = new Date(iso);
  const fecha = d.toLocaleDateString("es-AR", { weekday: "short", day: "2-digit", month: "short" });
  const hora = formatHora(`${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`);
  return `${fecha}, ${hora}`;
}

// "YYYY-MM-DD" -> Date local (o hoy si está vacío/inválido). Evita el corrimiento
// de timezone de `new Date("YYYY-MM-DD")` (que interpreta UTC).
export function fechaToDate(fecha: string): Date {
  if (/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
    const [y, m, d] = fecha.split("-").map(Number);
    return new Date(y, m - 1, d);
  }
  return new Date();
}

// Date -> "YYYY-MM-DD" (local).
export function dateToFecha(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// "YYYY-MM-DD" -> "martes, 20 de julio de 2026" (o placeholder si es inválido).
export function fechaLabel(fecha: string, placeholder = "Seleccionar fecha"): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return placeholder;
  return fechaToDate(fecha).toLocaleDateString("es-AR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

// Edad en años a partir de "YYYY-MM-DD" (o null si no hay fecha válida).
export function calcularEdad(fechaNacimiento?: string | null): number | null {
  if (!fechaNacimiento || !/^\d{4}-\d{2}-\d{2}$/.test(fechaNacimiento)) return null;
  const nac = fechaToDate(fechaNacimiento);
  const hoy = new Date();
  let edad = hoy.getFullYear() - nac.getFullYear();
  const m = hoy.getMonth() - nac.getMonth();
  if (m < 0 || (m === 0 && hoy.getDate() < nac.getDate())) edad--;
  return edad;
}

// "YYYY-MM-DD" -> "20 de julio" (día y mes, sin año — para cumpleaños).
export function formatCumple(fechaNacimiento?: string | null): string | null {
  if (!fechaNacimiento || !/^\d{4}-\d{2}-\d{2}$/.test(fechaNacimiento)) return null;
  return fechaToDate(fechaNacimiento).toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "long",
  });
}

// Días hasta el próximo cumpleaños a partir de "YYYY-MM-DD" (0 = es hoy).
// null si no hay fecha válida. Ignora el año de nacimiento.
export function diasHastaCumple(
  fechaNacimiento?: string | null,
  ref = new Date()
): number | null {
  if (!fechaNacimiento || !/^\d{4}-\d{2}-\d{2}$/.test(fechaNacimiento)) return null;
  const nac = fechaToDate(fechaNacimiento);
  const hoy = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate());
  let prox = new Date(hoy.getFullYear(), nac.getMonth(), nac.getDate());
  if (prox < hoy) prox = new Date(hoy.getFullYear() + 1, nac.getMonth(), nac.getDate());
  return Math.round((prox.getTime() - hoy.getTime()) / 86400000);
}

// Etiqueta corta para la cuenta regresiva de un cumpleaños.
export function etiquetaCumple(dias: number): string {
  if (dias <= 0) return "¡Hoy!";
  if (dias === 1) return "Mañana";
  if (dias < 7) return `En ${dias} días`;
  if (dias < 14) return "Próxima semana";
  return `En ${dias} días`;
}

// ¿El cumpleaños (día y mes de `fechaNacimiento`) cae en la fecha `d`?
export function esCumpleEn(fechaNacimiento: string | null | undefined, d: Date): boolean {
  if (!fechaNacimiento || !/^\d{4}-\d{2}-\d{2}$/.test(fechaNacimiento)) return false;
  const nac = fechaToDate(fechaNacimiento);
  return nac.getMonth() === d.getMonth() && nac.getDate() === d.getDate();
}

export function formatMoneda(n?: number | null): string {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  }).format(n ?? 0);
}
