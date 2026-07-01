import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../supabase";
import { Discipulado } from "../types";

export const discipuladosKeys = {
  all: ["discipulados"] as const,
  detail: (id: string) => ["discipulados", id] as const,
};

// Lista de discipulados ACTIVOS (RLS filtra: admin ve todo, discipulador el suyo).
export function useDiscipulados() {
  return useQuery({
    queryKey: discipuladosKeys.all,
    queryFn: async (): Promise<Discipulado[]> => {
      const { data, error } = await supabase
        .from("discipulados")
        .select("*, discipulador:profiles(nombre_completo)")
        .eq("activo", true)
        .order("dia_semana")
        .order("hora_inicio");
      if (error) throw error;
      return data as Discipulado[];
    },
  });
}

// Discipulados dados de baja (activo = false) — para administrarlos.
export function useDiscipuladosInactivos() {
  return useQuery({
    queryKey: ["discipulados", "inactivos"],
    queryFn: async (): Promise<Discipulado[]> => {
      const { data, error } = await supabase
        .from("discipulados")
        .select("*, discipulador:profiles(nombre_completo)")
        .eq("activo", false)
        .order("fecha_baja", { ascending: false });
      if (error) throw error;
      return data as Discipulado[];
    },
  });
}

export function useDiscipulado(id: string) {
  return useQuery({
    queryKey: discipuladosKeys.detail(id),
    enabled: !!id,
    queryFn: async (): Promise<Discipulado | null> => {
      const { data, error } = await supabase
        .from("discipulados")
        .select("*, discipulador:profiles(nombre_completo)")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return data as Discipulado | null;
    },
  });
}

export type DiscipuladoInput = Omit<Discipulado, "id" | "created_at" | "activo"> & {
  activo?: boolean;
};

export function useUpsertDiscipulado() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (
      input: Partial<DiscipuladoInput> & { id?: string }
    ): Promise<Discipulado> => {
      const { data, error } = await supabase
        .from("discipulados")
        .upsert(input)
        .select()
        .single();
      if (error) throw error;
      return data as Discipulado;
    },
    // refetchType "all" refresca también las vistas en segundo plano
    // (tab Discipulados, dashboard) además de la activa.
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: discipuladosKeys.all, refetchType: "all" }),
  });
}

// Refresca listas activas e inactivas.
function invalidarTodo(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: discipuladosKeys.all, refetchType: "all" });
  qc.invalidateQueries({ queryKey: ["discipulados", "inactivos"], refetchType: "all" });
}

// Baja lógica: activo=false + motivo + fecha. Libera al discipulador (respeta 1:1).
export function useBajaDiscipulado() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, motivo }: { id: string; motivo: string }) => {
      const { error } = await supabase
        .from("discipulados")
        .update({
          activo: false,
          motivo_baja: motivo,
          fecha_baja: new Date().toISOString(),
          discipulador_id: null,
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => invalidarTodo(qc),
  });
}

// Reactivar: activo=true, limpia motivo/fecha. El líder queda sin asignar.
export function useReactivarDiscipulado() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("discipulados")
        .update({ activo: true, motivo_baja: null, fecha_baja: null })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => invalidarTodo(qc),
  });
}
