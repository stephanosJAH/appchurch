import { Ionicons } from "@expo/vector-icons";
import { useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, View } from "react-native";
import { Body, Card, Display, Label, Muted, Title } from "../components/ui";
import { formatFechaCorta, formatMoneda, toISODate } from "../lib/date";
import { colors } from "../lib/theme";
import { ReunionConGrupo, useOfrendas } from "../lib/queries/reuniones";

const MESES_ATRAS = 12;

function nombreGrupo(r: ReunionConGrupo): string {
  return r.discipulado?.nombre ?? r.discipulado?.descripcion_etaria ?? "Discipulado";
}

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
  reuniones: ReunionConGrupo[];
};

export default function Ofrendas() {
  const { desde, hasta } = useMemo(() => {
    const now = new Date();
    const first = new Date(now.getFullYear(), now.getMonth() - (MESES_ATRAS - 1), 1);
    const last = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    return { desde: toISODate(first), hasta: toISODate(last) };
  }, []);

  const { data: reuniones = [], isLoading } = useOfrendas(desde, hasta);

  const { meses, totalGeneral } = useMemo(() => {
    const mapa = new Map<string, GrupoMes>();
    let total = 0;
    for (const r of reuniones) {
      const monto = Number(r.ofrenda_total ?? 0);
      total += monto;
      const clave = r.fecha.slice(0, 7); // "YYYY-MM"
      const g = mapa.get(clave) ?? { clave, total: 0, reuniones: [] };
      g.total += monto;
      g.reuniones.push(r);
      mapa.set(clave, g);
    }
    const meses = [...mapa.values()].sort((a, b) => b.clave.localeCompare(a.clave));
    return { meses, totalGeneral: total };
  }, [reuniones]);

  // Primer mes expandido por defecto.
  const [abiertos, setAbiertos] = useState<Record<string, boolean>>({});
  const estaAbierto = (clave: string, idx: number) => abiertos[clave] ?? idx === 0;
  const toggle = (clave: string, idx: number) =>
    setAbiertos((p) => ({ ...p, [clave]: !estaAbierto(clave, idx) }));

  if (isLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-cream">
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <ScrollView
      className="flex-1 bg-cream"
      contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
      showsVerticalScrollIndicator={false}
    >
      {/* Total general */}
      <Card className="mb-5 bg-navy">
        <Label>Total ofrendas · últimos {MESES_ATRAS} meses</Label>
        <Display className="mt-1">{formatMoneda(totalGeneral)}</Display>
        <Muted className="mt-1">
          {reuniones.length} reuniones · {meses.length} {meses.length === 1 ? "mes" : "meses"}
        </Muted>
      </Card>

      <Label className="mb-2">Desglose por mes</Label>

      {meses.length === 0 ? (
        <Card>
          <Muted>Todavía no hay ofrendas registradas.</Muted>
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
                      {mes.reuniones.length} {mes.reuniones.length === 1 ? "reunión" : "reuniones"}
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
                    {mes.reuniones.map((r) => (
                      <View
                        key={r.id}
                        className="flex-row items-center gap-3 border-b border-black/5 px-4 py-3"
                      >
                        <View className="flex-1">
                          <Body className="text-ink" numberOfLines={1}>
                            {nombreGrupo(r)}
                          </Body>
                          <Muted>{formatFechaCorta(r.fecha)}</Muted>
                        </View>
                        <Body className="text-ink">
                          {formatMoneda(Number(r.ofrenda_total ?? 0))}
                        </Body>
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
  );
}
