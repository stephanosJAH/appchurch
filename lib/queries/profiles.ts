import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../supabase";
import { Profile, RolApp } from "../types";

export const profilesKeys = {
  all: ["profiles"] as const,
  pendientes: ["profiles", "pendientes"] as const,
};

// Lista de perfiles (solo admin por RLS). Útil para asignar discipulador.
export function useProfiles() {
  return useQuery({
    queryKey: profilesKeys.all,
    queryFn: async (): Promise<Profile[]> => {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .order("nombre_completo", { nullsFirst: false });
      if (error) throw error;
      return data as Profile[];
    },
  });
}

// Cambiar el rol de un usuario (solo admin, RLS lo exige).
export function useUpdateRol() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, rol }: { id: string; rol: RolApp }) => {
      const { error } = await supabase.from("profiles").update({ rol }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: profilesKeys.all, refetchType: "all" });
      qc.invalidateQueries({ queryKey: profilesKeys.pendientes, refetchType: "all" });
    },
  });
}

// Cuentas recién registradas, a la espera de que un obrero/admin las habilite.
// Visible para obrero/admin por RLS (prof_obrero_ve_pendientes / prof_admin).
export function usePendientes(enabled = true) {
  return useQuery({
    queryKey: profilesKeys.pendientes,
    enabled,
    queryFn: async (): Promise<Profile[]> => {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("rol", "pendiente")
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data as Profile[];
    },
  });
}

// Habilita una cuenta pendiente: pasa su rol a 'miembro'. Un obrero puede
// hacerlo (policy prof_obrero_activar + trigger no_autoescalar_rol); admin también.
export function useActivarMiembro() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("profiles").update({ rol: "miembro" }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: profilesKeys.pendientes, refetchType: "all" });
      qc.invalidateQueries({ queryKey: profilesKeys.all, refetchType: "all" });
    },
  });
}
