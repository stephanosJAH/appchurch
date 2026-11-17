import { ReunionesConActa } from "../../components/ReunionesConActa";
import {
  useAsistenciasObreros,
  useRegistrarReunionObreros,
  useReunionesObreros,
} from "../../lib/queries/reunionesObreros";

// Reunión de obreros: participantes + acta de lo tratado. Pantalla de
// administración (Perfil → Administración). La UI es la misma que la de la
// reunión general (components/ReunionesConActa.tsx); acá sólo van sus hooks y
// sus textos. Ver supabase/migrations/0031_reuniones_obreros.sql.
export default function AdminReunionesObreros() {
  return (
    <ReunionesConActa
      useListado={useReunionesObreros}
      useAsistencias={useAsistenciasObreros}
      useRegistrar={useRegistrarReunionObreros}
      textos={{
        nombre: "Reunión de obreros",
        nombreCorto: "reunión de obreros",
        intro:
          "Las reuniones del cuerpo de obreros: quiénes participaron y el resumen de lo que se trató. No registran ofrenda.",
        vacio:
          "Todavía no hay reuniones registradas. La primera que cargues aparece acá, de la más nueva a la más vieja.",
        etiquetaResumen: "Resumen de lo tratado",
        placeholderResumen: "Temas tratados, decisiones, quién queda a cargo de qué…",
        ayudaResumen:
          "Lo lee cualquier administrador. Los temas delicados sobre una persona van en las notas de su ficha, no acá.",
      }}
    />
  );
}
