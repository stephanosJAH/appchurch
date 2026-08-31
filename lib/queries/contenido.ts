import { useQuery } from "@tanstack/react-query";
import { fetchVideosCanal, hayCanal, VideoYoutube } from "../youtube";

export const contenidoKeys = {
  all: ["contenido"] as const,
  videos: ["contenido", "videos"] as const,
};

// Últimos videos del canal. A diferencia del resto de `lib/queries/*`, esto no
// pega contra Supabase: sale del RSS público de YouTube (ver lib/youtube.ts).
//
// `staleTime` largo a propósito — una iglesia sube contenido cada varios días, no
// cada minuto, y el feed es un fetch a un tercero: no tiene sentido revalidarlo
// cada vez que el usuario vuelve a Inicio. El pull-to-refresh de la pantalla de
// Contenido sigue forzando el refetch cuando alguien quiere ver lo último ya.
export function useVideosCanal() {
  return useQuery({
    queryKey: contenidoKeys.videos,
    enabled: hayCanal,
    staleTime: 30 * 60 * 1000, // 30 min
    gcTime: 24 * 60 * 60 * 1000,
    queryFn: async ({ signal }): Promise<VideoYoutube[]> => {
      try {
        return await fetchVideosCanal(signal);
      } catch (e) {
        // El fallo termina en una tarjeta muda ("Ir al canal"), así que sin esto
        // no queda rastro de si fue red, CORS (target web) o un 404 del canal.
        if (__DEV__) console.warn("[contenido] no se pudo leer el feed de YouTube:", e);
        throw e;
      }
    },
    // Solo predicaciones: los shorts del canal son recortes del mismo sermón,
    // publicados con idéntico título, así que aparecían duplicando la lista.
    // Va en `select` y no en el `queryFn` para que la caché guarde el feed tal
    // como llegó — si algún día se quieren mostrar, no hay que volver a pedirlo.
    // Efecto lateral a tener presente: el RSS trae 15 entradas contando shorts,
    // así que la lista final queda en unas 10-12 predicaciones.
    select: (videos: VideoYoutube[]) => videos.filter((v) => !v.esShort),
  });
}
