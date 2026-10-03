import { useQuery } from "@tanstack/react-query";
import { useCallback, useRef } from "react";
import { useAuth } from "../auth";
import { supabase } from "../supabase";
import {
  fetchVideosCanal,
  FilaVideoCanal,
  filasDesdeVideos,
  hayCanal,
  VideoYoutube,
  videosDesdeFilas,
} from "../youtube";

export const contenidoKeys = {
  all: ["contenido"] as const,
  videos: ["contenido", "videos"] as const,
};

// Cuánto vale el respaldo de `videos_canal` antes de volver a pedirle el feed a
// YouTube. Seis horas: una iglesia sube una predicación por semana, y cada
// arranque de la app que se resuelve contra Supabase es uno que no depende de
// que el RSS esté en pie ese minuto.
const TTL_RESPALDO = 6 * 60 * 60 * 1000;

type Respaldo = { videos: VideoYoutube[]; guardadoEn: number };

const SIN_RESPALDO: Respaldo = { videos: [], guardadoEn: 0 };

// Lee el espejo del último feed bueno (0030). Nunca tira: si falla, el camino
// sigue por YouTube — este es el plan B, no puede romper el plan A.
async function leerRespaldo(): Promise<Respaldo> {
  const { data, error } = await supabase
    .from("videos_canal")
    .select("id, titulo, descripcion, publicado, vistas, es_short, guardado_en")
    .order("publicado", { ascending: false });

  if (error) {
    if (__DEV__) console.warn("[contenido] no se pudo leer el respaldo:", error.message);
    return SIN_RESPALDO;
  }
  const filas = (data ?? []) as (FilaVideoCanal & { guardado_en: string })[];
  if (filas.length === 0) return SIN_RESPALDO;

  // Un refresco reescribe todas las filas en la misma transacción, así que
  // alcanza con la más nueva para saber de cuándo es el espejo entero.
  const guardadoEn = filas.reduce((max, f) => Math.max(max, Date.parse(f.guardado_en) || 0), 0);
  return { videos: videosDesdeFilas(filas), guardadoEn };
}

// Guarda el feed que acabamos de recibir. Va sin await ni reintento: es un
// efecto de costado del fetch, y que el respaldo quede viejo no es motivo para
// arruinarle la pantalla a nadie.
async function guardarRespaldo(videos: VideoYoutube[]): Promise<void> {
  const { error } = await supabase.rpc("guardar_videos_canal", {
    p_videos: filasDesdeVideos(videos),
  });
  if (error && __DEV__) console.warn("[contenido] no se pudo guardar el respaldo:", error.message);
}

// Últimos videos del canal. A diferencia del resto de `lib/queries/*`, la
// fuente no es Supabase: sale del RSS público de YouTube (ver lib/youtube.ts).
// Supabase entra solo como respaldo, porque ese feed se cae seguido — durante
// 2026 viene devolviendo 404 de a ratos para todos los canales, incluido el
// oficial de YouTube. Orden de resolución:
//
//   1. Respaldo fresco (< TTL)  -> se muestra sin tocar YouTube.
//   2. Respaldo vencido o vacío -> se pide el feed; si llega, se guarda.
//   3. El feed falló            -> se muestra el respaldo aunque esté vencido.
//   4. No hay ni respaldo       -> error, y la pantalla ofrece ir al canal.
//
// El `staleTime` largo es la misma idea un nivel más arriba: una iglesia sube
// contenido cada varios días, no cada minuto.
export function useVideosCanal() {
  // Gate de UI, no de seguridad: `guardar_videos_canal` corta por admin de
  // todos modos (0030). Preguntar acá evita que cada miembro dispare una RPC
  // que ya sabemos que le va a rebotar.
  const { isAdmin } = useAuth();
  // El pull-to-refresh tiene que saltear el TTL: sin esto el usuario tira para
  // abajo y no pasa nada durante seis horas.
  const forzarFeed = useRef(false);

  const query = useQuery({
    queryKey: contenidoKeys.videos,
    enabled: hayCanal,
    staleTime: 30 * 60 * 1000, // 30 min
    gcTime: 24 * 60 * 60 * 1000,
    queryFn: async ({ signal }): Promise<VideoYoutube[]> => {
      const respaldo = await leerRespaldo();
      const fresco = Date.now() - respaldo.guardadoEn < TTL_RESPALDO;
      if (respaldo.videos.length > 0 && fresco && !forzarFeed.current) {
        return respaldo.videos;
      }

      try {
        const videos = await fetchVideosCanal(signal);
        // Un feed vacío no pisa el respaldo: "YouTube no devolvió nada" es
        // justo el caso en que lo guardado es lo único que queda.
        if (videos.length > 0 && isAdmin) void guardarRespaldo(videos);
        return videos;
      } catch (e) {
        // Cancelación (pantalla cerrada, refetch nuevo): no es una caída del
        // feed y no tiene que quedar en el log ni activar el respaldo.
        if (signal?.aborted) throw e;
        // Sin esto no queda rastro de si fue red, CORS (target web) o un 404
        // del feed, porque el fallo termina en una tarjeta muda.
        if (__DEV__) console.warn("[contenido] no se pudo leer el feed de YouTube:", e);
        if (respaldo.videos.length > 0) return respaldo.videos;
        throw e;
      }
    },
    // Solo predicaciones: los shorts del canal son recortes del mismo sermón,
    // publicados con idéntico título, así que aparecían duplicando la lista.
    // Va en `select` y no en el `queryFn` para que la caché —y el respaldo—
    // guarden el feed tal como llegó: si algún día se quieren mostrar, no hay
    // que volver a pedirlo.
    // Efecto lateral a tener presente: el RSS trae 15 entradas contando shorts,
    // así que la lista final queda en unas 10-12 predicaciones.
    select: (videos: VideoYoutube[]) => videos.filter((v) => !v.esShort),
  });

  const { refetch } = query;
  // Pull-to-refresh: además de refetchear, ignora el TTL del respaldo para ir
  // de verdad a YouTube.
  const refrescar = useCallback(async () => {
    forzarFeed.current = true;
    try {
      return await refetch();
    } finally {
      forzarFeed.current = false;
    }
  }, [refetch]);

  return { ...query, refrescar };
}
