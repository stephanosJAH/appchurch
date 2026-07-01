import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../supabase";
import { Miembro } from "../types";

export const miembrosKeys = {
  all: ["miembros"] as const,
};

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
    onSuccess: () => qc.invalidateQueries({ queryKey: miembrosKeys.all }),
  });
}
