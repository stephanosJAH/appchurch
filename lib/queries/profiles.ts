import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../supabase";
import { Profile, RolApp, Sexo } from "../types";

export const profilesKeys = {
  all: ["profiles"] as const,
  pendientes: ["profiles", "pendientes"] as const,
  candidatos: (profileId: string) => ["profiles", "candidatos", profileId] as const,
  miembrosConCuenta: ["profiles", "miembros-con-cuenta"] as const,
  deMiembro: (miembroId: string) => ["profiles", "de-miembro", miembroId] as const,
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

// Qué fichas del padrón ya están enlazadas a una cuenta de la app
// (`profiles.miembro_id`, unique desde 0018). Es la versión en lote de la RPC
// `miembro_tiene_cuenta` (0021), que resuelve de a una ficha: acá se lee
// `profiles` directo para no disparar una llamada por fila de la lista.
//
// Solo tiene sentido para admin: `prof_select` (0002) deja a los demás ver
// únicamente su propio perfil, así que para un obrero el set vendría casi
// vacío. Es una omisión, no una fuga — igual usalo solo en pantallas de admin.
export function useMiembrosConCuenta() {
  return useQuery({
    queryKey: profilesKeys.miembrosConCuenta,
    queryFn: async (): Promise<Set<string>> => {
      const { data, error } = await supabase
        .from("profiles")
        .select("miembro_id")
        .not("miembro_id", "is", null);
      if (error) throw error;
      return new Set((data ?? []).map((p) => p.miembro_id as string));
    },
  });
}

// La cuenta enlazada a una ficha del padrón, o null si esa persona todavía no
// entra a la app. Devuelve el perfil entero (rol incluido), así que es para
// admin: `prof_select` (0002) no le muestra a nadie más el perfil ajeno, y de
// hecho un obrero recibiría null incluso para alguien de su grupo — para "¿tiene
// cuenta?" a secas está `useMiembroTieneCuenta`, que va por RPC definer (0021).
// Pasá `enabled` para no disparar una consulta que la RLS va a vaciar.
export function useCuentaDeMiembro(miembroId: string, enabled = true) {
  return useQuery({
    queryKey: profilesKeys.deMiembro(miembroId),
    enabled: enabled && !!miembroId,
    queryFn: async (): Promise<Profile | null> => {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("miembro_id", miembroId)
        .maybeSingle();
      if (error) throw error;
      return (data as Profile) ?? null;
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
