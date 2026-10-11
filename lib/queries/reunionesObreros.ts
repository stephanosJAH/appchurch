import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../supabase";
import {
  AsistenciaObreros,
  AsistenciaObrerosInput,
  Miembro,
  ReunionObrerosListado,
} from "../types";

// Reunión de obreros: acta de lo tratado + participantes. Entidad propia, sin
// grupo dueño y sin ofrenda — ver la cabecera de
// supabase/migrations/0031_reuniones_obreros.sql.
//
// Todo este archivo es admin-only. Las tablas tienen policy de `select`
// gateada por `es_admin()` y NO tienen policy de escritura: el único camino
// para escribir es el RPC `registrar_reunion_obreros`. Por eso acá no hay
// ningún `.insert()`/`.update()`/`.delete()`, y no es un olvido.

export const reunionesObrerosKeys = {
  all: ["reuniones-obreros"] as const,
  listado: ["reuniones-obreros", "listado"] as const,
  asistencias: (reunionId: string) =>
    ["reuniones-obreros", reunionId, "asistencias"] as const,
  participantes: ["reuniones-obreros", "participantes"] as const,
};

/* =========================== Lectura =========================== */

// Historial completo, más nuevo primero. Va por RPC y no por tabla directa
// porque el listado resuelve los nombres de quien registró/editó con
// `nombre_de_perfil` (0027), que no tiene execute para `authenticated`.
export function useReunionesObreros() {
  return useQuery({
    queryKey: reunionesObrerosKeys.listado,
    queryFn: async (): Promise<ReunionObrerosListado[]> => {
      const { data, error } = await supabase.rpc("reuniones_obreros_listado");
      if (error) throw error;
      return (data ?? []) as ReunionObrerosListado[];
    },
  });
}

// Asistencias de una reunión concreta, para precargar el checklist al editar.
// Tabla directa: la policy `asisobr_select` ya alcanza para el admin.
export function useAsistenciasObreros(reunionId: string | undefined) {
  return useQuery({
    queryKey: reunionesObrerosKeys.asistencias(reunionId ?? ""),
    enabled: !!reunionId,
    queryFn: async (): Promise<AsistenciaObreros[]> => {
      const { data, error } = await supabase
        .from("asistencias_obreros")
        .select("reunion_id, miembro_id, presente")
        .eq("reunion_id", reunionId!);
      if (error) throw error;
      return (data ?? []) as AsistenciaObreros[];
    },
  });
}

// Candidatos a participante: el padrón activo. Tabla directa y sin RPC porque
// `miembros_select` (0014) le deja al admin leer todo el padrón; esta pantalla
// no existe para nadie más.
//
// Trae el padrón entero y el filtrado por texto queda en la UI: son cientos de
// filas, no miles, y así tipear no dispara una consulta por tecla.
export function useParticipantesPosibles() {
  return useQuery({
    queryKey: reunionesObrerosKeys.participantes,
    queryFn: async (): Promise<Miembro[]> => {
      const { data, error } = await supabase
        .from("miembros")
        .select("*")
        .eq("activo", true)
        .order("apellido", { nullsFirst: false })
        .order("nombre");
      if (error) throw error;
      return (data ?? []) as Miembro[];
    },
  });
}

/* =========================== Escritura =========================== */

export type RegistrarReunionObrerosInput = {
  // null -> alta; uuid -> edición de esa reunión.
  reunion_id?: string | null;
  fecha: string; // "YYYY-MM-DD"
  tema: string | null;
  resumen: string | null;
  asistencias: AsistenciaObrerosInput[];
};

// Llama al RPC transaccional `registrar_reunion_obreros` (0031). La mecánica
// de asistencias es espejo PARCIAL de `registrar_reunion` /
// `registrar_reunion_ministerio`: aditiva en el alta, estado final al editar.
export function useRegistrarReunionObreros() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: RegistrarReunionObrerosInput): Promise<string> => {
      const { data, error } = await supabase.rpc("registrar_reunion_obreros", {
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
      // Editar puede mover la fecha, así que se invalida el prefijo entero
      // (listado + asistencias de cualquier reunión) en vez de una clave sola.
      // `refetchType: "all"` para que el historial también se refresque si
      // quedó montado atrás.
      qc.invalidateQueries({
        queryKey: reunionesObrerosKeys.all,
        refetchType: "all",
      });
    },
  });
}
