import { useQuery } from "@tanstack/react-query";
import { supabase } from "../supabase";
import { MiGrupo, ReunionDeMiGrupo } from "../types";

export const miGrupoKeys = {
  all: ["mi-grupo"] as const,
  reuniones: (discipuladoId: string) => ["mi-grupo", "reuniones", discipuladoId] as const,
};

// Los discipulados donde participa quien mira (no los que lidera: para eso está
// useDiscipulados). Vía RPC porque la RLS de `discipulados` solo deja pasar al
// líder y al admin — ver supabase/migrations/0019_mi_grupo.sql.
// Devuelve [] si la cuenta no tiene ficha del padrón enlazada (profiles.miembro_id).
export function useMiGrupo() {
  return useQuery({
    queryKey: miGrupoKeys.all,
    queryFn: async (): Promise<MiGrupo[]> => {
      const { data, error } = await supabase.rpc("mi_grupo");
      if (error) throw error;
      return (data ?? []) as MiGrupo[];
    },
  });
}

// Historial del grupo para un participante: fecha, tema y presentes.
// El RPC valida la participación activa; un id ajeno devuelve error.
export function useReunionesDeMiGrupo(discipuladoId?: string) {
  return useQuery({
    queryKey: miGrupoKeys.reuniones(discipuladoId ?? ""),
    enabled: !!discipuladoId,
    queryFn: async (): Promise<ReunionDeMiGrupo[]> => {
      const { data, error } = await supabase.rpc("reuniones_de_mi_grupo", {
        p_discipulado_id: discipuladoId,
      });
      if (error) throw error;
      return (data ?? []) as ReunionDeMiGrupo[];
    },
  });
}
