import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import {
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  TextInput,
  View,
} from "react-native";
import { AppBar } from "../../components/AppBar";
import {
  Body,
  Card,
  Chip,
  Headline,
  LinkAction,
  Muted,
  Title,
} from "../../components/ui";
import { useAuth } from "../../lib/auth";
import { formatFechaLarga, formatHora } from "../../lib/date";
import { colors, fonts } from "../../lib/theme";
import { Evento } from "../../lib/types";
import { useEventosVigentes } from "../../lib/queries/eventos";

const TONE: Record<string, "navy" | "gold" | "neutral" | "danger"> = {
  general: "navy",
  discipulado: "gold",
  especial: "danger",
  otro: "neutral",
};

function fechaHora(iso: string) {
  const d = new Date(iso);
  return `${d.toLocaleDateString("es-AR", { weekday: "short", day: "2-digit", month: "short" })} · ${formatHora(
    d.toTimeString().slice(0, 5)
  )}`;
}

export default function Actividades() {
  const router = useRouter();
  const { isAdmin } = useAuth();
  const { data: eventos = [], isLoading, refetch, isRefetching } = useEventosVigentes();
  const [q, setQ] = useState("");

  const filtrados = useMemo(() => {
    // El feed muestra solo actividades/anuncios, no las reuniones de discipulado.
    const base = eventos.filter((e) => e.tipo !== "discipulado" && !e.discipulado_id);
    const t = q.trim().toLowerCase();
    if (!t) return base;
    return base.filter(
      (e) =>
        e.titulo.toLowerCase().includes(t) ||
        (e.descripcion ?? "").toLowerCase().includes(t)
    );
  }, [eventos, q]);

  const [destacado, ...resto] = filtrados;

  return (
    <View className="flex-1 bg-cream">
      <AppBar />
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 96 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => refetch()} />}
      >
        <Headline className="mb-4">Registro de Actividades</Headline>

        {/* Buscador */}
        <View className="mb-3 flex-row items-center gap-2 rounded-lg border border-black/10 bg-surface px-3.5 py-3">
          <Ionicons name="search" size={18} color={colors.outline} />
          <TextInput
            value={q}
            onChangeText={setQ}
            placeholder="Buscar actividades, temas o lugares"
            placeholderTextColor={colors.outline}
            style={{ fontFamily: fonts.sans, flex: 1, color: colors.onSurface }}
          />
        </View>

        {/* Destacado */}
        {destacado && !q && (
          <Pressable
            onPress={() => router.push({ pathname: "/actividad/[id]", params: { id: destacado.id } })}
            className="active:opacity-90"
          >
          <Card className="mb-5 overflow-hidden p-0">
            <View className="h-28 justify-end bg-navy p-4">
              {destacado.adjunto_url && destacado.adjunto_tipo === "imagen" ? (
                <Image
                  source={{ uri: destacado.adjunto_url }}
                  resizeMode="cover"
                  style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, opacity: 0.55 }}
                />
              ) : (
                <View className="absolute right-4 top-3 opacity-20">
                  <Ionicons name="sparkles" size={64} color={colors.tertiaryDim} />
                </View>
              )}
              <Chip tone="gold">Próximo</Chip>
            </View>
            <View className="p-5">
              <View className="mb-2 flex-row items-center gap-1.5">
                <Ionicons name="calendar-outline" size={15} color={colors.tertiary} />
                <Muted className="uppercase text-gold">{fechaHora(destacado.fecha_inicio)}</Muted>
              </View>
              <Title numberOfLines={2} className="text-xl">
                {destacado.titulo}
              </Title>
              {destacado.descripcion ? (
                <Body className="mt-1" numberOfLines={2}>
                  {destacado.descripcion}
                </Body>
              ) : null}
              <View className="mt-4 flex-row items-center justify-between">
                {destacado.ubicacion ? (
                  <View className="flex-row items-center gap-1">
                    <Ionicons name="location-outline" size={15} color={colors.outline} />
                    <Muted>{destacado.ubicacion}</Muted>
                  </View>
                ) : (
                  <View />
                )}
                <LinkAction
                  title="Detalles"
                  onPress={() => router.push({ pathname: "/actividad/[id]", params: { id: destacado.id } })}
                />
              </View>
            </View>
          </Card>
          </Pressable>
        )}

        {/* Lista */}
        {isLoading ? (
          <Muted>Cargando…</Muted>
        ) : filtrados.length === 0 ? (
          <Card>
            <Muted>No hay actividades vigentes.</Muted>
          </Card>
        ) : (
          <View className="gap-3">
            {(q ? filtrados : resto).map((e: Evento) => (
              <Pressable
                key={e.id}
                onPress={() => router.push({ pathname: "/actividad/[id]", params: { id: e.id } })}
                className="active:opacity-80"
              >
                <Card>
                  <View className="flex-row gap-3">
                    {e.adjunto_url && e.adjunto_tipo === "imagen" ? (
                      <Image source={{ uri: e.adjunto_url }} style={{ width: 60, height: 60, borderRadius: 10 }} />
                    ) : e.adjunto_url ? (
                      <View className="h-[60px] w-[60px] items-center justify-center rounded-[10px] bg-surface-mid">
                        <Ionicons name="document-text-outline" size={24} color={colors.primaryContainer} />
                      </View>
                    ) : null}
                    <View className="flex-1">
                      <View className="mb-1 flex-row items-start justify-between">
                        <Chip tone={TONE[e.tipo] ?? "neutral"}>{e.tipo}</Chip>
                        <Ionicons name="chevron-forward" size={16} color={colors.outline} />
                      </View>
                      <Title numberOfLines={2}>{e.titulo}</Title>
                    </View>
                  </View>
                  <View className="mt-2 flex-row items-center gap-1.5">
                    <Ionicons name="time-outline" size={14} color={colors.outline} />
                    <Muted>{formatFechaLarga(e.fecha_inicio)}</Muted>
                  </View>
                  {e.descripcion ? (
                    <Body className="mt-2" numberOfLines={2}>
                      {e.descripcion}
                    </Body>
                  ) : null}
                  {e.ubicacion ? (
                    <View className="mt-3 flex-row items-center gap-1 border-t border-black/5 pt-3">
                      <Ionicons name="location-outline" size={15} color={colors.outline} />
                      <Muted>{e.ubicacion}</Muted>
                    </View>
                  ) : null}
                </Card>
              </Pressable>
            ))}

            {/* Agendar nueva (solo admin) */}
            {isAdmin && !q && (
              <Pressable onPress={() => router.push("/admin/eventos")} className="active:opacity-70">
                <View className="items-center justify-center rounded-2xl border border-dashed border-navy/30 bg-surface/40 py-7">
                  <Ionicons name="add-circle-outline" size={26} color={colors.primaryContainer} />
                  <Title className="mt-1 text-base">Agendar nueva</Title>
                  <Muted>Planificá un evento para la comunidad</Muted>
                </View>
              </Pressable>
            )}
          </View>
        )}
      </ScrollView>

      {/* FAB */}
      {isAdmin && (
        <Pressable
          onPress={() => router.push("/admin/eventos")}
          style={{
            shadowColor: "#04162e",
            shadowOffset: { width: 0, height: 6 },
            shadowOpacity: 0.25,
            shadowRadius: 10,
            elevation: 6,
          }}
          className="absolute bottom-5 right-5 h-14 w-14 items-center justify-center rounded-full bg-navy active:opacity-90"
        >
          <Ionicons name="add" size={28} color="#fff" />
        </Pressable>
      )}
    </View>
  );
}
