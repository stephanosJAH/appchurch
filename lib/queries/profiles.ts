import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../supabase";
import { Profile, RolApp } from "../types";

export const profilesKeys = {
  all: ["profiles"] as const,
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
    onSuccess: () => qc.invalidateQueries({ queryKey: profilesKeys.all, refetchType: "all" }),
  });
}
