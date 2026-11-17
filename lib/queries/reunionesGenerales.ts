import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../supabase";
import { AsistenciaGeneral, AsistenciaGeneralInput, ReunionGeneralListado } from "../types";

// Reunión general: resumen de lo tratado + participantes. Espejo de
// reunionesObreros.ts contra sus propias tablas — ver la cabecera de
// supabase/migrations/0041_reuniones_generales.sql.
//
// Admin-only. Las tablas sólo tienen policy de `select`; el único camino de
// escritura es el RPC `registrar_reunion_general`. Los candidatos a
// participante (el padrón activo) salen de `useParticipantesPosibles` en
// reunionesObreros.ts: es la misma lista para las dos reuniones.

export const reunionesGeneralesKeys = {
  all: ["reuniones-generales"] as const,
  listado: ["reuniones-generales", "listado"] as const,
  asistencias: (reunionId: string) =>
    ["reuniones-generales", reunionId, "asistencias"] as const,
};

/* =========================== Lectura =========================== */

export function useReunionesGenerales() {
  return useQuery({
    queryKey: reunionesGeneralesKeys.listado,
    queryFn: async (): Promise<ReunionGeneralListado[]> => {
      const { data, error } = await supabase.rpc("reuniones_generales_listado");
      if (error) throw error;
      return (data ?? []) as ReunionGeneralListado[];
    },
  });
}

export function useAsistenciasGenerales(reunionId: string | undefined) {
  return useQuery({
    queryKey: reunionesGeneralesKeys.asistencias(reunionId ?? ""),
    enabled: !!reunionId,
    queryFn: async (): Promise<AsistenciaGeneral[]> => {
      const { data, error } = await supabase
        .from("asistencias_generales")
        .select("reunion_id, miembro_id, presente")
        .eq("reunion_id", reunionId!);
      if (error) throw error;
      return (data ?? []) as AsistenciaGeneral[];
    },
  });
}

/* =========================== Escritura =========================== */

export type RegistrarReunionGeneralInput = {
  // null -> alta; uuid -> edición de esa reunión.
  reunion_id?: string | null;
  fecha: string; // "YYYY-MM-DD"
  tema: string | null;
  resumen: string | null;
  asistencias: AsistenciaGeneralInput[];
};

export function useRegistrarReunionGeneral() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: RegistrarReunionGeneralInput): Promise<string> => {
      const { data, error } = await supabase.rpc("registrar_reunion_general", {
        p_fecha: input.fecha,
        p_tema: input.tema,
        p_resumen: input.resumen,
        p_asistencias: input.asistencias,
        p_reunion_id: input.reunion_id ?? null,
      });
      if (error) throw error;
      return data as string; // reunion_id
    },
    onSuccess: () => {
      // Editar puede mover la fecha: se invalida el prefijo entero.
      qc.invalidateQueries({
        queryKey: reunionesGeneralesKeys.all,
        refetchType: "all",
      });
    },
  });
}
