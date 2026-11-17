import { ReunionesConActa } from "../../components/ReunionesConActa";
import {
  useAsistenciasGenerales,
  useRegistrarReunionGeneral,
  useReunionesGenerales,
} from "../../lib/queries/reunionesGenerales";

// Reunión general: participantes + resumen de lo tratado. Misma UI que la
// reunión de obreros (components/ReunionesConActa.tsx) contra sus propias
// tablas. Ver supabase/migrations/0041_reuniones_generales.sql.
export default function AdminReunionesGenerales() {
  return (
    <ReunionesConActa
      useListado={useReunionesGenerales}
      useAsistencias={useAsistenciasGenerales}
      useRegistrar={useRegistrarReunionGeneral}
      textos={{
        nombre: "Reunión general",
        nombreCorto: "reunión general",
        intro:
          "Las reuniones generales de la iglesia: quiénes participaron y el resumen de lo que se trató. No registran ofrenda.",
        vacio:
          "Todavía no hay reuniones generales registradas. La primera que cargues aparece acá, de la más nueva a la más vieja.",
        etiquetaResumen: "Resumen de la reunión",
        placeholderResumen: "Temas tratados, anuncios, decisiones…",
        ayudaResumen:
          "Lo lee cualquier administrador. Los temas delicados sobre una persona van en las notas de su ficha, no acá.",
      }}
    />
  );
}
