import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../supabase";
import { Evento } from "../types";

export const eventosKeys = {
  vigentes: ["eventos", "vigentes"] as const,
  admin: ["eventos", "admin"] as const,
  all: ["eventos"] as const,
  detalle: (id: string) => ["eventos", "detalle", id] as const,
};

// Feed de actividades vigentes (fecha_fin >= ahora), ordenadas por fecha.
export function useEventosVigentes() {
  return useQuery({
    queryKey: eventosKeys.vigentes,
    queryFn: async (): Promise<Evento[]> => {
      const { data, error } = await supabase
        .from("eventos")
        .select("*")
        .gte("fecha_fin", new Date().toISOString())
        .order("fecha_inicio");
      if (error) throw error;
      return data as Evento[];
    },
  });
}

// Todas las actividades (incluye pasadas) — para gestión del admin.
export function useEventosAdmin() {
  return useQuery({
    queryKey: eventosKeys.admin,
    queryFn: async (): Promise<Evento[]> => {
      const { data, error } = await supabase
        .from("eventos")
        .select("*")
        .order("fecha_inicio", { ascending: false });
      if (error) throw error;
      return data as Evento[];
    },
  });
}

// Detalle de una actividad.
export function useEvento(id: string) {
  return useQuery({
    queryKey: eventosKeys.detalle(id),
    enabled: !!id,
    queryFn: async (): Promise<Evento> => {
      const { data, error } = await supabase
        .from("eventos")
        .select("*")
        .eq("id", id)
        .single();
      if (error) throw error;
      return data as Evento;
    },
  });
}

export type EventoInput = Omit<Evento, "id" | "created_at" | "creado_por">;

export function useUpsertEvento() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (
      input: Partial<EventoInput> & { id?: string }
    ): Promise<Evento> => {
      const { data, error } = await supabase
        .from("eventos")
        .upsert(input)
        .select()
        .single();
      if (error) throw error;
      return data as Evento;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: eventosKeys.all });
    },
  });
}

export function useDeleteEvento() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("eventos").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: eventosKeys.all }),
  });
}
