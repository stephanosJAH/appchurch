import { useQuery } from "@tanstack/react-query";
import { supabase } from "../supabase";
import { DirectorioEntry } from "../types";

export const directorioKeys = {
  all: ["directorio"] as const,
};

// Directorio de la congregación: subset seguro de `miembros` (nombre, apellido,
// sexo, cumpleaños y teléfono) que ve todo miembro activo vía la vista
// `directorio` (RLS). No expone email ni notas.
export function useDirectorio() {
  return useQuery({
    queryKey: directorioKeys.all,
    queryFn: async (): Promise<DirectorioEntry[]> => {
      const { data, error } = await supabase
        .from("directorio")
        .select("*")
        .order("apellido", { nullsFirst: false })
        .order("nombre");
      if (error) throw error;
      return data as DirectorioEntry[];
    },
  });
}
