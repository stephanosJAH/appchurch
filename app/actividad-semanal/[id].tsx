import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams } from "expo-router";
import { ActivityIndicator, Image, ScrollView, View } from "react-native";
import { Body, Button, Card, Chip, Muted, Title } from "../../components/ui";
import { formatDiasSemana, formatHora } from "../../lib/date";
import { colors } from "../../lib/theme";
import { useActividad } from "../../lib/queries/actividades";
import { abrirAdjunto } from "../../lib/storage";

export default function ActividadSemanalDetalle() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: actividad, isLoading } = useActividad(String(id));

  if (isLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-cream">
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (!actividad) {
    return (
      <View className="flex-1 items-center justify-center bg-cream p-8">
        <Muted>No se encontró la actividad.</Muted>
      </View>
    );
  }

  const horario = `${formatHora(actividad.hora_inicio)}${
    actividad.hora_fin ? ` – ${formatHora(actividad.hora_fin)}` : ""
  }`;

  return (
    <ScrollView
      className="flex-1 bg-cream"
      contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
      showsVerticalScrollIndicator={false}
    >
      {/* Flyer / imagen */}
      {actividad.adjunto_url && actividad.adjunto_tipo === "imagen" ? (
        <Image
          source={{ uri: actividad.adjunto_url }}
          resizeMode="contain"
          style={{ width: "100%", height: 380, borderRadius: 16, backgroundColor: "#04162e0d" }}
          className="mb-4"
        />
      ) : null}

      <View className="mb-3 self-start">
        <Chip tone="success">Actividad semanal</Chip>
      </View>

      <Title className="text-2xl">{actividad.titulo}</Title>

      {/* Días y horario */}
      <View className="mt-3 flex-row items-center gap-1.5">
        <Ionicons name="repeat-outline" size={16} color={colors.tertiary} />
        <Muted className="text-gold">{formatDiasSemana(actividad.dias_semana)}</Muted>
      </View>
      <View className="mt-1.5 flex-row items-center gap-1.5">
        <Ionicons name="time-outline" size={16} color={colors.outline} />
        <Muted>{horario}</Muted>
      </View>
      <View className="mt-1.5 flex-row items-center gap-1.5">
        <Ionicons name="ellipse-outline" size={16} color={colors.outline} />
        <Muted className="capitalize">{actividad.modalidad}</Muted>
      </View>
      {actividad.ubicacion ? (
        <View className="mt-1.5 flex-row items-center gap-1.5">
          <Ionicons name="location-outline" size={16} color={colors.outline} />
          <Muted>{actividad.ubicacion}</Muted>
        </View>
      ) : null}

      {/* Descripción */}
      {actividad.descripcion ? (
        <Card className="mt-4">
          <Body className="text-ink">{actividad.descripcion}</Body>
        </Card>
      ) : null}

      {/* Enlace virtual */}
      {actividad.enlace_virtual ? (
        <Card className="mt-4 flex-row items-center gap-3">
          <View className="h-12 w-12 items-center justify-center rounded-lg bg-surface-mid">
            <Ionicons name="videocam-outline" size={24} color={colors.primaryContainer} />
          </View>
          <View className="flex-1">
            <Body className="text-ink">Enlace virtual</Body>
            <Muted numberOfLines={1}>{actividad.enlace_virtual}</Muted>
          </View>
          <Button title="Abrir" size="sm" onPress={() => abrirAdjunto(actividad.enlace_virtual)} />
        </Card>
      ) : null}

      {/* PDF adjunto */}
      {actividad.adjunto_url && actividad.adjunto_tipo === "pdf" ? (
        <Card className="mt-4 flex-row items-center gap-3">
          <View className="h-12 w-12 items-center justify-center rounded-lg bg-surface-mid">
            <Ionicons name="document-text-outline" size={24} color={colors.primaryContainer} />
          </View>
          <View className="flex-1">
            <Body className="text-ink">Documento adjunto</Body>
            <Muted>PDF</Muted>
          </View>
          <Button title="Abrir" size="sm" onPress={() => abrirAdjunto(actividad.adjunto_url)} />
        </Card>
      ) : null}
    </ScrollView>
  );
}
