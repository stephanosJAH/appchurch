import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../supabase";
import { Asistencia, AsistenciaInput, Miembro, Modalidad, Reunion } from "../types";

export const reunionesKeys = {
  byDiscipulado: (discipuladoId: string) =>
    ["reuniones", discipuladoId] as const,
  semana: (desde: string, hasta: string) =>
    ["reuniones", "semana", desde, hasta] as const,
  mes: (desde: string, hasta: string) =>
    ["reuniones", "mes", desde, hasta] as const,
  ofrendas: (desde: string, hasta: string) =>
    ["reuniones", "ofrendas", desde, hasta] as const,
  detalle: (reunionId: string) => ["reuniones", "detalle", reunionId] as const,
};

// Reunión con el nombre del grupo embebido (para el desglose de ofrendas).
export type ReunionConGrupo = Reunion & {
  discipulado?: { nombre: string | null; descripcion_etaria: string | null } | null;
};

export type AsistenciaConMiembro = Asistencia & { miembro?: Miembro | null };

// Reunión con grupo y asistencias (miembro embebido) — para el detalle.
export type ReunionDetalle = ReunionConGrupo & {
  asistencias?: AsistenciaConMiembro[];
};

// Detalle completo de una reunión: datos, grupo y lista de asistencias.
export function useReunion(reunionId: string) {
  return useQuery({
    queryKey: reunionesKeys.detalle(reunionId),
    enabled: !!reunionId,
    queryFn: async (): Promise<ReunionDetalle> => {
      const { data, error } = await supabase
        .from("reuniones")
        .select(
          "*, discipulado:discipulados(nombre, descripcion_etaria), asistencias(*, miembro:miembros(*))"
        )
        .eq("id", reunionId)
        .single();
      if (error) throw error;
      return data as ReunionDetalle;
    },
  });
}

// Reuniones del rango (mes actual) — para el resumen de ofrendas.
export function useReunionesMes(desde: string, hasta: string) {
  return useQuery({
    queryKey: reunionesKeys.mes(desde, hasta),
    queryFn: async (): Promise<Reunion[]> => {
      const { data, error } = await supabase
        .from("reuniones")
        .select("*")
        .gte("fecha", desde)
        .lte("fecha", hasta);
      if (error) throw error;
      return data as Reunion[];
    },
  });
}

// Reuniones con ofrenda en un rango amplio, con el grupo embebido.
// Alimenta el desglose de ofrendas (totales, por mes, por reunión).
export function useOfrendas(desde: string, hasta: string) {
  return useQuery({
    queryKey: reunionesKeys.ofrendas(desde, hasta),
    queryFn: async (): Promise<ReunionConGrupo[]> => {
      const { data, error } = await supabase
        .from("reuniones")
        .select("*, discipulado:discipulados(nombre, descripcion_etaria)")
        .gte("fecha", desde)
        .lte("fecha", hasta)
        .order("fecha", { ascending: false });
      if (error) throw error;
      return data as ReunionConGrupo[];
    },
  });
}

// Historial de reuniones de un discipulado (más recientes primero).
export function useReuniones(discipuladoId: string) {
  return useQuery({
    queryKey: reunionesKeys.byDiscipulado(discipuladoId),
    enabled: !!discipuladoId,
    queryFn: async (): Promise<Reunion[]> => {
      const { data, error } = await supabase
        .from("reuniones")
        .select("*")
        .eq("discipulado_id", discipuladoId)
        .order("fecha", { ascending: false });
      if (error) throw error;
      return data as Reunion[];
    },
  });
}

// Reuniones registradas en un rango de fechas (para el calendario semanal).
export function useReunionesSemana(desde: string, hasta: string) {
  return useQuery({
    queryKey: reunionesKeys.semana(desde, hasta),
    queryFn: async (): Promise<Reunion[]> => {
      const { data, error } = await supabase
        .from("reuniones")
        .select("*")
        .gte("fecha", desde)
        .lte("fecha", hasta);
      if (error) throw error;
      return data as Reunion[];
    },
  });
}

export type RegistrarReunionInput = {
  discipulado_id: string;
  fecha: string;
  tema: string | null;
  material_url: string | null;
  modalidad: Modalidad | null;
  ofrenda: number;
  notas: string | null;
  asistencias: AsistenciaInput[];
};

// Llama al RPC transaccional registrar_reunion.
export function useRegistrarReunion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: RegistrarReunionInput): Promise<string> => {
      const { data, error } = await supabase.rpc("registrar_reunion", {
        p_discipulado_id: input.discipulado_id,
        p_fecha: input.fecha,
        p_tema: input.tema,
        p_material_url: input.material_url,
        p_modalidad: input.modalidad,
        p_ofrenda: input.ofrenda,
        p_notas: input.notas,
        p_asistencias: input.asistencias,
      });
      if (error) throw error;
      return data as string; // reunion_id
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({
        queryKey: reunionesKeys.byDiscipulado(vars.discipulado_id),
      });
      qc.invalidateQueries({ queryKey: ["reuniones", "semana"] });
    },
  });
}
