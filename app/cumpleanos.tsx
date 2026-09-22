import { Ionicons } from "@expo/vector-icons";
import { useMemo, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { CumpleRow, cumplesDelMes } from "../components/Cumples";
import { Card, Label, Muted, Screen, SkeletonRows, Title } from "../components/ui";
import { addMonths, diasHastaCumple, etiquetaCumple, formatMesAnio } from "../lib/date";
import { useDirectorio } from "../lib/queries/directorio";
import { colors } from "../lib/theme";

// Cumpleaños de todo un mes: a esto lleva el "Ver todos" del feed, que solo
// muestra los tres más próximos.
//
// El feed lista una ventana de días (30) que puede cruzar de mes, así que la
// pantalla trae flechas para cambiar de mes: sin ellas, un cumpleaños de los
// primeros días del mes que viene aparecía en el feed y no se podía encontrar
// acá.
//
// Fuente: la vista `directorio` (subset seguro, filtrado por RLS), la misma que
// usa el feed. Acá no se expone nada nuevo: nombre y día de cumpleaños.
export default function Cumpleanos() {
  const { data: directorio = [], isLoading } = useDirectorio();
  const [refMes, setRefMes] = useState(() => new Date());

  const items = useMemo(() => cumplesDelMes(directorio, refMes), [directorio, refMes]);

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Navegación de mes, igual que la del calendario. */}
        <View className="mb-4 flex-row items-center justify-between">
          <Pressable
            onPress={() => setRefMes((m) => addMonths(m, -1))}
            hitSlop={8}
            className="h-9 w-9 items-center justify-center rounded-full bg-surface-mid active:opacity-70"
          >
            <Ionicons name="chevron-back" size={18} color={colors.primary} />
          </Pressable>
          <Title className="capitalize text-base">{formatMesAnio(refMes)}</Title>
          <Pressable
            onPress={() => setRefMes((m) => addMonths(m, 1))}
            hitSlop={8}
            className="h-9 w-9 items-center justify-center rounded-full bg-surface-mid active:opacity-70"
          >
            <Ionicons name="chevron-forward" size={18} color={colors.primary} />
          </Pressable>
        </View>

        {isLoading ? (
          <SkeletonRows count={4} accesorio={72} />
        ) : items.length === 0 ? (
          <Card>
            <Muted>Nadie cumple años este mes.</Muted>
          </Card>
        ) : (
          <>
            <Label className="mb-2">
              {items.length === 1 ? "1 cumpleaños" : `${items.length} cumpleaños`}
            </Label>
            <View className="gap-2.5">
              {items.map((m) => {
                const dias = diasHastaCumple(m.fecha_nacimiento) ?? 0;
                // El chip es una cuenta regresiva: sirve para lo que viene, no
                // para lo que ya pasó. En un cumpleaños de este mes que ya fue
                // —o de un mes anterior— `diasHastaCumple` cuenta hasta el del
                // año que viene y diría "En 340 días". Ahí se esconde: el día
                // ya está escrito en la fila.
                const etiqueta = dias <= 60 ? etiquetaCumple(dias) : null;
                return <CumpleRow key={m.id} miembro={m} dias={dias} etiqueta={etiqueta} />;
              })}
            </View>
          </>
        )}
      </ScrollView>
    </Screen>
  );
}
