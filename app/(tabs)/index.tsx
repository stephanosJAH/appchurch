import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useMemo } from "react";
import { Image, Pressable, ScrollView, View } from "react-native";
import { AppBar } from "../../components/AppBar";
import { CumplesSection } from "../../components/Cumples";
import {
  Body,
  Button,
  Card,
  Chip,
  Display,
  Headline,
  Label,
  Muted,
  Title,
} from "../../components/ui";
import { useAuth } from "../../lib/auth";
import { formatFechaLarga, formatHora, formatMoneda, toISODate } from "../../lib/date";
import { colors } from "../../lib/theme";
import { DIAS_SEMANA } from "../../lib/types";
import { useDiscipulados } from "../../lib/queries/discipulados";
import { useEventosVigentes } from "../../lib/queries/eventos";
import { useDirectorio } from "../../lib/queries/directorio";
import { useParticipaciones } from "../../lib/queries/participaciones";
import { useReunionesMes } from "../../lib/queries/reuniones";

function QuickAction({
  icon,
  title,
  subtitle,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle: string;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} className="active:opacity-80">
      <Card className="flex-row items-center gap-3.5 py-4">
        <View className="h-11 w-11 items-center justify-center rounded-full bg-gold-container">
          <Ionicons name={icon} size={20} color={colors.onTertiaryContainer} />
        </View>
        <View className="flex-1">
          <Title className="text-base">{title}</Title>
          <Muted>{subtitle}</Muted>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.outline} />
      </Card>
    </Pressable>
  );
}

function StatCard({
  icon,
  label,
  value,
  hint,
  onPress,
  cta = "Ver desglose",
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  hint?: string;
  onPress?: () => void;
  cta?: string;
}) {
  const inner = (
    <Card>
      <View className="flex-row items-start justify-between">
        <View className="flex-1">
          <Label>{label}</Label>
          <Display className="mt-1">{value}</Display>
          {hint ? (
            <View className="mt-1 flex-row items-center gap-1">
              <Ionicons name="trending-up" size={14} color={colors.tertiary} />
              <Muted className="text-gold">{hint}</Muted>
            </View>
          ) : null}
          {onPress ? (
            <View className="mt-2 flex-row items-center gap-1">
              <Muted className="text-navy">{cta}</Muted>
              <Ionicons name="chevron-forward" size={13} color={colors.primary} />
            </View>
          ) : null}
        </View>
        <View className="h-12 w-12 items-center justify-center rounded-full bg-surface-mid">
          <Ionicons name={icon} size={24} color={colors.primaryContainer} />
        </View>
      </View>
    </Card>
  );
  if (!onPress) return inner;
  return (
    <Pressable onPress={onPress} className="active:opacity-80">
      {inner}
    </Pressable>
  );
}

export default function Dashboard() {
  const router = useRouter();
  const { profile, isAdmin, esObrero } = useAuth();
  const nombre = (profile?.nombre_completo ?? "").split(" ")[0] || "hermano";

  const { data: discipulados = [] } = useDiscipulados();
  const { data: eventosVigentes = [] } = useEventosVigentes();
  // Solo actividades/anuncios, sin las reuniones de discipulado (igual que el feed).
  const eventos = eventosVigentes.filter((e) => e.tipo !== "discipulado" && !e.discipulado_id);
  const { data: directorio = [] } = useDirectorio();
  // Un discipulador lidera a lo sumo un grupo (constraint 1:1); sus "miembros"
  // son las participaciones activas de ese grupo, no el padrón completo.
  const miDiscipulado = discipulados.find((d) => d.discipulador_id === profile?.id);
  const { data: misParticipaciones = [] } = useParticipaciones(
    isAdmin ? "" : miDiscipulado?.id ?? ""
  );

  const { desde, hasta, mesLabel } = useMemo(() => {
    const now = new Date();
    const first = new Date(now.getFullYear(), now.getMonth(), 1);
    const last = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    return {
      desde: toISODate(first),
      hasta: toISODate(last),
      mesLabel: now.toLocaleDateString("es-AR", { month: "long", year: "numeric" }),
    };
  }, []);
  const { data: reunionesMes = [] } = useReunionesMes(desde, hasta);
  // ofrenda_total llega como string (numeric de Postgres): coercionar antes de sumar.
  const ofrendasMes = reunionesMes.reduce((s, r) => s + Number(r.ofrenda_total ?? 0), 0);

  const hoy = new Date().getDay();
  const proximo = useMemo(() => {
    return [...discipulados]
      .map((d) => ({ ...d, offset: (d.dia_semana - hoy + 7) % 7 }))
      .sort((a, b) => a.offset - b.offset || a.hora_inicio.localeCompare(b.hora_inicio))[0];
  }, [discipulados, hoy]);
  // El próximo evento/actividad (eventos ya vienen ordenados por fecha_inicio).
  const proximoEvento = eventos[0];

  // Cumpleaños de toda la congregación (directorio, visible a todo miembro activo).
  const miembrosCumple = directorio;

  return (
    <View className="flex-1 bg-cream">
      <AppBar />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 32 }} showsVerticalScrollIndicator={false}>
        {/* Saludo */}
        <View className="mb-6">
          <Display>Paz sea con vosotros, {nombre}.</Display>
          <Body className="mt-2">
            Bienvenido al panel de gestión de tu congregación.
          </Body>
        </View>

        

        {/* Próxima actividad destacada */}
        {proximo && (
          <Card className="mb-6 overflow-hidden p-0">
            <View className="h-28 justify-end bg-navy p-4">
              <View className="absolute right-4 top-4 opacity-20">
                <Ionicons name="book" size={72} color={colors.tertiaryDim} />
              </View>
              <Chip tone="gold">Tu discipulado</Chip>
            </View>
            <View className="p-5">
              <View className="mb-2 flex-row items-center gap-1.5">
                <Ionicons name="calendar-outline" size={15} color={colors.tertiary} />
                <Muted className="text-gold">
                  {DIAS_SEMANA[proximo.dia_semana]}, {formatHora(proximo.hora_inicio)}
                </Muted>
              </View>
              <Title numberOfLines={2} className="text-xl">
                {proximo.nombre ?? proximo.descripcion_etaria ?? "Discipulado"}
              </Title>
              {proximo.ubicacion ? (
                <Body className="mt-1" numberOfLines={2}>
                  {proximo.ubicacion}
                </Body>
              ) : null}
              <View className="mt-4">
                <Button
                  title="Ver detalles"
                  onPress={() => router.push(`/discipulado/${proximo.id}`)}
                />
              </View>
            </View>
          </Card>
        )}

        {/* Separador de sección */}
        {proximo && proximoEvento && <View className="mb-5 h-px bg-black/10" />}

        {/* Cumpleaños próximos */}
        <CumplesSection miembros={miembrosCumple} titulo="Cumpleaños" className="mb-6" />

        {/* Separador de sección Cumpleaños próximos */}
        {miembrosCumple && <View className="mb-5 h-px bg-black/10" />}

        {/* Próximo evento/actividad */}
        {proximoEvento && (
          <>
          <Label className="mb-2">Eventos</Label>
          <Pressable
            onPress={() => router.push({ pathname: "/actividad/[id]", params: { id: proximoEvento.id } })}
            className="active:opacity-90"
          >
            <Card className="mb-6 overflow-hidden p-0">
              <View className="h-28 justify-end bg-navy p-4">
                {proximoEvento.adjunto_url && proximoEvento.adjunto_tipo === "imagen" ? (
                  <Image
                    source={{ uri: proximoEvento.adjunto_url }}
                    resizeMode="cover"
                    style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, opacity: 0.55 }}
                  />
                ) : (
                  <View className="absolute right-4 top-4 opacity-20">
                    <Ionicons name="megaphone" size={64} color={colors.tertiaryDim} />
                  </View>
                )}
                <Chip tone="gold">Próximo evento</Chip>
              </View>
              <View className="p-5">
                <View className="mb-2 flex-row items-center gap-1.5">
                  <Ionicons name="calendar-outline" size={15} color={colors.tertiary} />
                  <Muted className="capitalize text-gold">
                    {formatFechaLarga(proximoEvento.fecha_inicio)}
                  </Muted>
                </View>
                <Title numberOfLines={2} className="text-xl">
                  {proximoEvento.titulo}
                </Title>
                {proximoEvento.descripcion ? (
                  <Body className="mt-1" numberOfLines={2}>
                    {proximoEvento.descripcion}
                  </Body>
                ) : null}
                {proximoEvento.ubicacion ? (
                  <View className="mt-2 flex-row items-center gap-1">
                    <Ionicons name="location-outline" size={15} color={colors.outline} />
                    <Muted>{proximoEvento.ubicacion}</Muted>
                  </View>
                ) : null}
                <View className="mt-4">
                  <Button
                    title="Ver detalles"
                    onPress={() => router.push({ pathname: "/actividad/[id]", params: { id: proximoEvento.id } })}
                  />
                </View>
              </View>
            </Card>
          </Pressable>
          </>
        )}

        {/* Separador de sección */}
        {proximo && proximoEvento && <View className="mb-5 h-px bg-black/10" />}

        

        {/* Accesos rápidos */}
        <View className="mb-6 gap-3">
          <QuickAction
            icon="people-circle-outline"
            title="Directorio"
            subtitle="Contactos y cumpleaños de la iglesia"
            onPress={() => router.push("/directorio")}
          />
          {/* Registrar reunión es gestión de grupo (RPC valida es_discipulador_de):
              solo obrero/admin, nunca un miembro. */}
          {esObrero && (
            <QuickAction
              icon="add-circle-outline"
              title="Registrar reunión"
              subtitle="Asistencia, ofrenda y tema"
              onPress={() =>
                proximo
                  ? router.push({ pathname: "/reunion/nueva", params: { discipuladoId: proximo.id } })
                  : router.push("/(tabs)/discipulado")
              }
            />
          )}
          {isAdmin && (
            <QuickAction
              icon="megaphone-outline"
              title="Nueva actividad"
              subtitle="Programar evento o reunión"
              onPress={() => router.push("/admin/eventos")}
            />
          )}
          {isAdmin && (
            <QuickAction
              icon="person-add-outline"
              title="Añadir miembro"
              subtitle="Registrar nueva persona"
              onPress={() => router.push("/admin/miembros")}
            />
          )}
        </View>

        {/* Resumen mensual — métricas de gestión (ofrendas, miembros del grupo):
            solo obrero/admin. Un miembro no gestiona grupos ni ve ofrendas; su
            feed queda en eventos, cumpleaños y directorio. */}
        {esObrero && (
          <>
            <View className="mb-3 flex-row items-end justify-between">
              <Headline>Resumen mensual</Headline>
              <Muted className="capitalize">{mesLabel}</Muted>
            </View>
            <View className="gap-3">
              <StatCard
                icon="wallet-outline"
                label="Total ofrendas"
                value={formatMoneda(ofrendasMes)}
                hint={`${reunionesMes.length} reuniones este mes`}
                onPress={() => router.push("/ofrendas")}
              />
              {isAdmin ? (
                <StatCard
                  icon="people-outline"
                  label="Miembros"
                  value={String(directorio.length)}
                />
              ) : (
                <StatCard
                  icon="people-outline"
                  label="Miembros de tu discipulado"
                  value={String(misParticipaciones.length)}
                  onPress={miDiscipulado ? () => router.push(`/discipulado/${miDiscipulado.id}`) : undefined}
                  cta="Ver miembros"
                />
              )}
              <StatCard
                icon="calendar-outline"
                label="Actividades vigentes"
                value={String(eventos.length)}
              />
            </View>
          </>
        )}

      </ScrollView>
    </View>
  );
}
