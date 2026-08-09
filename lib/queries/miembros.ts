import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../supabase";
import { Miembro } from "../types";

export const miembrosKeys = {
  all: ["miembros"] as const,
  detail: (id: string) => ["miembros", id] as const,
  tieneCuenta: (id: string) => ["miembros", id, "tiene-cuenta"] as const,
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

// ¿La ficha del padrón ya está enlazada a una cuenta de la app?
// Si lo está, sus datos los gestiona la propia persona desde "Mis datos" y el
// discipulador solo ve la ficha (RLS de 0021). Por RPC porque `profiles` no se
// puede leer de otra gente (0002).
export function useMiembroTieneCuenta(id: string) {
  return useQuery({
    queryKey: miembrosKeys.tieneCuenta(id),
    enabled: !!id,
    queryFn: async (): Promise<boolean> => {
      const { data, error } = await supabase.rpc("miembro_tiene_cuenta", {
        p_miembro: id,
      });
      if (error) throw error;
      return data === true;
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

// Descripción / nota pastoral de una persona. Va por RPC (0021) y no por el
// upsert: sobre una ficha con cuenta enlazada el discipulador ya no tiene
// UPDATE, y `notas` es lo único que le sigue correspondiendo escribir.
export function useGuardarNotasMiembro() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, notas }: { id: string; notas: string | null }) => {
      const { error } = await supabase.rpc("guardar_notas_miembro", {
        p_miembro: id,
        p_notas: notas,
      });
      if (error) throw error;
    },
    onSuccess: (_data, { id }) => {
      qc.invalidateQueries({ queryKey: miembrosKeys.detail(id) });
      qc.invalidateQueries({ queryKey: miembrosKeys.all });
    },
  });
}
