// Tipos del dominio — reflejan el esquema de Supabase (supabase/migrations).

export type Sexo = "M" | "F";
export type SexoDiscipulado = "M" | "F" | "mixto";
export type Modalidad = "presencial" | "virtual" | "ambos";
export type RolApp = "admin" | "obrero" | "miembro" | "pendiente";
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
  // Si es false, el teléfono no sale publicado en la vista `directorio`
  // (0020). La gestión (discipulador/admin) lo sigue viendo acá.
  mostrar_contacto: boolean;
  // Baja lógica del padrón (0022): en false la persona sale del directorio y
  // de los cumpleaños, pero conserva ficha e historial. Solo admin lo cambia.
  activo: boolean;
  created_at: string;
};

// Subconjunto seguro de `miembros` que ve todo miembro activo (vista `directorio`).
export type DirectorioEntry = {
  id: string;
  nombre: string;
  apellido: string | null;
  sexo: Sexo;
  fecha_nacimiento: string | null;
  telefono: string | null;
};

export type Profile = {
  id: string;
  miembro_id: string | null;
  rol: RolApp;
  username: string | null;
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

// El grupo propio visto por un participante (RPC `mi_grupo`, 0019): subset de
// `discipulados` con el nombre del líder ya resuelto. Sin datos de gestión.
export type MiGrupo = {
  id: string;
  nombre: string | null;
  descripcion_etaria: string | null;
  sexo: SexoDiscipulado;
  modalidad: Modalidad;
  dia_semana: number;
  hora_inicio: string;
  hora_fin: string | null;
  ubicacion: string | null;
  enlace_virtual: string | null;
  discipulador: string | null;
};

// Reunión vista por un participante (RPC `reuniones_de_mi_grupo`, 0019):
// fecha, tema y quiénes estuvieron. Sin ofrenda, notas ni material.
export type ReunionDeMiGrupo = {
  id: string;
  fecha: string; // "YYYY-MM-DD"
  tema: string | null;
  participantes: string[];
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

/* ============================ Ministerios ============================ */
// Un área o departamento de la iglesia (jóvenes, alabanza, acción social):
// varios líderes equivalentes, gente que participa, reuniones y anuncios
// propios. Es una cuarta "cosa" del dominio, no un `discipulado` con un tipo —
// ver docs/MINISTERIOS.md y supabase/migrations/0024_ministerios.sql.

export type Ministerio = {
  id: string;
  nombre: string;
  descripcion: string | null; // con marcas (lib/richText.ts)
  icono: string | null; // nombre de ionicon
  activo: boolean;
  motivo_baja: string | null;
  fecha_baja: string | null;
  created_at: string;
  // Se resuelve aparte (vista `ministerios_lideres`): `ministerio_lideres`
  // guarda profile_id y la RLS de `profiles` no deja leer el ajeno.
  lideres?: LiderMinisterio[];
};

export type LiderMinisterio = {
  ministerio_id: string;
  profile_id: string;
  nombre_completo: string | null;
};

// Un ministerio propio, visto por el RPC `mis_ministerios()`. `soy_lider` es lo
// que gatea la gestión en la UI: el rol no sirve, porque un líder de ministerio
// puede ser `miembro`. `integrantes` llega null para quien no lidera.
export type MiMinisterio = {
  id: string;
  nombre: string;
  descripcion: string | null;
  icono: string | null;
  soy_lider: boolean;
  lideres: string[];
  integrantes: number | null;
};

// Integrante del roster (RPC `integrantes_de_mi_ministerio`, solo para líderes
// y admin). `telefono` respeta `mostrar_contacto`; sin email ni notas.
// `activo` en false = dado de baja del ministerio: se sigue devolviendo para
// poder ponerle nombre a quien figura en una reunión vieja.
export type IntegranteMinisterio = {
  miembro_id: string;
  nombre: string;
  apellido: string | null;
  telefono: string | null;
  activo: boolean;
};

// Candidato del padrón para sumar al roster (RPC `candidatos_para_ministerio`).
// Espejo de `CandidatoMiembro` (aprobaciones): teléfono ya enmascarado.
export type CandidatoMinisterio = {
  id: string;
  nombre: string;
  apellido: string | null;
  telefono_parcial: string | null;
  similitud: number;
};

// Reunión de ministerio. Espejo de `Reunion` sin `material_url` — la
// contabilidad va en tablas separadas por decisión de producto (0025).
export type ReunionMinisterio = {
  id: string;
  ministerio_id: string;
  fecha: string; // "YYYY-MM-DD"
  tema: string | null;
  modalidad_usada: Modalidad | null;
  ofrenda_total: number | null;
  notas: string | null;
  registrado_por: string | null;
  created_at: string;
};

export type AsistenciaMinisterio = {
  id: string;
  reunion_id: string;
  miembro_id: string;
  presente: boolean;
  modalidad: Modalidad | null;
};

// Reunión vista por un participante (RPC `reuniones_de_mi_ministerio`):
// fecha, tema y quiénes estuvieron. Sin ofrenda ni notas.
export type ReunionDeMiMinisterio = {
  id: string;
  fecha: string;
  tema: string | null;
  participantes: string[];
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

// Actividad RECURRENTE semanal (vs. Evento, que es único con fecha).
// Se repite cada semana en uno o más días (`dias_semana`), con horario fijo,
// hasta marcarse inactiva. Ver docs/ACTIVIDADES-Y-EVENTOS.md.
export type Actividad = {
  id: string;
  titulo: string;
  descripcion: string | null;
  dias_semana: number[]; // 0=domingo … 6=sábado
  hora_inicio: string; // "HH:MM:SS"
  hora_fin: string | null;
  ubicacion: string | null;
  modalidad: Modalidad;
  enlace_virtual: string | null;
  adjunto_url: string | null;
  adjunto_tipo: AdjuntoTipo | null;
  activa: boolean;
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
