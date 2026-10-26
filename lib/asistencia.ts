// Cuentas de asistencia sobre una reunión y sus asistencias. Viven acá porque
// las comparten el resumen del grupo (discipulado/[id]) y las grillas de roster
// (discipulado/discipulos y ministerio/integrantes): las pantallas muestran los
// mismos números y no pueden irse separando.
//
// Sirven para los dos libros (`reuniones` + `asistencias` y
// `reuniones_ministerio` + `asistencias_ministerio`) porque los dos RPC
// registran igual: una fila por integrante del roster, presente o no.
export type ReunionConPresentes = {
  id: string;
  fecha: string;
  asistencias: { miembro_id: string; presente: boolean }[];
};

// Cuántas reuniones seguidas sin venir disparan el aviso.
export const FALTAS_PARA_AVISAR = 3;

// La ventana que se mira: las últimas N reuniones (un mes, más o menos). Son
// las columnas de la grilla y el "últimas 4" del resumen.
export const REUNIONES_A_LA_VISTA = 4;

export type EstadoAsistencia = "presente" | "ausente" | "sin-registro";

// `registrar_reunion` (y su espejo de ministerios) guarda una fila por integrante del roster, presente o no.
// Que alguien no tenga fila quiere decir que esa vez todavía no era del grupo:
// eso no es una falta.
export function estadoEn(reunion: ReunionConPresentes, miembroId: string): EstadoAsistencia {
  const a = reunion.asistencias.find((x) => x.miembro_id === miembroId);
  if (!a) return "sin-registro";
  return a.presente ? "presente" : "ausente";
}

// Faltas seguidas, de la reunión más reciente hacia atrás (`reuniones` llega
// ordenada de la más nueva a la más vieja). Corta en la primera a la que vino
// o en la primera donde no figura.
export function faltasSeguidas(reuniones: ReunionConPresentes[], miembroId: string): number {
  let faltas = 0;
  for (const r of reuniones) {
    if (estadoEn(r, miembroId) !== "ausente") break;
    faltas++;
  }
  return faltas;
}

// Porcentaje de asistencia sobre las reuniones dadas: de una persona si viene
// `miembroId`, del grupo entero si no. null cuando no hay nada que promediar.
export function porcentajePresentes(
  reuniones: ReunionConPresentes[],
  miembroId?: string
): number | null {
  const filas = reuniones.flatMap((r) =>
    miembroId ? r.asistencias.filter((a) => a.miembro_id === miembroId) : r.asistencias
  );
  if (filas.length === 0) return null;
  return Math.round((100 * filas.filter((a) => a.presente).length) / filas.length);
}

// Presentes y total de una reunión (el "6/8" de la grilla y del historial).
export function presentesDe(reunion: ReunionConPresentes): { presentes: number; total: number } {
  return {
    presentes: reunion.asistencias.filter((a) => a.presente).length,
    total: reunion.asistencias.length,
  };
}

// "2026-09-24" -> "24/9", el encabezado de cada columna de la grilla.
export function etiquetaColumna(fecha: string): string {
  const [, mes, dia] = fecha.split("-").map(Number);
  return `${dia}/${mes}`;
}
