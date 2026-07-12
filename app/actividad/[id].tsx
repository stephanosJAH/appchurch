import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams } from "expo-router";
import { ActivityIndicator, Image, ScrollView, View } from "react-native";
import { Body, Button, Card, Chip, Muted, Title } from "../../components/ui";
import { formatHora } from "../../lib/date";
import { colors } from "../../lib/theme";
import { useEvento } from "../../lib/queries/eventos";
import { abrirAdjunto } from "../../lib/storage";

const TONE: Record<string, "navy" | "gold" | "neutral"> = {
  general: "navy",
  discipulado: "gold",
  otro: "neutral",
};

function fechaLarga(iso: string): string {
  return new Date(iso).toLocaleDateString("es-AR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

function horaDe(iso: string): string {
  const d = new Date(iso);
  return formatHora(`${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`);
}

export default function ActividadDetalle() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: evento, isLoading } = useEvento(String(id));

  if (isLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-cream">
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (!evento) {
    return (
      <View className="flex-1 items-center justify-center bg-cream p-8">
        <Muted>No se encontró la actividad.</Muted>
      </View>
    );
  }

  return (
    <ScrollView
      className="flex-1 bg-cream"
      contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
      showsVerticalScrollIndicator={false}
    >
      {/* Flyer / imagen */}
      {evento.adjunto_url && evento.adjunto_tipo === "imagen" ? (
        <Image
          source={{ uri: evento.adjunto_url }}
          resizeMode="contain"
          style={{ width: "100%", height: 380, borderRadius: 16, backgroundColor: "#04162e0d" }}
          className="mb-4"
        />
      ) : null}

      <View className="mb-3 self-start">
        <Chip tone={TONE[evento.tipo] ?? "neutral"}>{evento.tipo}</Chip>
      </View>

      <Title className="text-2xl">{evento.titulo}</Title>

      {/* Fecha y hora */}
      <View className="mt-3 flex-row items-center gap-1.5">
        <Ionicons name="calendar-outline" size={16} color={colors.tertiary} />
        <Muted className="capitalize text-gold">{fechaLarga(evento.fecha_inicio)}</Muted>
      </View>
      <View className="mt-1.5 flex-row items-center gap-1.5">
        <Ionicons name="time-outline" size={16} color={colors.outline} />
        <Muted>
          {horaDe(evento.fecha_inicio)} – {horaDe(evento.fecha_fin)}
        </Muted>
      </View>
      {evento.ubicacion ? (
        <View className="mt-1.5 flex-row items-center gap-1.5">
          <Ionicons name="location-outline" size={16} color={colors.outline} />
          <Muted>{evento.ubicacion}</Muted>
        </View>
      ) : null}

      {/* Descripción */}
      {evento.descripcion ? (
        <Card className="mt-4">
          <Body className="text-ink">{evento.descripcion}</Body>
        </Card>
      ) : null}

      {/* PDF adjunto */}
      {evento.adjunto_url && evento.adjunto_tipo === "pdf" ? (
        <Card className="mt-4 flex-row items-center gap-3">
          <View className="h-12 w-12 items-center justify-center rounded-lg bg-surface-mid">
            <Ionicons name="document-text-outline" size={24} color={colors.primaryContainer} />
          </View>
          <View className="flex-1">
            <Body className="text-ink">Documento adjunto</Body>
            <Muted>PDF</Muted>
          </View>
          <Button title="Abrir" size="sm" onPress={() => abrirAdjunto(evento.adjunto_url)} />
        </Card>
      ) : null}
    </ScrollView>
  );
}
