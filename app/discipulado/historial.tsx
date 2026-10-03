import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { FechaBloque } from "../../components/FechaBloque";
import { Body, Card, Muted, Screen, Title } from "../../components/ui";
import { presentesDe } from "../../lib/asistencia";
import { formatMoneda } from "../../lib/date";
import { colors, fonts } from "../../lib/theme";
import { ReunionConAsistencia, useReunionesConAsistencia } from "../../lib/queries/reuniones";

// "2026-09" -> "Septiembre de 2026". Mayúscula solo en la primera letra: la
// clase `capitalize` de RN la pone en cada palabra ("Septiembre De 2026").
function labelMes(clave: string): string {
  const [y, m] = clave.split("-").map(Number);
  const texto = new Date(y, m - 1, 1).toLocaleDateString("es-AR", {
    month: "long",
    year: "numeric",
  });
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

type MesReuniones = {
  clave: string; // "YYYY-MM"
  total: number;
  reuniones: ReunionConAsistencia[];
};

// Historial completo de un discipulado, agrupado por mes (más reciente primero),
// con la ofrenda y la asistencia de cada reunión. Se llega desde el resumen del
// grupo (discipulado/[id]).
export default function HistorialDiscipulado() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { data: reuniones = [], isPending } = useReunionesConAsistencia(String(id));

  const meses = useMemo(() => {
    const mapa = new Map<string, MesReuniones>();
    for (const r of reuniones) {
      const clave = r.fecha.slice(0, 7); // "YYYY-MM"
      const g = mapa.get(clave) ?? { clave, total: 0, reuniones: [] };
      g.total += Number(r.ofrenda_total ?? 0);
      g.reuniones.push(r);
      mapa.set(clave, g);
    }
    return [...mapa.values()].sort((a, b) => b.clave.localeCompare(a.clave));
  }, [reuniones]);

  // Primer mes expandido por defecto.
  const [mesesAbiertos, setMesesAbiertos] = useState<Record<string, boolean>>({});
  const mesAbierto = (clave: string, idx: number) => mesesAbiertos[clave] ?? idx === 0;
  const toggleMes = (clave: string, idx: number) =>
    setMesesAbiertos((p) => ({ ...p, [clave]: !mesAbierto(clave, idx) }));

  return (
    <Screen>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 32 }}
      >
        {isPending ? (
          <View className="items-center py-8">
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : meses.length === 0 ? (
          <Card>
            <Muted>Sin reuniones registradas.</Muted>
          </Card>
        ) : (
          <View className="gap-3">
            {meses.map((mes, idx) => {
              const abierto = mesAbierto(mes.clave, idx);
              return (
                <Card key={mes.clave} className="overflow-hidden p-0">
                  <Pressable
                    onPress={() => toggleMes(mes.clave, idx)}
                    className="flex-row items-center gap-3 p-4 active:opacity-80"
                  >
                    <View className="flex-1">
                      <Title style={{ fontSize: 16, lineHeight: 22 }}>{labelMes(mes.clave)}</Title>
                      <Muted>
                        {mes.reuniones.length} {mes.reuniones.length === 1 ? "reunión" : "reuniones"}
                      </Muted>
                    </View>
                    <Title className="text-gold" style={{ fontSize: 16, lineHeight: 22 }}>
                      {formatMoneda(mes.total)}
                    </Title>
                    <Ionicons
                      name={abierto ? "chevron-up" : "chevron-down"}
                      size={18}
                      color={colors.outline}
                    />
                  </Pressable>

                  {abierto && (
                    <View className="border-t border-black/10">
                      {mes.reuniones.map((r) => {
                        const { presentes, total } = presentesDe(r);
                        return (
                          <Pressable
                            key={r.id}
                            onPress={() => router.push({ pathname: "/reunion/[id]", params: { id: r.id } })}
                            className="flex-row items-center gap-3 border-b border-black/5 px-4 py-3 active:opacity-80"
                          >
                            <FechaBloque fecha={r.fecha} />
                            <Body className="flex-1 text-ink" numberOfLines={2}>
                              {r.tema || "Sin tema"}
                            </Body>
                            <View className="items-end">
                              <Text
                                style={{ fontFamily: fonts.sansSemibold }}
                                className="text-sm text-ink-variant"
                              >
                                {formatMoneda(r.ofrenda_total)}
                              </Text>
                              {total ? (
                                <Text
                                  style={{ fontFamily: fonts.sans }}
                                  className="text-xs text-ink-muted"
                                >
                                  {presentes}/{total} presentes
                                </Text>
                              ) : null}
                            </View>
                            <Ionicons name="chevron-forward" size={16} color={colors.outline} />
                          </Pressable>
                        );
                      })}
                    </View>
                  )}
                </Card>
              );
            })}
          </View>
        )}
      </ScrollView>
    </Screen>
  );
}
