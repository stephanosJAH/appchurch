import { Ionicons } from "@expo/vector-icons";
import { Stack, useLocalSearchParams } from "expo-router";
import { useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, View } from "react-native";
import { Body, Card, Display, Label, Muted, Screen, Title } from "../components/ui";
import { formatFechaCorta, formatMoneda, toISODate } from "../lib/date";
import { useOfrendasMinisterio } from "../lib/queries/ministerios";
import { useOfrendas } from "../lib/queries/reuniones";
import { colors } from "../lib/theme";

// Desglose de ofrendas. **Dos libros, un solo componente**: la contabilidad de
// discipulados y la de ministerios viven en tablas separadas por decisión de
// producto (ver 0025), y el parámetro `origen` decide cuál se lee. Sin el
// parámetro se muestra el de discipulados, que es el histórico.

const MESES_ATRAS = 12;

type Origen = "discipulado" | "ministerio";

// Fila normalizada entre los dos orígenes: de quién es la ofrenda y cuánto.
type FilaOfrenda = {
  id: string;
  fecha: string;
  nombre: string;
  monto: number;
};

function labelMes(clave: string): string {
  const [y, m] = clave.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("es-AR", {
    month: "long",
    year: "numeric",
  });
}

type GrupoMes = {
  clave: string;
  total: number;
  filas: FilaOfrenda[];
};

export default function Ofrendas() {
  const { origen: origenParam } = useLocalSearchParams<{ origen?: string }>();
  const origen: Origen = origenParam === "ministerio" ? "ministerio" : "discipulado";
  const esMinisterio = origen === "ministerio";

  const { desde, hasta } = useMemo(() => {
    const now = new Date();
    const first = new Date(now.getFullYear(), now.getMonth() - (MESES_ATRAS - 1), 1);
    const last = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    return { desde: toISODate(first), hasta: toISODate(last) };
  }, []);

  const disc = useOfrendas(desde, hasta, !esMinisterio);
  const min = useOfrendasMinisterio(desde, hasta, esMinisterio);
  const isLoading = esMinisterio ? min.isLoading : disc.isLoading;

  const filas = useMemo<FilaOfrenda[]>(() => {
    if (esMinisterio) {
      return (min.data ?? []).map((r) => ({
        id: r.id,
        fecha: r.fecha,
        nombre: r.ministerio?.nombre ?? "Ministerio",
        monto: Number(r.ofrenda_total ?? 0),
      }));
    }
    return (disc.data ?? []).map((r) => ({
      id: r.id,
      fecha: r.fecha,
      nombre: r.discipulado?.nombre ?? r.discipulado?.descripcion_etaria ?? "Discipulado",
      monto: Number(r.ofrenda_total ?? 0),
    }));
  }, [esMinisterio, min.data, disc.data]);

  const { meses, totalGeneral } = useMemo(() => {
    const mapa = new Map<string, GrupoMes>();
    let total = 0;
    for (const f of filas) {
      total += f.monto;
      const clave = f.fecha.slice(0, 7); // "YYYY-MM"
      const g = mapa.get(clave) ?? { clave, total: 0, filas: [] };
      g.total += f.monto;
      g.filas.push(f);
      mapa.set(clave, g);
    }
    const meses = [...mapa.values()].sort((a, b) => b.clave.localeCompare(a.clave));
    return { meses, totalGeneral: total };
  }, [filas]);

  // Primer mes expandido por defecto.
  const [abiertos, setAbiertos] = useState<Record<string, boolean>>({});
  const estaAbierto = (clave: string, idx: number) => abiertos[clave] ?? idx === 0;
  const toggle = (clave: string, idx: number) =>
    setAbiertos((p) => ({ ...p, [clave]: !estaAbierto(clave, idx) }));

  const titulo = esMinisterio ? "Ofrendas de ministerios" : "Ofrendas de discipulados";

  if (isLoading) {
    return (
      <Screen className="items-center justify-center">
        <Stack.Screen options={{ title: titulo }} />
        <ActivityIndicator size="large" color={colors.primary} />
      </Screen>
    );
  }

  return (
    <Screen>
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
        showsVerticalScrollIndicator={false}
      >
        <Stack.Screen options={{ title: titulo }} />

        {/* Total general */}
        <Card className="mb-5 bg-navy">
          <Label>Total ofrendas · últimos {MESES_ATRAS} meses</Label>
          <Display className="mt-1">{formatMoneda(totalGeneral)}</Display>
          <Muted className="mt-1">
            {filas.length} reuniones · {meses.length} {meses.length === 1 ? "mes" : "meses"}
          </Muted>
        </Card>

        <Label className="mb-2">Desglose por mes</Label>

        {meses.length === 0 ? (
          <Card>
            <Muted>
              {esMinisterio
                ? "Todavía no hay ofrendas registradas en los ministerios."
                : "Todavía no hay ofrendas registradas."}
            </Muted>
          </Card>
        ) : (
          <View className="gap-3">
            {meses.map((mes, idx) => {
              const abierto = estaAbierto(mes.clave, idx);
              return (
                <Card key={mes.clave} className="p-0 overflow-hidden">
                  <Pressable
                    onPress={() => toggle(mes.clave, idx)}
                    className="flex-row items-center gap-3 p-4 active:opacity-80"
                  >
                    <View className="flex-1">
                      <Title className="text-base capitalize">{labelMes(mes.clave)}</Title>
                      <Muted>
                        {mes.filas.length} {mes.filas.length === 1 ? "reunión" : "reuniones"}
                      </Muted>
                    </View>
                    <Title className="text-base text-gold">{formatMoneda(mes.total)}</Title>
                    <Ionicons
                      name={abierto ? "chevron-up" : "chevron-down"}
                      size={18}
                      color={colors.outline}
                    />
                  </Pressable>

                  {abierto && (
                    <View className="border-t border-black/10">
                      {mes.filas.map((f) => (
                        <View
                          key={f.id}
                          className="flex-row items-center gap-3 border-b border-black/5 px-4 py-3"
                        >
                          <View className="flex-1">
                            <Body className="text-ink" numberOfLines={1}>
                              {f.nombre}
                            </Body>
                            <Muted>{formatFechaCorta(f.fecha)}</Muted>
                          </View>
                          <Body className="text-ink">{formatMoneda(f.monto)}</Body>
                        </View>
                      ))}
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
