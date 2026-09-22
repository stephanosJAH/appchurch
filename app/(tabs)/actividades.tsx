import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import {
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  TextInput,
  View,
} from "react-native";
import { AppBar, TabDef } from "../../components/AppBar";
import { Paneles } from "../../components/Paneles";
import {
  Body,
  Card,
  Chip,
  Label,
  LinkAction,
  Muted,
  Screen,
  Title,
} from "../../components/ui";
import { useAuth } from "../../lib/auth";
import { formatDiasSemana, formatFechaLarga, formatHora, formatRangoFechas, mismoDia, proximaOcurrencia } from "../../lib/date";
import { aTextoPlano } from "../../lib/richText";
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

// Las dos secciones son cosas distintas del dominio —la actividad se repite
// todas las semanas, el evento pasa una vez y tiene fecha—, así que cada una
// tiene su panel en vez de convivir en una sola lista.
type SeccionTab = "actividades" | "eventos";
const TABS: readonly TabDef<SeccionTab>[] = [
  { key: "actividades", label: "Actividades" },
  { key: "eventos", label: "Eventos" },
];

function fechaHora(iso: string) {
  const d = new Date(iso);
  return `${d.toLocaleDateString("es-AR", { weekday: "short", day: "2-digit", month: "short" })} · ${formatHora(
    d.toTimeString().slice(0, 5)
  )}`;
}

// La búsqueda es una sola para los dos paneles —el texto te sigue al deslizar—,
// pero la caja se dibuja adentro de cada uno para que scrollee con su lista.
function Buscador({ value, onChangeText }: { value: string; onChangeText: (t: string) => void }) {
  return (
    <View className="mb-4 flex-row items-center gap-2 rounded-lg border border-black/10 bg-surface px-3.5 py-3">
      <Ionicons name="search" size={18} color={colors.outline} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder="Buscar por nombre o descripción"
        placeholderTextColor={colors.outline}
        style={{ fontFamily: fonts.sans, flex: 1, color: colors.onSurface }}
      />
    </View>
  );
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

/* ============================ Card de evento único ============================ */

function EventoRow({ e, onPress }: { e: Evento; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} className="active:opacity-80">
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
            {aTextoPlano(e.descripcion)}
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

  // Selector de header "Actividades"/"Eventos", igual que el Inicio/Nosotros
  // del feed: el panel se corre a la vista con el tap o con el desliz, no se
  // navega a otra pantalla.
  const [tab, setTab] = useState<SeccionTab>("actividades");
  const onIndexChange = useCallback(
    (i: number) => setTab(i === 0 ? "actividades" : "eventos"),
    []
  );

  const t = q.trim().toLowerCase();
  // La descripción guarda marcas de formato: se busca sobre el texto ya limpio,
  // si no "**oración**" no aparecería buscando "oración".
  const matches = (titulo: string, desc: string | null) =>
    !t || titulo.toLowerCase().includes(t) || aTextoPlano(desc).toLowerCase().includes(t);

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
  const onRefresh = () => {
    eventosQ.refetch();
    actividadesQ.refetch();
  };

  const irADetalleEvento = (id: string) =>
    router.push({ pathname: "/actividad/[id]", params: { id } });

  return (
    <Screen>
      <AppBar tabs={TABS} activeTab={tab} onTabChange={setTab} />

      <Paneles index={tab === "actividades" ? 0 : 1} onIndexChange={onIndexChange}>
        {/* ===== Panel "Actividades": lo que se repite todas las semanas ===== */}
        <ScrollView
          className="flex-1"
          contentContainerStyle={{ padding: 16, paddingBottom: 96 }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          refreshControl={
            <RefreshControl refreshing={actividadesQ.isRefetching} onRefresh={onRefresh} />
          }
        >
          <Buscador value={q} onChangeText={setQ} />

          {actividadesQ.isLoading ? (
            <Muted>Cargando…</Muted>
          ) : actividadesFiltradas.length === 0 ? (
            <Card>
              <Muted>
                {t ? "No hay actividades que coincidan con tu búsqueda." : "No hay actividades semanales."}
              </Muted>
            </Card>
          ) : (
            <View>
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

          {isAdmin && !t && (
            <Pressable onPress={() => router.push("/admin/actividades")} className="mt-4 active:opacity-70">
              <View className="items-center justify-center rounded-2xl border border-dashed border-navy/30 bg-surface/40 px-2 py-6">
                <Ionicons name="repeat-outline" size={24} color={colors.success} />
                <Title className="mt-1 text-center text-base">Nueva actividad</Title>
                <Muted className="text-center">Semanal, día fijo</Muted>
              </View>
            </Pressable>
          )}
        </ScrollView>

        {/* ===== Panel "Eventos": los únicos, con fecha ===== */}
        <ScrollView
          className="flex-1"
          contentContainerStyle={{ padding: 16, paddingBottom: 96 }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          refreshControl={
            <RefreshControl refreshing={eventosQ.isRefetching} onRefresh={onRefresh} />
          }
        >
          <Buscador value={q} onChangeText={setQ} />

          {eventosQ.isLoading ? (
            <Muted>Cargando…</Muted>
          ) : eventosFiltrados.length === 0 ? (
            <Card>
              <Muted>
                {t ? "No hay eventos que coincidan con tu búsqueda." : "No hay eventos vigentes."}
              </Muted>
            </Card>
          ) : (
            <View>
              <Label className="mb-2.5">Próximos eventos</Label>

              {/* Destacado (solo sin búsqueda activa) */}
              {destacado && !t && (
                <Pressable onPress={() => irADetalleEvento(destacado.id)} className="active:opacity-90">
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
                          {aTextoPlano(destacado.descripcion)}
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
                        <LinkAction title="Detalles" onPress={() => irADetalleEvento(destacado.id)} />
                      </View>
                    </View>
                  </Card>
                </Pressable>
              )}

              <View className="gap-3">
                {(t ? eventosFiltrados : restoEventos).map((e) => (
                  <EventoRow key={e.id} e={e} onPress={() => irADetalleEvento(e.id)} />
                ))}
              </View>
            </View>
          )}

          {isAdmin && !t && (
            <Pressable onPress={() => router.push("/admin/eventos")} className="mt-4 active:opacity-70">
              <View className="items-center justify-center rounded-2xl border border-dashed border-navy/30 bg-surface/40 px-2 py-6">
                <Ionicons name="calendar-outline" size={24} color={colors.primaryContainer} />
                <Title className="mt-1 text-center text-base">Nuevo evento</Title>
                <Muted className="text-center">Único, con fecha</Muted>
              </View>
            </Pressable>
          )}
        </ScrollView>
      </Paneles>

      {/* FAB: da de alta lo del panel que estás mirando */}
      {isAdmin && (
        <Pressable
          onPress={() => router.push(tab === "actividades" ? "/admin/actividades" : "/admin/eventos")}
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
    </Screen>
  );
}
