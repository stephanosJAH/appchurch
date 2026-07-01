import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useMemo } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { AppBar } from "../../components/AppBar";
import { Body, Card, Chip, Headline, Label, Muted, Title } from "../../components/ui";
import { addDays, formatHora, startOfWeek, toISODate } from "../../lib/date";
import { colors } from "../../lib/theme";
import { DIAS_SEMANA } from "../../lib/types";
import { useDiscipulados } from "../../lib/queries/discipulados";
import { useEventosVigentes } from "../../lib/queries/eventos";
import { useReunionesSemana } from "../../lib/queries/reuniones";

function rango(d: Date) {
  return d.toLocaleDateString("es-AR", { day: "2-digit", month: "short" });
}

export default function Calendario() {
  const router = useRouter();
  const inicio = useMemo(() => startOfWeek(), []);
  const fin = useMemo(() => addDays(inicio, 6), [inicio]);
  const desde = toISODate(inicio);
  const hasta = toISODate(fin);

  const { data: discipulados = [] } = useDiscipulados();
  const { data: reuniones = [] } = useReunionesSemana(desde, hasta);
  const { data: eventos = [] } = useEventosVigentes();

  const ordenSemana = [1, 2, 3, 4, 5, 6, 0]; // lunes..domingo

  const tieneReunion = (discipuladoId: string, fechaISO: string) =>
    reuniones.some((r) => r.discipulado_id === discipuladoId && r.fecha === fechaISO);

  return (
    <View className="flex-1 bg-cream">
      <AppBar />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 32 }} showsVerticalScrollIndicator={false}>
        <View className="mb-4">
          <Headline>Esta semana</Headline>
          <Muted className="mt-1">
            {rango(inicio)} – {rango(fin)}
          </Muted>
        </View>

        {ordenSemana.map((diaIdx, i) => {
          const fechaDia = toISODate(addDays(inicio, i));
          const delDia = discipulados
            .filter((d) => d.dia_semana === diaIdx)
            .sort((a, b) => a.hora_inicio.localeCompare(b.hora_inicio));
          const eventosDia = eventos.filter(
            (e) => toISODate(new Date(e.fecha_inicio)) === fechaDia
          );
          if (delDia.length === 0 && eventosDia.length === 0) return null;

          const esHoy = fechaDia === toISODate(new Date());

          return (
            <View key={diaIdx} className="mb-5">
              <View className="mb-2 flex-row items-center gap-2">
                <Label>{DIAS_SEMANA[diaIdx]}</Label>
                {esHoy ? <Chip tone="gold">Hoy</Chip> : null}
              </View>
              <View className="gap-2.5">
                {delDia.map((d) => {
                  const registrada = tieneReunion(d.id, fechaDia);
                  return (
                    <Pressable key={d.id} onPress={() => router.push(`/discipulado/${d.id}`)} className="active:opacity-80">
                      <Card className="flex-row items-center justify-between py-4">
                        <View className="flex-1 flex-row items-center gap-3">
                          <View className="items-center rounded-md bg-surface-mid px-2.5 py-1.5">
                            <Muted className="text-navy">{formatHora(d.hora_inicio)}</Muted>
                          </View>
                          <View className="flex-1">
                            <Title numberOfLines={1} className="text-base">
                              {d.nombre ?? d.descripcion_etaria ?? "Discipulado"}
                            </Title>
                            <Muted className="capitalize">{d.modalidad}</Muted>
                          </View>
                        </View>
                        <Chip tone={registrada ? "success" : "neutral"}>
                          {registrada ? "Registrada" : "Pendiente"}
                        </Chip>
                      </Card>
                    </Pressable>
                  );
                })}
                {eventosDia.map((e) => (
                  <Card key={e.id} className="flex-row items-center gap-3 py-4">
                    <View className="h-9 w-9 items-center justify-center rounded-full bg-gold-container">
                      <Ionicons name="megaphone-outline" size={17} color={colors.onTertiaryContainer} />
                    </View>
                    <Body className="flex-1 text-ink" numberOfLines={1}>
                      {e.titulo}
                    </Body>
                  </Card>
                ))}
              </View>
            </View>
          );
        })}

        {discipulados.length === 0 && (
          <Card>
            <Muted>No hay discipulados para mostrar en el calendario.</Muted>
          </Card>
        )}
      </ScrollView>
    </View>
  );
}
