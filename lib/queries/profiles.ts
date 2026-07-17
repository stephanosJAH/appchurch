import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../supabase";
import { Profile, RolApp, Sexo } from "../types";

export const profilesKeys = {
  all: ["profiles"] as const,
  pendientes: ["profiles", "pendientes"] as const,
  candidatos: (profileId: string) => ["profiles", "candidatos", profileId] as const,
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
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: profilesKeys.all, refetchType: "all" });
      qc.invalidateQueries({ queryKey: profilesKeys.pendientes, refetchType: "all" });
    },
  });
}

// Cuentas recién registradas, a la espera de que un obrero/admin las habilite.
// Visible para obrero/admin por RLS (prof_obrero_ve_pendientes / prof_admin).
export function usePendientes(enabled = true) {
  return useQuery({
    queryKey: profilesKeys.pendientes,
    enabled,
    queryFn: async (): Promise<Profile[]> => {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("rol", "pendiente")
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data as Profile[];
    },
  });
}

// Candidato del padrón para enlazar una cuenta pendiente (RPC candidatos_para_perfil,
// 0018). Rankeados por similitud de nombre + teléfono; teléfono ya viene enmascarado
// (últimos 4 dígitos) desde el server.
export type CandidatoMiembro = {
  id: string;
  nombre: string;
  apellido: string | null;
  telefono_parcial: string | null;
  similitud: number;
};

// Busca en el padrón quién podría ser esta cuenta pendiente. Solo obrero/admin
// (lo exige la RPC). Se dispara al abrir una cuenta en la aprobación, no en la lista.
export function useCandidatosParaPerfil(profileId: string | null, enabled = true) {
  return useQuery({
    queryKey: profilesKeys.candidatos(profileId ?? ""),
    enabled: enabled && !!profileId,
    queryFn: async (): Promise<CandidatoMiembro[]> => {
      const { data, error } = await supabase.rpc("candidatos_para_perfil", {
        p_profile_id: profileId,
      });
      if (error) throw error;
      return (data ?? []) as CandidatoMiembro[];
    },
  });
}

export type ResolverIdentidadInput =
  | { profileId: string; miembroId: string }
  | {
      profileId: string;
      nuevaFicha: {
        nombre: string;
        apellido: string | null;
        sexo: Sexo;
        fecha_nacimiento: string | null;
        telefono: string | null;
      };
    };

// Resuelve la identidad de una cuenta pendiente (enlaza a una ficha existente
// del padrón, o crea una nueva) y la activa a 'miembro' en el mismo paso
// atómico (RPC resolver_identidad_pendiente, 0018). Reemplaza el viejo
// "activar" que solo cambiaba el rol sin tocar profiles.miembro_id.
export function useResolverIdentidad() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: ResolverIdentidadInput) => {
      const { error } = await supabase.rpc("resolver_identidad_pendiente", {
        p_profile_id: input.profileId,
        p_miembro_id: "miembroId" in input ? input.miembroId : null,
        p_nombre: "nuevaFicha" in input ? input.nuevaFicha.nombre : null,
        p_apellido: "nuevaFicha" in input ? input.nuevaFicha.apellido : null,
        p_sexo: "nuevaFicha" in input ? input.nuevaFicha.sexo : null,
        p_fecha_nacimiento: "nuevaFicha" in input ? input.nuevaFicha.fecha_nacimiento : null,
        p_telefono: "nuevaFicha" in input ? input.nuevaFicha.telefono : null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: profilesKeys.pendientes, refetchType: "all" });
      qc.invalidateQueries({ queryKey: profilesKeys.all, refetchType: "all" });
      // El nuevo miembro (enlazado o creado) puede aparecer en el directorio.
      qc.invalidateQueries({ queryKey: ["directorio"] });
    },
  });
}
