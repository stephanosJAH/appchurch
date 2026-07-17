import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../supabase";
import { Actividad } from "../types";

export const actividadesKeys = {
  activas: ["actividades", "activas"] as const,
  admin: ["actividades", "admin"] as const,
  all: ["actividades"] as const,
  detalle: (id: string) => ["actividades", "detalle", id] as const,
};

// Feed de actividades vigentes (activa = true), ordenadas por hora de inicio.
export function useActividadesActivas() {
  return useQuery({
    queryKey: actividadesKeys.activas,
    queryFn: async (): Promise<Actividad[]> => {
      const { data, error } = await supabase
        .from("actividades")
        .select("*")
        .eq("activa", true)
        .order("hora_inicio");
      if (error) throw error;
      return data as Actividad[];
    },
  });
}

// Todas las actividades (incluye inactivas) — para gestión del admin.
export function useActividadesAdmin() {
  return useQuery({
    queryKey: actividadesKeys.admin,
    queryFn: async (): Promise<Actividad[]> => {
      const { data, error } = await supabase
        .from("actividades")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Actividad[];
    },
  });
}

// Detalle de una actividad recurrente.
export function useActividad(id: string) {
  return useQuery({
    queryKey: actividadesKeys.detalle(id),
    enabled: !!id,
    queryFn: async (): Promise<Actividad> => {
      const { data, error } = await supabase
        .from("actividades")
        .select("*")
        .eq("id", id)
        .single();
      if (error) throw error;
      return data as Actividad;
    },
  });
}

export type ActividadInput = Omit<Actividad, "id" | "created_at" | "creado_por">;

export function useUpsertActividad() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (
      input: Partial<ActividadInput> & { id?: string }
    ): Promise<Actividad> => {
      const { data, error } = await supabase
        .from("actividades")
        .upsert(input)
        .select()
        .single();
      if (error) throw error;
      return data as Actividad;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: actividadesKeys.all });
    },
  });
}

export function useDeleteActividad() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("actividades").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: actividadesKeys.all }),
  });
}
