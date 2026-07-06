import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams } from "expo-router";
import { useMemo } from "react";
import { ActivityIndicator, ScrollView, View } from "react-native";
import {
  Avatar,
  Body,
  Card,
  Chip,
  Display,
  Label,
  Muted,
  Title,
} from "../../components/ui";
import { formatMoneda } from "../../lib/date";
import { colors } from "../../lib/theme";
import { useReunion } from "../../lib/queries/reuniones";

function fechaLarga(iso: string): string {
  // iso "YYYY-MM-DD": forzamos hora local para no correrse un día por UTC.
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("es-AR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

export default function ReunionDetalle() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: reunion, isLoading } = useReunion(String(id));

  const asistencias = useMemo(
    () =>
      [...(reunion?.asistencias ?? [])].sort((a, b) => {
        if (a.presente !== b.presente) return a.presente ? -1 : 1;
        return (a.miembro?.nombre ?? "").localeCompare(b.miembro?.nombre ?? "");
      }),
    [reunion]
  );
  const presentes = asistencias.filter((a) => a.presente).length;

  if (isLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-cream">
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (!reunion) {
    return (
      <View className="flex-1 items-center justify-center bg-cream p-8">
        <Muted>No se encontró la reunión.</Muted>
      </View>
    );
  }

  const grupo =
    reunion.discipulado?.nombre ?? reunion.discipulado?.descripcion_etaria ?? "Discipulado";

  return (
    <ScrollView
      className="flex-1 bg-cream"
      contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
      showsVerticalScrollIndicator={false}
    >
      {/* Encabezado */}
      <Card className="mb-4 bg-navy">
        <Muted >{grupo}</Muted>
        <Title className="mt-1 capitalize">{fechaLarga(reunion.fecha)}</Title>
        {reunion.modalidad_usada ? (
          <View className="mt-3">
            <Chip tone="gold">{reunion.modalidad_usada}</Chip>
          </View>
        ) : null}
      </Card>

      {/* Ofrenda */}
      <Card className="mb-4 flex-row items-center justify-between">
        <View>
          <Label>Ofrenda total</Label>
          <Display className="mt-1">{formatMoneda(Number(reunion.ofrenda_total ?? 0))}</Display>
        </View>
        <View className="h-12 w-12 items-center justify-center rounded-full bg-surface-mid">
          <Ionicons name="wallet-outline" size={24} color={colors.primaryContainer} />
        </View>
      </Card>

      {/* Tema */}
      {reunion.tema ? (
        <>
          <Label className="mb-2">Tema / lección</Label>
          <Card className="mb-4">
            <Body className="text-ink">{reunion.tema}</Body>
          </Card>
        </>
      ) : null}

      {/* Notas */}
      {reunion.notas ? (
        <>
          <Label className="mb-2">Notas</Label>
          <Card className="mb-4">
            <Body className="text-ink">{reunion.notas}</Body>
          </Card>
        </>
      ) : null}

      {/* Asistencia */}
      <View className="mb-2 mt-2 flex-row items-center justify-between">
        <Label>Asistencia</Label>
        <Muted className="text-gold">
          {presentes}/{asistencias.length} presentes
        </Muted>
      </View>

      {asistencias.length === 0 ? (
        <Card>
          <Muted>No se registró asistencia.</Muted>
        </Card>
      ) : (
        <View className="gap-2.5">
          {asistencias.map((a) => (
            <Card
              key={a.id}
              className={`flex-row items-center gap-3 py-3.5 ${a.presente ? "" : "opacity-60"}`}
            >
              <Avatar
                name={a.miembro?.nombre}
                size={38}
                tone={a.presente ? "navy" : "gold"}
              />
              <Body className="flex-1 text-ink">
                {a.miembro?.nombre} {a.miembro?.apellido ?? ""}
              </Body>
              {a.presente && a.modalidad && a.modalidad !== "ambos" ? (
                <View className="flex-row items-center gap-1">
                  <Ionicons
                    name={a.modalidad === "virtual" ? "videocam-outline" : "business-outline"}
                    size={13}
                    color={colors.outline}
                  />
                  <Muted className="capitalize">{a.modalidad}</Muted>
                </View>
              ) : null}
              <Ionicons
                name={a.presente ? "checkmark-circle" : "close-circle-outline"}
                size={22}
                color={a.presente ? colors.primary : colors.outlineVariant}
              />
            </Card>
          ))}
        </View>
      )}
    </ScrollView>
  );
}
