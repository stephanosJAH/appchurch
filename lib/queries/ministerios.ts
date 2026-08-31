import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../supabase";
import {
  AsistenciaInput,
  CandidatoMinisterio,
  IntegranteMinisterio,
  LiderMinisterio,
  MiMinisterio,
  Ministerio,
  Modalidad,
  ReunionDeMiMinisterio,
  ReunionMinisterio,
  Sexo,
} from "../types";

// Ministerios: áreas de la iglesia con varios líderes equivalentes, roster
// propio, reuniones con ofrenda y anuncios. Ver docs/MINISTERIOS.md y las
// migraciones 0024 (identidad/roster) y 0025 (reuniones).
//
// Lo que hace distinto a este archivo del resto de `lib/queries/*`: casi nada
// se lee de las tablas directo. La RLS de `miembros` (0014) no le deja al líder
// —que puede ser un `miembro` común— leer el padrón, así que el roster, la
// búsqueda de candidatos y "cuáles son mis ministerios" van por RPC definer.
// Lo que sí es tabla directa son `ministerios`, `ministerio_miembros`,
// `reuniones_ministerio` y `asistencias_ministerio`, donde la policy ya alcanza.

export const ministeriosKeys = {
  all: ["ministerios"] as const,
  inactivos: ["ministerios", "inactivos"] as const,
  lideres: ["ministerios", "lideres"] as const,
  mios: ["ministerios", "mios"] as const,
  detail: (id: string) => ["ministerios", id] as const,
  integrantes: (id: string) => ["ministerios", id, "integrantes"] as const,
  candidatos: (id: string, texto: string) =>
    ["ministerios", id, "candidatos", texto] as const,
  reuniones: (id: string) => ["reuniones-ministerio", id] as const,
  reunionesDeParticipante: (id: string) =>
    ["ministerios", id, "reuniones-participante"] as const,
  reunionDetalle: (reunionId: string) =>
    ["reuniones-ministerio", "detalle", reunionId] as const,
  ofrendas: (desde: string, hasta: string) =>
    ["reuniones-ministerio", "ofrendas", desde, hasta] as const,
  ofrendasMes: (desde: string, hasta: string) =>
    ["reuniones-ministerio", "mes", desde, hasta] as const,
};

/* ============================ Ministerios ============================ */

// Los líderes de todos los ministerios, en una sola consulta a la vista
// `ministerios_lideres` (0024). Es una vista y no un embed de PostgREST porque
// `ministerio_lideres` guarda `profile_id` y `prof_select` (0002) no deja leer
// el perfil ajeno: sin la vista la UI mostraría uuids.
export function useLideresMinisterios() {
  return useQuery({
    queryKey: ministeriosKeys.lideres,
    queryFn: async (): Promise<LiderMinisterio[]> => {
      const { data, error } = await supabase
        .from("ministerios_lideres")
        .select("*")
        .order("nombre_completo", { nullsFirst: false });
      if (error) throw error;
      return (data ?? []) as LiderMinisterio[];
    },
  });
}

function conLideres(ministerios: Ministerio[], lideres: LiderMinisterio[]): Ministerio[] {
  return ministerios.map((m) => ({
    ...m,
    lideres: lideres.filter((l) => l.ministerio_id === m.id),
  }));
}

// Ministerios activos. Los ve cualquier miembro activo (`min_select`, 0024):
// que un ministerio exista y quién lo lidera es información de la congregación,
// a diferencia del roster.
export function useMinisterios() {
  const { data: lideres = [] } = useLideresMinisterios();
  return useQuery({
    queryKey: ministeriosKeys.all,
    queryFn: async (): Promise<Ministerio[]> => {
      const { data, error } = await supabase
        .from("ministerios")
        .select("*")
        .eq("activo", true)
        .order("nombre");
      if (error) throw error;
      return data as Ministerio[];
    },
    // Se combina en `select` y no en el queryFn para que la caché guarde los
    // ministerios tal como llegaron: cuando cambia un líder no hay que volver
    // a pedirlos.
    select: (ministerios) => conLideres(ministerios, lideres),
  });
}

// Ministerios dados de baja — solo el admin los ve (`min_select`).
export function useMinisteriosInactivos() {
  return useQuery({
    queryKey: ministeriosKeys.inactivos,
    queryFn: async (): Promise<Ministerio[]> => {
      const { data, error } = await supabase
        .from("ministerios")
        .select("*")
        .eq("activo", false)
        .order("fecha_baja", { ascending: false });
      if (error) throw error;
      return data as Ministerio[];
    },
  });
}

export function useMinisterio(id: string) {
  const { data: lideres = [] } = useLideresMinisterios();
  return useQuery({
    queryKey: ministeriosKeys.detail(id),
    enabled: !!id,
    queryFn: async (): Promise<Ministerio | null> => {
      const { data, error } = await supabase
        .from("ministerios")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return data as Ministerio | null;
    },
    select: (m) => (m ? conLideres([m], lideres)[0] : null),
  });
}

// Los ministerios donde participo o lidero (RPC `mis_ministerios`, 0024).
// Un participante no puede leer `ministerio_miembros`, así que "cuáles son los
// míos" no se resuelve desde el cliente.
//
// **Este hook es el que gatea la UI de ministerios, no `esObrero`**: un líder
// de ministerio puede ser `miembro` (el poder viene de la asignación, no del
// rol). Preguntar por el rol dejaría afuera justo a quien tiene que gestionar.
export function useMisMinisterios() {
  return useQuery({
    queryKey: ministeriosKeys.mios,
    queryFn: async (): Promise<MiMinisterio[]> => {
      const { data, error } = await supabase.rpc("mis_ministerios");
      if (error) throw error;
      return (data ?? []) as MiMinisterio[];
    },
  });
}

// ¿Lidero este ministerio? Se resuelve contra `mis_ministerios()` (ya cacheada)
// en lugar de una consulta nueva. El admin gestiona todo aunque no lidere nada.
export function useSoyLiderDe(ministerioId?: string) {
  const { data: mios = [], isLoading } = useMisMinisterios();
  return {
    soyLider: !!ministerioId && mios.some((m) => m.id === ministerioId && m.soy_lider),
    participo: !!ministerioId && mios.some((m) => m.id === ministerioId),
    isLoading,
  };
}

export type MinisterioInput = {
  nombre: string;
  descripcion: string | null;
  icono: string | null;
};

// Alta y edición. El admin puede lo que quiera; el líder solo edita nombre,
// descripción e ícono de su ministerio (`min_lider_update` + el trigger
// `trg_solo_admin_baja_ministerio`, que le corta la baja).
export function useUpsertMinisterio() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (
      input: Partial<MinisterioInput> & { id?: string }
    ): Promise<Ministerio> => {
      const { data, error } = await supabase
        .from("ministerios")
        .upsert(input)
        .select()
        .single();
      if (error) throw error;
      return data as Ministerio;
    },
    onSuccess: () => invalidarMinisterios(qc),
  });
}

// refetchType "all" refresca también las pantallas en segundo plano (el hub de
// "Mi grupo", el ABM de admin), igual que en discipulados.
function invalidarMinisterios(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ministeriosKeys.all, refetchType: "all" });
  qc.invalidateQueries({ queryKey: ministeriosKeys.inactivos, refetchType: "all" });
}

// Baja lógica: mismo criterio que `discipulados` (0006). No libera a los
// líderes — si el ministerio vuelve, vuelve con su gente; el admin los saca a
// mano si hace falta.
export function useBajaMinisterio() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, motivo }: { id: string; motivo: string }) => {
      const { error } = await supabase
        .from("ministerios")
        .update({
          activo: false,
          motivo_baja: motivo,
          fecha_baja: new Date().toISOString(),
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => invalidarMinisterios(qc),
  });
}

export function useReactivarMinisterio() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("ministerios")
        .update({ activo: true, motivo_baja: null, fecha_baja: null })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => invalidarMinisterios(qc),
  });
}

/* ============================ Líderes ============================ */

// Sumar o sacar líderes es lo ÚNICO que un líder no puede hacer: la policy
// `minlid_admin` (0024) lo deja solo al admin, para que un líder no se vuelva
// administrador de hecho de su área sumando cuentas (diferido #6).
export function useAsignarLideres() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      ministerioId,
      profileIds,
    }: {
      ministerioId: string;
      profileIds: string[];
    }) => {
      // El estado final manda: se borra lo que ya no está y se inserta lo nuevo.
      // Sin `not in` cuando la lista queda vacía — PostgREST necesita al menos
      // un elemento para el filtro `in`.
      const borrar = supabase
        .from("ministerio_lideres")
        .delete()
        .eq("ministerio_id", ministerioId);
      const { error: errorBorrar } = profileIds.length
        ? await borrar.not("profile_id", "in", `(${profileIds.join(",")})`)
        : await borrar;
      if (errorBorrar) throw errorBorrar;

      if (profileIds.length) {
        const { error } = await supabase.from("ministerio_lideres").upsert(
          profileIds.map((profile_id) => ({ ministerio_id: ministerioId, profile_id })),
          { onConflict: "ministerio_id,profile_id" }
        );
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ministeriosKeys.lideres, refetchType: "all" });
      qc.invalidateQueries({ queryKey: ministeriosKeys.mios, refetchType: "all" });
    },
  });
}

/* ============================ Roster ============================ */

// Roster del ministerio (RPC `integrantes_de_mi_ministerio`, 0024). Solo líder
// o admin. Devuelve también a los dados de baja (`activo: false`) porque son
// los que figuran en reuniones viejas: filtralos vos para la lista de gestión,
// y usá el conjunto completo para resolver nombres del historial.
export function useIntegrantesMinisterio(ministerioId?: string, enabled = true) {
  return useQuery({
    queryKey: ministeriosKeys.integrantes(ministerioId ?? ""),
    enabled: enabled && !!ministerioId,
    queryFn: async (): Promise<IntegranteMinisterio[]> => {
      const { data, error } = await supabase.rpc("integrantes_de_mi_ministerio", {
        p_ministerio: ministerioId,
      });
      if (error) throw error;
      return (data ?? []) as IntegranteMinisterio[];
    },
  });
}

// Buscar en el padrón a quién sumar (RPC `candidatos_para_ministerio`, 0024).
// La RPC exige 2 caracteres; acá se replica para no disparar la llamada al
// primer tecleo.
export function useCandidatosMinisterio(ministerioId?: string, texto = "") {
  const busqueda = texto.trim();
  return useQuery({
    queryKey: ministeriosKeys.candidatos(ministerioId ?? "", busqueda),
    enabled: !!ministerioId && busqueda.length >= 2,
    queryFn: async (): Promise<CandidatoMinisterio[]> => {
      const { data, error } = await supabase.rpc("candidatos_para_ministerio", {
        p_ministerio: ministerioId,
        p_texto: busqueda,
      });
      if (error) throw error;
      return (data ?? []) as CandidatoMinisterio[];
    },
  });
}

function invalidarRoster(qc: ReturnType<typeof useQueryClient>, ministerioId: string) {
  qc.invalidateQueries({ queryKey: ministeriosKeys.integrantes(ministerioId) });
  // El conteo de integrantes viaja en mis_ministerios().
  qc.invalidateQueries({ queryKey: ministeriosKeys.mios, refetchType: "all" });
  qc.invalidateQueries({ queryKey: ["ministerios", ministerioId, "candidatos"] });
}

// Sumar a alguien que YA está en el padrón: insert directo, la policy del
// roster ya autoriza al líder. El upsert reactiva a quien había sido dado de
// baja del ministerio en vez de chocar contra el unique.
export function useAgregarIntegrante(ministerioId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (miembroId: string) => {
      const { error } = await supabase
        .from("ministerio_miembros")
        .upsert(
          { ministerio_id: ministerioId, miembro_id: miembroId, activo: true },
          { onConflict: "ministerio_id,miembro_id" }
        );
      if (error) throw error;
    },
    onSuccess: () => invalidarRoster(qc, ministerioId),
  });
}

// Crear una ficha nueva del padrón y sumarla, para quien todavía no existe
// (RPC `agregar_integrante_ministerio`). Va por RPC porque `miembros_insert`
// (0014) exige obrero o admin y un líder de ministerio puede ser `miembro`.
export function useCrearIntegranteMinisterio(ministerioId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      nombre: string;
      apellido?: string | null;
      sexo: Sexo;
      telefono?: string | null;
    }): Promise<string> => {
      const { data, error } = await supabase.rpc("agregar_integrante_ministerio", {
        p_ministerio_id: ministerioId,
        p_nombre: input.nombre,
        p_apellido: input.apellido ?? null,
        p_sexo: input.sexo,
        p_telefono: input.telefono ?? null,
      });
      if (error) throw error;
      return data as string; // miembro_id
    },
    onSuccess: () => {
      invalidarRoster(qc, ministerioId);
      qc.invalidateQueries({ queryKey: ["miembros"] });
    },
  });
}

// Baja del roster: `activo = false`, nunca delete — la fila se queda para
// poder ponerle nombre a quien figura en una reunión vieja.
export function useQuitarIntegrante(ministerioId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (miembroId: string) => {
      const { error } = await supabase
        .from("ministerio_miembros")
        .update({ activo: false })
        .eq("ministerio_id", ministerioId)
        .eq("miembro_id", miembroId);
      if (error) throw error;
    },
    onSuccess: () => invalidarRoster(qc, ministerioId),
  });
}

/* ============================ Reuniones ============================ */

// Reunión con el ministerio embebido (para el desglose de ofrendas).
export type ReunionMinisterioConNombre = ReunionMinisterio & {
  ministerio?: { nombre: string | null } | null;
};

// Detalle de una reunión. A diferencia de `useReunion` (discipulados), las
// asistencias NO traen el miembro embebido: la RLS de `miembros` no deja al
// líder leer el padrón. Los nombres los resuelve la pantalla contra
// `useIntegrantesMinisterio`, que sí incluye a los dados de baja del roster.
export type ReunionMinisterioDetalle = ReunionMinisterio & {
  asistencias?: { id: string; miembro_id: string; presente: boolean; modalidad: Modalidad | null }[];
};

export function useReunionMinisterio(reunionId: string) {
  return useQuery({
    queryKey: ministeriosKeys.reunionDetalle(reunionId),
    enabled: !!reunionId,
    queryFn: async (): Promise<ReunionMinisterioDetalle | null> => {
      const { data, error } = await supabase
        .from("reuniones_ministerio")
        .select("*, asistencias:asistencias_ministerio(id, miembro_id, presente, modalidad)")
        .eq("id", reunionId)
        .maybeSingle();
      if (error) throw error;
      return data as ReunionMinisterioDetalle | null;
    },
  });
}

// Historial completo de un ministerio (con ofrenda y notas): solo líder/admin,
// la RLS de `reuniones_ministerio` hace el corte.
export function useReunionesMinisterio(ministerioId?: string, enabled = true) {
  return useQuery({
    queryKey: ministeriosKeys.reuniones(ministerioId ?? ""),
    enabled: enabled && !!ministerioId,
    queryFn: async (): Promise<ReunionMinisterio[]> => {
      const { data, error } = await supabase
        .from("reuniones_ministerio")
        .select("*")
        .eq("ministerio_id", ministerioId)
        .order("fecha", { ascending: false });
      if (error) throw error;
      return data as ReunionMinisterio[];
    },
  });
}

// Historial visto por un participante (RPC `reuniones_de_mi_ministerio`):
// fecha, tema y presentes, sin ofrenda ni notas. El corte va en el `returns
// table` del RPC, no acá.
export function useReunionesDeMiMinisterio(ministerioId?: string, enabled = true) {
  return useQuery({
    queryKey: ministeriosKeys.reunionesDeParticipante(ministerioId ?? ""),
    enabled: enabled && !!ministerioId,
    queryFn: async (): Promise<ReunionDeMiMinisterio[]> => {
      const { data, error } = await supabase.rpc("reuniones_de_mi_ministerio", {
        p_ministerio: ministerioId,
      });
      if (error) throw error;
      return (data ?? []) as ReunionDeMiMinisterio[];
    },
  });
}

// Ofrendas de ministerio en un rango, con el nombre del ministerio embebido.
// Libro separado del de discipulados por decisión de producto (ver 0025).
export function useOfrendasMinisterio(desde: string, hasta: string, enabled = true) {
  return useQuery({
    queryKey: ministeriosKeys.ofrendas(desde, hasta),
    enabled,
    queryFn: async (): Promise<ReunionMinisterioConNombre[]> => {
      const { data, error } = await supabase
        .from("reuniones_ministerio")
        .select("*, ministerio:ministerios(nombre)")
        .gte("fecha", desde)
        .lte("fecha", hasta)
        .order("fecha", { ascending: false });
      if (error) throw error;
      return data as ReunionMinisterioConNombre[];
    },
  });
}

// Reuniones del mes (para el resumen de Perfil).
export function useReunionesMinisterioMes(desde: string, hasta: string, enabled = true) {
  return useQuery({
    queryKey: ministeriosKeys.ofrendasMes(desde, hasta),
    enabled,
    queryFn: async (): Promise<ReunionMinisterio[]> => {
      const { data, error } = await supabase
        .from("reuniones_ministerio")
        .select("*")
        .gte("fecha", desde)
        .lte("fecha", hasta);
      if (error) throw error;
      return data as ReunionMinisterio[];
    },
  });
}

export type RegistrarReunionMinisterioInput = {
  // Presente solo al editar; en el alta va null y el backend resuelve por
  // (ministerio_id, fecha).
  reunion_id?: string | null;
  ministerio_id: string;
  fecha: string;
  tema: string | null;
  modalidad: Modalidad | null;
  ofrenda: number;
  notas: string | null;
  asistencias: AsistenciaInput[];
};

// Llama al RPC transaccional `registrar_reunion_ministerio` (0025), espejo de
// `registrar_reunion`. Autoriza por pertenencia a `ministerio_lideres`: un
// líder edita la reunión que cargó otro, y `registrado_por` no se pisa.
export function useRegistrarReunionMinisterio() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: RegistrarReunionMinisterioInput): Promise<string> => {
      const { data, error } = await supabase.rpc("registrar_reunion_ministerio", {
        p_ministerio_id: input.ministerio_id,
        p_fecha: input.fecha,
        p_tema: input.tema,
        p_modalidad: input.modalidad,
        p_ofrenda: input.ofrenda,
        p_notas: input.notas,
        p_asistencias: input.asistencias,
        p_reunion_id: input.reunion_id ?? null,
      });
      if (error) throw error;
      return data as string; // reunion_id
    },
    onSuccess: (_id, input) => {
      // Editar puede mover la fecha y cambiar la ofrenda: además del historial
      // quedan viejos el mes y el desglose de ofrendas, y todas esas claves
      // cuelgan de "reuniones-ministerio".
      qc.invalidateQueries({ queryKey: ["reuniones-ministerio"], refetchType: "all" });
      qc.invalidateQueries({
        queryKey: ministeriosKeys.reunionesDeParticipante(input.ministerio_id),
        refetchType: "all",
      });
    },
  });
}
