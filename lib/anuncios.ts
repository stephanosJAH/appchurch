import { Ionicons } from "@expo/vector-icons";
import { addDays, proximaOcurrencia, toISODate } from "./date";
import { avisos, colors } from "./theme";
import { Ministerio, TipoAnuncio } from "./types";

// Lo que se dibuja de cada tipo de anuncio (0038). La base solo guarda el
// nombre; ícono, etiqueta y color viven acá, así que cambiar un ícono no migra
// nada. Sumar un tipo sí: hay que agregarlo también al check
// `anuncios_tipo_valido`.
//
// `icono` (relleno) es el del selector de tipo al publicar; `iconoLinea`, el
// de contorno que usa el listado, pintado con `tinta`. La etiqueta del tipo, en
// cambio, va en gris: el color solo se mantiene en el urgente (`tintaListado`).
type Icono = keyof typeof Ionicons.glyphMap;
export const TIPOS_ANUNCIO: Record<
  TipoAnuncio,
  { etiqueta: string; icono: Icono; iconoLinea: Icono; tinta: string; fondo: string }
> = {
  informacion: { etiqueta: "Información", icono: "information-circle", iconoLinea: "information-circle-outline", ...avisos.informacion },
  atencion: { etiqueta: "Atención", icono: "warning", iconoLinea: "warning-outline", ...avisos.atencion },
  recordatorio: { etiqueta: "Recordatorio", icono: "alarm", iconoLinea: "alarm-outline", ...avisos.recordatorio },
  urgente: { etiqueta: "Urgente", icono: "alert-circle", iconoLinea: "alert-circle-outline", ...avisos.urgente },
  cambio: { etiqueta: "Cambio", icono: "swap-horizontal", iconoLinea: "swap-horizontal-outline", ...avisos.cambio },
  oracion: { etiqueta: "Oración", icono: "hand-left", iconoLinea: "hand-left-outline", ...avisos.oracion },
  celebracion: { etiqueta: "Celebración", icono: "sparkles", iconoLinea: "sparkles-outline", ...avisos.celebracion },
};

// Color de la etiqueta del tipo en el listado: gris para todos,
// salvo el urgente, que conserva su rojo para que se note entre los demás.
export function tintaListado(tipo: TipoAnuncio): string {
  return tipo === "urgente" ? TIPOS_ANUNCIO.urgente.tinta : colors.onSurfaceVariant;
}

// Orden en el que se ofrecen al publicar.
export const ORDEN_TIPOS_ANUNCIO = Object.keys(TIPOS_ANUNCIO) as TipoAnuncio[];

// Vencimiento por defecto de un anuncio de ministerio: el día de su próxima
// reunión, que es cuando el aviso deja de hacer falta. `vence_el` es inclusivo
// (el anuncio se ve hasta ese día entero), así que una reunión de hoy que
// todavía no empezó vence hoy; si ya pasó la hora, la de la semana que viene.
// Sin día cargado en el ministerio no hay qué proponer: null = sin vencimiento.
export function vencimientoPorDefecto(
  ministerio: Pick<Ministerio, "dia_semana" | "hora_inicio"> | null | undefined,
  ahora = new Date()
): string | null {
  if (ministerio?.dia_semana == null) return null;
  let fecha = proximaOcurrencia([ministerio.dia_semana], ahora);
  if (!fecha) return null;
  if (toISODate(fecha) === toISODate(ahora) && ministerio.hora_inicio) {
    const [h, m] = ministerio.hora_inicio.split(":").map(Number);
    if (ahora.getHours() * 60 + ahora.getMinutes() >= h * 60 + m) fecha = addDays(fecha, 7);
  }
  return toISODate(fecha);
}
