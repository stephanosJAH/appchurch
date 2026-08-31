// Videos del canal de YouTube de la iglesia (predicaciones).
//
// Fuente: el feed RSS público del canal
// (`youtube.com/feeds/videos.xml?channel_id=…`). No usa la YouTube Data API a
// propósito: esa API exige una key y, al ser una app móvil, la key viajaría
// dentro del bundle (`EXPO_PUBLIC_*`) al alcance de cualquiera que lo abra —
// cuota de 10k/día quemable por un tercero. El RSS no pide credenciales ni tiene
// cuota.
//
// Lo que se paga a cambio: el feed trae **solo los últimos 15 videos**, sin
// duración y sin distinguir shorts ni vivos de un video normal. Si algún día hace
// falta el historial completo, el camino es proxiar la Data API detrás de una
// Edge Function de Supabase (la key queda en el servidor), no meterla acá.

import { Alert, Linking } from "react-native";

export type VideoYoutube = {
  id: string;
  titulo: string;
  descripcion: string;
  url: string;
  miniatura: string;
  publicado: string; // ISO 8601
  vistas: number | null;
  // El feed no marca el tipo de video, pero el <link> de un short apunta a
  // /shorts/ en vez de /watch — única señal disponible para distinguirlos.
  // `useVideosCanal` descarta los shorts con esto: son recortes del mismo
  // sermón, publicados con idéntico título, y duplicaban la lista.
  esShort: boolean;
};

// ID del canal (`UC…`). No es un secreto: identifica un canal público y viaja en
// el bundle igual que la URL de Supabase. Se deja como constante para que el APK
// de EAS salga siempre con el canal correcto sin depender de que la variable esté
// cargada en el entorno del build; la env var queda como override para pruebas.
// Canal "Puertas de Adoracion" (@puertasdeadoracion1944).
const CANAL_POR_DEFECTO = "UCw0CF1ASiCsY8lBLIaMKbtw";

export const CANAL_ID = process.env.EXPO_PUBLIC_YOUTUBE_CHANNEL_ID || CANAL_POR_DEFECTO;

// Sin canal configurado la sección entera se apaga en vez de mostrar un error.
export const hayCanal = CANAL_ID.length > 0;

export const URL_CANAL = `https://www.youtube.com/channel/${CANAL_ID}`;

/* ============================ Parseo del feed ============================ */

// Los IDs de video de YouTube son 11 caracteres del alfabeto base64url. Todo lo
// que salga del feed se valida contra esto antes de construir una URL: el XML es
// contenido remoto que no controlamos, y de acá salen `Linking.openURL` y `Image`.
const ID_VIDEO = /^[A-Za-z0-9_-]{11}$/;

const ENTIDADES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

// Decodifica entidades XML en una sola pasada — importante para que un
// `&amp;lt;` del feed quede en `&lt;` y no se re-decodifique a `<`.
function decodificar(s: string): string {
  return s.replace(/&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z]+);/g, (match, ent: string) => {
    if (ent[0] === "#") {
      const code = ent[1] === "x" ? parseInt(ent.slice(2), 16) : parseInt(ent.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    }
    return ENTIDADES[ent] ?? match;
  });
}

// Contenido de <tag>…</tag> (el primero que aparezca en el bloque).
function etiqueta(xml: string, tag: string): string | null {
  const m = xml.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`));
  return m ? decodificar(m[1]).trim() : null;
}

// Valor de un atributo en un tag auto-cerrado, ej. <media:statistics views="123"/>.
function atributo(xml: string, tag: string, attr: string): string | null {
  const bloque = xml.match(new RegExp(`<${tag}\\s[^>]*>`));
  if (!bloque) return null;
  const m = bloque[0].match(new RegExp(`${attr}="([^"]*)"`));
  return m ? decodificar(m[1]) : null;
}

export function parsearFeed(xml: string): VideoYoutube[] {
  // `split` en vez de un regex global sobre todo el documento: cada <entry> se
  // procesa aislada, así un tag suelto en una entrada no arrastra a la siguiente.
  return xml
    .split("<entry>")
    .slice(1)
    .map((raw): VideoYoutube | null => {
      const bloque = raw.split("</entry>")[0];
      const id = etiqueta(bloque, "yt:videoId");
      if (!id || !ID_VIDEO.test(id)) return null;

      const vistasRaw = atributo(bloque, "media:statistics", "views");
      const vistas = vistasRaw && /^\d+$/.test(vistasRaw) ? Number(vistasRaw) : null;
      const publicado = etiqueta(bloque, "published") ?? "";
      const enlace = atributo(bloque, "link", "href") ?? "";

      return {
        id,
        titulo: etiqueta(bloque, "title") || "Sin título",
        descripcion: etiqueta(bloque, "media:description") ?? "",
        url: `https://www.youtube.com/watch?v=${id}`,
        // Se deriva del ID en vez de leer <media:thumbnail>: `hqdefault` existe
        // siempre. Es 480x360 (4:3) con banda negra arriba y abajo — en un
        // contenedor 16:9 con resizeMode "cover" el recorte cae justo sobre esas
        // bandas y queda el cuadro limpio.
        miniatura: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
        publicado,
        vistas,
        esShort: enlace.includes("/shorts/"),
      };
    })
    .filter((v): v is VideoYoutube => v !== null)
    .sort((a, b) => b.publicado.localeCompare(a.publicado));
}

/* ============================ Fetch ============================ */

export async function fetchVideosCanal(signal?: AbortSignal): Promise<VideoYoutube[]> {
  if (!hayCanal) return [];
  const url = `https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(CANAL_ID)}`;
  const res = await fetch(url, { signal });
  // Un canal inexistente o sin videos públicos devuelve 404, no un feed vacío.
  if (!res.ok) throw new Error(`YouTube respondió ${res.status}`);
  return parsearFeed(await res.text());
}

/* ============================ Presentación ============================ */

// "hace 3 días" / "hace 2 meses" — el feed no trae más precisión que la fecha de
// publicación y una lista de predicaciones se lee mejor en relativo.
export function publicadoLabel(iso: string): string {
  if (!iso) return "";
  const fecha = new Date(iso);
  if (Number.isNaN(fecha.getTime())) return "";

  const dias = Math.floor((Date.now() - fecha.getTime()) / 86_400_000);
  if (dias < 0) return "Programado";
  if (dias === 0) return "Hoy";
  if (dias === 1) return "Ayer";
  if (dias < 7) return `hace ${dias} días`;
  if (dias < 31) {
    const semanas = Math.floor(dias / 7);
    return `hace ${semanas} ${semanas === 1 ? "semana" : "semanas"}`;
  }
  if (dias < 365) {
    const meses = Math.floor(dias / 30);
    return `hace ${meses} ${meses === 1 ? "mes" : "meses"}`;
  }
  const anios = Math.floor(dias / 365);
  return `hace ${anios} ${anios === 1 ? "año" : "años"}`;
}

// El canal escribe quién predicó y cuándo en la primera línea de la descripción
// ("Marina Vázquez, Domingo 16-08-2026"). Es el dato más útil después del título,
// así que se muestra como bajada. Si algún video no sigue esa convención, cae en
// la primera línea que tenga texto — o en nada, y la tarjeta no la dibuja.
export function subtituloVideo(descripcion: string): string | null {
  const linea = descripcion
    .split("\n")
    .map((s) => s.trim())
    .find(Boolean);
  if (!linea) return null;
  return linea.length > 80 ? `${linea.slice(0, 79)}…` : linea;
}

export function vistasLabel(vistas: number | null): string | null {
  if (vistas === null) return null;
  if (vistas >= 1_000_000) return `${(vistas / 1_000_000).toFixed(1).replace(".0", "")} M de vistas`;
  if (vistas >= 1_000) return `${(vistas / 1_000).toFixed(1).replace(".0", "")} mil vistas`;
  return `${vistas} ${vistas === 1 ? "vista" : "vistas"}`;
}

/* ============================ Apertura ============================ */

// Abre el video en la app de YouTube (o el navegador si no está instalada).
// Mismo criterio que `abrirAdjunto` en lib/storage.ts: nunca se le pasa a
// `Linking` una URL armada con datos externos sin validarla antes — acá se
// reconstruye desde el ID validado en vez de confiar en el <link> del feed.
export async function abrirVideo(id: string): Promise<void> {
  if (!ID_VIDEO.test(id)) {
    Alert.alert("No se puede abrir", "El enlace del video no es válido.");
    return;
  }
  try {
    await Linking.openURL(`https://www.youtube.com/watch?v=${id}`);
  } catch {
    Alert.alert("No se pudo abrir", "No fue posible abrir el video en YouTube.");
  }
}

export async function abrirCanal(): Promise<void> {
  if (!hayCanal) return;
  try {
    await Linking.openURL(URL_CANAL);
  } catch {
    Alert.alert("No se pudo abrir", "No fue posible abrir el canal en YouTube.");
  }
}
