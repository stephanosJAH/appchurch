import { Ionicons } from "@expo/vector-icons";
import { addDays, proximaOcurrencia, toISODate } from "./date";
import { avisos } from "./theme";
import { Ministerio, TipoAnuncio } from "./types";

// Lo que se dibuja de cada tipo de anuncio (0038). La base solo guarda el
// nombre; ícono, etiqueta y color viven acá, así que cambiar un ícono no migra
// nada. Sumar un tipo sí: hay que agregarlo también al check
// `anuncios_tipo_valido`.
export const TIPOS_ANUNCIO: Record<
  TipoAnuncio,
  { etiqueta: string; icono: keyof typeof Ionicons.glyphMap; tinta: string; fondo: string }
> = {
  informacion: { etiqueta: "Información", icono: "information-circle", ...avisos.informacion },
  atencion: { etiqueta: "Atención", icono: "warning", ...avisos.atencion },
  recordatorio: { etiqueta: "Recordatorio", icono: "alarm", ...avisos.recordatorio },
  urgente: { etiqueta: "Urgente", icono: "alert-circle", ...avisos.urgente },
  cambio: { etiqueta: "Cambio", icono: "swap-horizontal", ...avisos.cambio },
  oracion: { etiqueta: "Oración", icono: "hand-left", ...avisos.oracion },
  celebracion: { etiqueta: "Celebración", icono: "sparkles", ...avisos.celebracion },
};

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
