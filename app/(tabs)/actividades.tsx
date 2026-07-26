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
  Label,
  LinkAction,
  Muted,
  Title,
} from "../../components/ui";
import { useAuth } from "../../lib/auth";
import { formatDiasSemana, formatFechaLarga, formatHora, formatRangoFechas, mismoDia, proximaOcurrencia } from "../../lib/date";
import { colors, fonts } from "../../lib/theme";
import { Actividad, Evento } from "../../lib/types";
import { useActividadesActivas } from "../../lib/queries/actividades";
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

/* ============================ Card de actividad semanal ============================ */

function ActividadRow({ a, onPress }: { a: Actividad; onPress: () => void }) {
  const horario = `${formatHora(a.hora_inicio)}${a.hora_fin ? ` – ${formatHora(a.hora_fin)}` : ""}`;
  return (
    <Pressable onPress={onPress} className="active:opacity-80">
      <Card>
        <View className="flex-row gap-3">
          {a.adjunto_url && a.adjunto_tipo === "imagen" ? (
            <Image source={{ uri: a.adjunto_url }} style={{ width: 60, height: 60, borderRadius: 10 }} />
          ) : (
            <View className="h-[60px] w-[60px] items-center justify-center rounded-[10px] bg-surface-mid">
              <Ionicons name="repeat" size={24} color={colors.success} />
            </View>
          )}
          <View className="flex-1">
            <View className="mb-1 flex-row items-start justify-between">
              <Chip tone="success">Semanal</Chip>
              <Ionicons name="chevron-forward" size={16} color={colors.outline} />
            </View>
            <Title numberOfLines={2}>{a.titulo}</Title>
          </View>
        </View>
        <View className="mt-2 flex-row items-center gap-1.5">
          <Ionicons name="time-outline" size={14} color={colors.outline} />
          <Muted>
            {formatDiasSemana(a.dias_semana)} · {horario}
          </Muted>
        </View>
        {a.ubicacion ? (
          <View className="mt-3 flex-row items-center gap-1 border-t border-black/5 pt-3">
            <Ionicons name="location-outline" size={15} color={colors.outline} />
            <Muted>{a.ubicacion}</Muted>
          </View>
        ) : null}
      </Card>
    </Pressable>
  );
}

export default function Actividades() {
  const router = useRouter();
  const { isAdmin } = useAuth();
  const eventosQ = useEventosVigentes();
  const actividadesQ = useActividadesActivas();
  const eventos = eventosQ.data ?? [];
  const actividades = actividadesQ.data ?? [];
  const [q, setQ] = useState("");

  const t = q.trim().toLowerCase();
  const matches = (titulo: string, desc: string | null) =>
    !t || titulo.toLowerCase().includes(t) || (desc ?? "").toLowerCase().includes(t);

  const eventosFiltrados = useMemo(() => {
    // El feed muestra solo eventos generales, no las reuniones de discipulado.
    return eventos
      .filter((e) => e.tipo !== "discipulado" && !e.discipulado_id)
      .filter((e) => matches(e.titulo, e.descripcion));
  }, [eventos, t]);

  const actividadesFiltradas = useMemo(() => {
    return actividades
      .filter((a) => matches(a.titulo, a.descripcion))
      .sort((a, b) => {
        // Orden por próxima ocurrencia y, a igualdad de día, por hora de inicio.
        const pa = proximaOcurrencia(a.dias_semana)?.getTime() ?? 0;
        const pb = proximaOcurrencia(b.dias_semana)?.getTime() ?? 0;
        return pa - pb || a.hora_inicio.localeCompare(b.hora_inicio);
      });
  }, [actividades, t]);

  const [destacado, ...restoEventos] = eventosFiltrados;
  const isLoading = eventosQ.isLoading || actividadesQ.isLoading;
  const isRefetching = eventosQ.isRefetching || actividadesQ.isRefetching;
  const onRefresh = () => {
    eventosQ.refetch();
    actividadesQ.refetch();
  };
  const sinNada = !isLoading && actividadesFiltradas.length === 0 && eventosFiltrados.length === 0;

  return (
    <View className="flex-1 bg-cream">
      <AppBar title="Eventos y actividades" />
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 96 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={onRefresh} />}
      >
        {/* Buscador */}
        <View className="mb-4 flex-row items-center gap-2 rounded-lg border border-black/10 bg-surface px-3.5 py-3">
          <Ionicons name="search" size={18} color={colors.outline} />
          <TextInput
            value={q}
            onChangeText={setQ}
            placeholder="Buscar por nombre o descripción"
            placeholderTextColor={colors.outline}
            style={{ fontFamily: fonts.sans, flex: 1, color: colors.onSurface }}
          />
        </View>

        {isLoading ? (
          <Muted>Cargando…</Muted>
        ) : sinNada ? (
          <Card>
            <Muted>{t ? "No hay resultados para tu búsqueda." : "No hay eventos ni actividades vigentes."}</Muted>
          </Card>
        ) : null}

        {/* ===== Actividades semanales (recurrentes) ===== */}
        {actividadesFiltradas.length > 0 && (
          <View className="mb-6">
            <View className="mb-2.5 flex-row items-center justify-between">
              <Label>Actividades semanales</Label>
              {isAdmin && !t ? (
                <LinkAction title="+ Nueva" onPress={() => router.push("/admin/actividades")} />
              ) : null}
            </View>
            <View className="gap-3">
              {actividadesFiltradas.map((a) => (
                <ActividadRow
                  key={a.id}
                  a={a}
                  onPress={() => router.push({ pathname: "/actividad-semanal/[id]", params: { id: a.id } })}
                />
              ))}
            </View>
          </View>
        )}

        {/* ===== Próximos eventos (únicos, con fecha) ===== */}
        {eventosFiltrados.length > 0 && (
          <View>
            <Label className="mb-2.5">Próximos eventos</Label>

            {/* Destacado (solo sin búsqueda activa) */}
            {destacado && !t && (
              <Pressable
                onPress={() => router.push({ pathname: "/actividad/[id]", params: { id: destacado.id } })}
                className="active:opacity-90"
              >
                <Card className="mb-3 overflow-hidden p-0">
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
                      <Muted className="uppercase text-gold">
                        {mismoDia(destacado.fecha_inicio, destacado.fecha_fin)
                          ? fechaHora(destacado.fecha_inicio)
                          : formatRangoFechas(destacado.fecha_inicio, destacado.fecha_fin)}
                      </Muted>
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

            <View className="gap-3">
              {(t ? eventosFiltrados : restoEventos).map((e: Evento) => (
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
                      <Muted>
                        {mismoDia(e.fecha_inicio, e.fecha_fin)
                          ? formatFechaLarga(e.fecha_inicio)
                          : formatRangoFechas(e.fecha_inicio, e.fecha_fin)}
                      </Muted>
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
            </View>
          </View>
        )}

        {/* Agregar (solo admin) */}
        {isAdmin && !t && (
          <View className="mt-4 flex-row gap-3">
            <Pressable onPress={() => router.push("/admin/actividades")} className="flex-1 active:opacity-70">
              <View className="items-center justify-center rounded-2xl border border-dashed border-navy/30 bg-surface/40 px-2 py-6">
                <Ionicons name="repeat-outline" size={24} color={colors.success} />
                <Title className="mt-1 text-center text-base">Nueva actividad</Title>
                <Muted className="text-center">Semanal, día fijo</Muted>
              </View>
            </Pressable>
            <Pressable onPress={() => router.push("/admin/eventos")} className="flex-1 active:opacity-70">
              <View className="items-center justify-center rounded-2xl border border-dashed border-navy/30 bg-surface/40 px-2 py-6">
                <Ionicons name="calendar-outline" size={24} color={colors.primaryContainer} />
                <Title className="mt-1 text-center text-base">Nuevo evento</Title>
                <Muted className="text-center">Único, con fecha</Muted>
              </View>
            </Pressable>
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
