import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { authKeys } from "../auth";
import { supabase } from "../supabase";
import { Anuncio } from "../types";

// Anuncios (0026): el aviso a la gente. `ministerio_id` null = toda la iglesia
// (solo admin), con uuid = solo los participantes y líderes de ese ministerio.
//
// La LECTURA va por el RPC `anuncios_visibles` y no por la tabla porque
// `autor_id` apunta a `profiles`, que la RLS solo deja leer de uno mismo: sin
// el RPC, cada anuncio quedaría firmado con un uuid. La ESCRITURA sí es tabla
// directa — la policy `anun_write` ya hace el corte.

export const anunciosKeys = {
  all: ["anuncios"] as const,
  vigentes: ["anuncios", "vigentes"] as const,
  todos: ["anuncios", "todos"] as const,
};

// Anuncios vigentes: los que no vencieron. Es lo que se ve en el feed y en la
// pantalla de anuncios.
export function useAnuncios() {
  return useQuery({
    queryKey: anunciosKeys.vigentes,
    queryFn: async (): Promise<Anuncio[]> => {
      const { data, error } = await supabase.rpc("anuncios_visibles", {
        p_incluir_vencidos: false,
      });
      if (error) throw error;
      return (data ?? []) as Anuncio[];
    },
  });
}

// Incluye los vencidos, para gestionarlos (borrarlos o corregirles la fecha).
// El filtro de vencimiento vive en el RPC y no en la policy justamente para
// que quien gestiona pueda seguir viéndolos.
export function useAnunciosConVencidos(enabled = true) {
  return useQuery({
    queryKey: anunciosKeys.todos,
    enabled,
    queryFn: async (): Promise<Anuncio[]> => {
      const { data, error } = await supabase.rpc("anuncios_visibles", {
        p_incluir_vencidos: true,
      });
      if (error) throw error;
      return (data ?? []) as Anuncio[];
    },
  });
}

// Cuántos anuncios hay sin leer, contra la marca de agua
// `profiles.anuncios_leidos_hasta` (0026). Sin marca (cuenta que nunca abrió
// los anuncios) cuentan todos: es la primera visita, y el badge tiene que
// avisar de lo que hay.
export function contarNoLeidos(anuncios: Anuncio[], leidosHasta: string | null): number {
  if (!leidosHasta) return anuncios.length;
  const corte = new Date(leidosHasta).getTime();
  return anuncios.filter((a) => new Date(a.created_at).getTime() > corte).length;
}

export type AnuncioInput = {
  id?: string;
  ministerio_id: string | null;
  titulo: string;
  cuerpo: string;
  fijado: boolean;
  vence_el: string | null;
};

// Alta y edición. `autor_id` no se manda nunca: en el alta lo pone el default
// `auth.uid()` de la columna y en la edición el trigger
// `trg_anuncios_conserva_autor` lo congela — cualquier líder puede editar el
// anuncio de otro sin quedarse con la firma.
export function useUpsertAnuncio() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: AnuncioInput): Promise<void> => {
      const { error } = await supabase.from("anuncios").upsert(input);
      if (error) throw error;
    },
    onSuccess: () => invalidarAnuncios(qc),
  });
}

export function useBorrarAnuncio() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("anuncios").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => invalidarAnuncios(qc),
  });
}

function invalidarAnuncios(qc: ReturnType<typeof useQueryClient>) {
  // refetchType "all" para que el feed de Inicio y el badge, que suelen estar
  // en segundo plano, no queden viejos.
  qc.invalidateQueries({ queryKey: anunciosKeys.all, refetchType: "all" });
}

// Marca todo como leído (mueve la marca de agua a ahora). El cliente puede
// escribir su propio perfil por `prof_update_self` (0002) y el trigger
// anti-escalada solo mira `rol`, así que no hace falta RPC.
export function useMarcarAnunciosLeidos() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await supabase
        .from("profiles")
        .update({ anuncios_leidos_hasta: new Date().toISOString() })
        .eq("id", userId);
      if (error) throw error;
    },
    // El badge sale del perfil que cachea lib/auth.tsx, keyed por uid.
    onSuccess: (_data, userId) =>
      qc.invalidateQueries({ queryKey: authKeys.profile(userId) }),
  });
}
