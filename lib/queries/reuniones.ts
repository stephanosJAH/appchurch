import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../supabase";
import { Asistencia, AsistenciaInput, Miembro, Modalidad, Reunion } from "../types";

export const reunionesKeys = {
  byDiscipulado: (discipuladoId: string) =>
    ["reuniones", discipuladoId] as const,
  conAsistencia: (discipuladoId: string) =>
    ["reuniones", "asistencia", discipuladoId] as const,
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
// Trae además el `discipulador_id` del grupo: es lo que decide si esta reunión
// se puede editar (la RLS ya lo garantiza; acá es solo para mostrar el botón).
export type ReunionDetalle = Reunion & {
  discipulado?: {
    nombre: string | null;
    descripcion_etaria: string | null;
    discipulador_id: string | null;
  } | null;
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
          "*, discipulado:discipulados(nombre, descripcion_etaria, discipulador_id), asistencias(*, miembro:miembros(*))"
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
// `enabled` para no pedirla cuando app/ofrendas.tsx está mostrando el otro
// libro (el de ministerios, que vive en `reuniones_ministerio`).
export function useOfrendas(desde: string, hasta: string, enabled = true) {
  return useQuery({
    queryKey: reunionesKeys.ofrendas(desde, hasta),
    enabled,
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

// Reunión con quién vino y quién no. `registrar_reunion` guarda una fila por
// integrante del roster, presente o no: una falta es `presente = false`, y que
// alguien no tenga fila quiere decir que todavía no era del grupo.
export type ReunionConAsistencia = Reunion & {
  asistencias: Pick<Asistencia, "miembro_id" | "presente">[];
};

// Historial de un discipulado con la asistencia embebida (más recientes
// primero): alimenta el resumen del grupo y su historial. La RLS de
// `asistencias` (0002) deja leerla al discipulador del grupo y al admin, que
// son los mismos que llegan a esas pantallas. Aparte de `useReuniones` porque
// app/reunion/nueva.tsx solo necesita las fechas y no tiene por qué bajar la
// asistencia de todo el historial.
export function useReunionesConAsistencia(discipuladoId: string) {
  return useQuery({
    queryKey: reunionesKeys.conAsistencia(discipuladoId),
    enabled: !!discipuladoId,
    queryFn: async (): Promise<ReunionConAsistencia[]> => {
      const { data, error } = await supabase
        .from("reuniones")
        .select("*, asistencias(miembro_id, presente)")
        .eq("discipulado_id", discipuladoId)
        .order("fecha", { ascending: false });
      if (error) throw error;
      return data as ReunionConAsistencia[];
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
  // Presente solo al editar una reunión existente; en el alta va null y el
  // backend resuelve por (discipulado_id, fecha).
  reunion_id?: string | null;
  discipulado_id: string;
  fecha: string;
  tema: string | null;
  material_url: string | null;
  modalidad: Modalidad | null;
  ofrenda: number;
  notas: string | null;
  asistencias: AsistenciaInput[];
};

// Llama al RPC transaccional registrar_reunion (alta y edición, 0023).
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
        p_reunion_id: input.reunion_id ?? null,
      });
      if (error) throw error;
      return data as string; // reunion_id
    },
    onSuccess: () => {
      // Editar puede mover la fecha y cambiar la ofrenda, así que no alcanza
      // con el historial del grupo: también quedan viejos el calendario, el
      // mes y el desglose de ofrendas. Todas esas claves cuelgan de
      // "reuniones", así que se invalidan de una. `refetchType: "all"` alcanza
      // además a las pantallas en segundo plano (mismo motivo que en
      // discipulados: al volver, los datos ya están al día).
      qc.invalidateQueries({ queryKey: ["reuniones"], refetchType: "all" });
    },
  });
}
