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

export function formatMoneda(n?: number | null): string {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  }).format(n ?? 0);
}
