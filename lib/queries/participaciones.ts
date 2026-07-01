import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../supabase";
import { Participacion, Sexo } from "../types";

export const participacionesKeys = {
  byDiscipulado: (discipuladoId: string) =>
    ["participaciones", discipuladoId] as const,
};

// Lista de discípulos (participaciones) de un discipulado, con datos del miembro.
export function useParticipaciones(discipuladoId: string) {
  return useQuery({
    queryKey: participacionesKeys.byDiscipulado(discipuladoId),
    enabled: !!discipuladoId,
    queryFn: async (): Promise<Participacion[]> => {
      const { data, error } = await supabase
        .from("participaciones")
        .select("*, miembro:miembros(*)")
        .eq("discipulado_id", discipuladoId)
        .eq("activo", true);
      if (error) throw error;
      return (data as Participacion[]).sort((a, b) =>
        (a.miembro?.nombre ?? "").localeCompare(b.miembro?.nombre ?? "")
      );
    },
  });
}

// Sumar un miembro existente al grupo.
export function useAgregarParticipacion(discipuladoId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (miembroId: string) => {
      const { error } = await supabase
        .from("participaciones")
        .upsert(
          { discipulado_id: discipuladoId, miembro_id: miembroId, activo: true },
          { onConflict: "discipulado_id,miembro_id" }
        );
      if (error) throw error;
    },
    onSuccess: () =>
      qc.invalidateQueries({
        queryKey: participacionesKeys.byDiscipulado(discipuladoId),
      }),
  });
}

// Crear un discípulo nuevo (miembro + participación) vía RPC agregar_discipulo.
export function useAgregarDiscipuloNuevo(discipuladoId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      nombre: string;
      apellido?: string | null;
      sexo: Sexo;
      telefono?: string | null;
      email?: string | null;
    }): Promise<string> => {
      const { data, error } = await supabase.rpc("agregar_discipulo", {
        p_discipulado_id: discipuladoId,
        p_nombre: input.nombre,
        p_apellido: input.apellido ?? null,
        p_sexo: input.sexo,
        p_telefono: input.telefono ?? null,
        p_email: input.email ?? null,
      });
      if (error) throw error;
      return data as string; // miembro_id
    },
    onSuccess: () => {
      qc.invalidateQueries({
        queryKey: participacionesKeys.byDiscipulado(discipuladoId),
      });
      qc.invalidateQueries({ queryKey: ["miembros"] });
    },
  });
}
