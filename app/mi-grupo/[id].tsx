import { useLocalSearchParams } from "expo-router";
import { View } from "react-native";
import { MiGrupoDetalle } from "../../components/MiGrupo";
import { Screen } from "../../components/ui";

// Detalle en modo lectura de un discipulado del que se participa como
// discípulo. Los grupos que uno lidera van por /discipulado/[id], que sí trae
// la gestión (roster, reuniones, ofrendas).
export default function MiGrupoDetallePantalla() {
  const { id } = useLocalSearchParams<{ id: string }>();

  return (
    <Screen>
      <MiGrupoDetalle grupoId={String(id)} />
    </Screen>
  );
}
