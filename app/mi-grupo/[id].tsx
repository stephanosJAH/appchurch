import { Stack, useLocalSearchParams } from "expo-router";
import { MiGrupoDetalle } from "../../components/MiGrupo";
import { Screen } from "../../components/ui";
import { acuarela, colors, fonts } from "../../lib/theme";

// Detalle en modo lectura de un discipulado del que se participa como
// discípulo. Los grupos que uno lidera van por /discipulado/[id], que sí trae
// la gestión (roster, reuniones, ofrendas). Barra medianoche, continua con la
// acuarela del encabezado, igual que ese resumen.
export default function MiGrupoDetallePantalla() {
  const { id } = useLocalSearchParams<{ id: string }>();

  return (
    <Screen>
      <Stack.Screen
        options={{
          headerStyle: { backgroundColor: acuarela.medianoche },
          headerTintColor: colors.onPrimary,
          headerTitleStyle: { color: colors.onPrimary, fontFamily: fonts.sansBold, fontSize: 16 },
        }}
      />
      <MiGrupoDetalle grupoId={String(id)} />
    </Screen>
  );
}
