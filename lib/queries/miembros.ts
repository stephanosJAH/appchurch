import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../supabase";
import { Miembro } from "../types";

export const miembrosKeys = {
  all: ["miembros"] as const,
  detail: (id: string) => ["miembros", id] as const,
};

export function useMiembro(id: string) {
  return useQuery({
    queryKey: miembrosKeys.detail(id),
    enabled: !!id,
    queryFn: async (): Promise<Miembro | null> => {
      const { data, error } = await supabase
        .from("miembros")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return data as Miembro | null;
    },
  });
}

export function useMiembros() {
  return useQuery({
    queryKey: miembrosKeys.all,
    queryFn: async (): Promise<Miembro[]> => {
      const { data, error } = await supabase
        .from("miembros")
        .select("*")
        .order("apellido", { nullsFirst: false })
        .order("nombre");
      if (error) throw error;
      return data as Miembro[];
    },
  });
}

export type MiembroInput = Omit<Miembro, "id" | "created_at">;

export function useUpsertMiembro() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (
      input: Partial<MiembroInput> & { id?: string }
    ): Promise<Miembro> => {
      const { data, error } = await supabase
        .from("miembros")
        .upsert(input)
        .select()
        .single();
      if (error) throw error;
      return data as Miembro;
    },
    onSuccess: (m) => {
      qc.invalidateQueries({ queryKey: miembrosKeys.all });
      qc.invalidateQueries({ queryKey: miembrosKeys.detail(m.id) });
      // Las participaciones embeben al miembro: refrescar para ver cambios.
      qc.invalidateQueries({ queryKey: ["participaciones"] });
    },
  });
}
