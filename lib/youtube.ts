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

// Fila de `videos_canal` (0030): el respaldo del último feed bueno, que se
// muestra mientras el RSS de YouTube está caído. No guarda `url` ni
// `miniatura` — ver `construirVideo`.
export type FilaVideoCanal = {
  id: string;
  titulo: string;
  descripcion: string;
  publicado: string;
  vistas: number | null;
  es_short: boolean;
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

// Único lugar donde se arma un `VideoYoutube`, lo hayamos sacado del XML o de
// la tabla de respaldo. Valida el id y deriva de ahí la URL y la miniatura, en
// vez de confiar en una cadena que vino de afuera: de estas dos salen un
// `Linking.openURL` y un `<Image>`. Devuelve null si el id no tiene forma de id.
function construirVideo(d: {
  id: string | null;
  titulo: string | null;
  descripcion: string | null;
  publicado: string | null;
  vistas: number | null;
  esShort: boolean;
}): VideoYoutube | null {
  if (!d.id || !ID_VIDEO.test(d.id)) return null;
  return {
    id: d.id,
    titulo: d.titulo || "Sin título",
    descripcion: d.descripcion ?? "",
    url: `https://www.youtube.com/watch?v=${d.id}`,
    // `hqdefault` existe siempre. Es 480x360 (4:3) con banda negra arriba y
    // abajo — en un contenedor 16:9 con resizeMode "cover" el recorte cae justo
    // sobre esas bandas y queda el cuadro limpio.
    miniatura: `https://i.ytimg.com/vi/${d.id}/hqdefault.jpg`,
    publicado: d.publicado ?? "",
    vistas: d.vistas,
    esShort: d.esShort,
  };
}

const porFecha = (a: VideoYoutube, b: VideoYoutube) => b.publicado.localeCompare(a.publicado);

// Respaldo de `videos_canal` -> lo mismo que devuelve el feed en vivo, para que
// las pantallas no sepan de dónde salió cada video.
export function videosDesdeFilas(filas: FilaVideoCanal[]): VideoYoutube[] {
  return filas
    .map((f) =>
      construirVideo({
        id: f.id,
        titulo: f.titulo,
        descripcion: f.descripcion,
        publicado: f.publicado,
        vistas: f.vistas,
        esShort: f.es_short,
      }),
    )
    .filter((v): v is VideoYoutube => v !== null)
    .sort(porFecha);
}

// Lo que se le manda a `guardar_videos_canal` (0030). La RPC vuelve a validar
// todo: esto es solo la forma de las columnas.
export function filasDesdeVideos(videos: VideoYoutube[]): FilaVideoCanal[] {
  return videos.map((v) => ({
    id: v.id,
    titulo: v.titulo,
    descripcion: v.descripcion,
    publicado: v.publicado,
    vistas: v.vistas,
    es_short: v.esShort,
  }));
}

export function parsearFeed(xml: string): VideoYoutube[] {
  // `split` en vez de un regex global sobre todo el documento: cada <entry> se
  // procesa aislada, así un tag suelto en una entrada no arrastra a la siguiente.
  return xml
    .split("<entry>")
    .slice(1)
    .map((raw): VideoYoutube | null => {
      const bloque = raw.split("</entry>")[0];
      const vistasRaw = atributo(bloque, "media:statistics", "views");
      const enlace = atributo(bloque, "link", "href") ?? "";

      return construirVideo({
        id: etiqueta(bloque, "yt:videoId"),
        titulo: etiqueta(bloque, "title"),
        descripcion: etiqueta(bloque, "media:description"),
        publicado: etiqueta(bloque, "published"),
        vistas: vistasRaw && /^\d+$/.test(vistasRaw) ? Number(vistasRaw) : null,
        esShort: enlace.includes("/shorts/"),
      });
    })
    .filter((v): v is VideoYoutube => v !== null)
    .sort(porFecha);
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
