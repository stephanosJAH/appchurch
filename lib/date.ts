// Utilidades de fecha/hora (locale es-AR, sin dependencias externas).

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
