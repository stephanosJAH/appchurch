import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../supabase";
import { Sexo } from "../types";

// Datos personales autoeditables por el propio miembro (subconjunto de `miembros`
// sin `notas`). Se leen/escriben por RPC security-definer acotado a auth.uid()
// (ver supabase/migrations/0016_mis_datos.sql).
export type MisDatos = {
  id: string;
  nombre: string;
  apellido: string | null;
  sexo: Sexo;
  fecha_nacimiento: string | null;
  telefono: string | null;
  email: string | null;
  // Consentimiento para publicar el teléfono en el directorio (0020). No
  // afecta lo que ven el discipulador ni el admin.
  mostrar_contacto: boolean;
};

export const misDatosKeys = {
  all: ["mis-datos"] as const,
};

// Devuelve la ficha propia, o null si la cuenta todavía no tiene una enlazada.
export function useMisDatos(enabled = true) {
  return useQuery({
    queryKey: misDatosKeys.all,
    enabled,
    queryFn: async (): Promise<MisDatos | null> => {
      const { data, error } = await supabase.rpc("mis_datos");
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      return (row as MisDatos) ?? null;
    },
  });
}

export type GuardarMisDatosInput = Omit<MisDatos, "id">;

export function useGuardarMisDatos() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: GuardarMisDatosInput): Promise<MisDatos> => {
      const { data, error } = await supabase.rpc("guardar_mis_datos", {
        p_nombre: input.nombre,
        p_apellido: input.apellido,
        p_sexo: input.sexo,
        p_fecha_nacimiento: input.fecha_nacimiento,
        p_telefono: input.telefono,
        p_email: input.email,
        p_mostrar_contacto: input.mostrar_contacto,
      });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      return row as MisDatos;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: misDatosKeys.all });
      // El cambio se refleja en el directorio y en el padrón que ve la gestión.
      qc.invalidateQueries({ queryKey: ["directorio"] });
      qc.invalidateQueries({ queryKey: ["miembros"] });
    },
  });
}
