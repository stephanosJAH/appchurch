// Tipos del dominio — reflejan el esquema de Supabase (supabase/migrations).

export type Sexo = "M" | "F";
export type SexoDiscipulado = "M" | "F" | "mixto";
export type Modalidad = "presencial" | "virtual" | "ambos";
export type RolApp = "admin" | "discipulador";
export type TipoEvento = "general" | "discipulado" | "otro";

export type Miembro = {
  id: string;
  nombre: string;
  apellido: string | null;
  sexo: Sexo;
  fecha_nacimiento: string | null;
  telefono: string | null;
  email: string | null;
  notas: string | null;
  created_at: string;
};

export type Profile = {
  id: string;
  miembro_id: string | null;
  rol: RolApp;
  nombre_completo: string | null;
  created_at: string;
};

export type Discipulado = {
  id: string;
  discipulador_id: string | null;
  nombre: string | null;
  descripcion_etaria: string | null;
  sexo: SexoDiscipulado;
  modalidad: Modalidad;
  dia_semana: number; // 0=domingo … 6=sábado
  hora_inicio: string; // "HH:MM:SS"
  hora_fin: string | null;
  ubicacion: string | null;
  enlace_virtual: string | null;
  activo: boolean;
  motivo_baja: string | null;
  fecha_baja: string | null;
  created_at: string;
  // Embed opcional del líder (se resuelve vía RLS; null si no es visible/asignado).
  discipulador?: { nombre_completo: string | null } | null;
};

export type Participacion = {
  id: string;
  discipulado_id: string;
  miembro_id: string;
  activo: boolean;
  fecha_inicio: string | null;
  created_at: string;
  miembro?: Miembro;
};

export type Reunion = {
  id: string;
  discipulado_id: string;
  fecha: string; // "YYYY-MM-DD"
  tema: string | null;
  material_url: string | null;
  modalidad_usada: Modalidad | null;
  ofrenda_total: number | null;
  notas: string | null;
  registrado_por: string | null;
  created_at: string;
};

export type Asistencia = {
  id: string;
  reunion_id: string;
  miembro_id: string;
  presente: boolean;
  modalidad: Modalidad | null;
};

export type AdjuntoTipo = "imagen" | "pdf";

export type Evento = {
  id: string;
  titulo: string;
  descripcion: string | null;
  tipo: TipoEvento;
  discipulado_id: string | null;
  fecha_inicio: string;
  fecha_fin: string;
  ubicacion: string | null;
  adjunto_url: string | null;
  adjunto_tipo: AdjuntoTipo | null;
  creado_por: string | null;
  created_at: string;
};

export const DIAS_SEMANA = [
  "Domingo",
  "Lunes",
  "Martes",
  "Miércoles",
  "Jueves",
  "Viernes",
  "Sábado",
] as const;

// Item del checklist de asistencia que viaja al RPC registrar_reunion.
export type AsistenciaInput = {
  miembro_id: string;
  presente: boolean;
  modalidad: Modalidad | null;
};
