import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useMemo } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { AppBar } from "../../components/AppBar";
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
import { formatHora, formatMoneda, toISODate } from "../../lib/date";
import { colors } from "../../lib/theme";
import { DIAS_SEMANA } from "../../lib/types";
import { useDiscipulados } from "../../lib/queries/discipulados";
import { useEventosVigentes } from "../../lib/queries/eventos";
import { useMiembros } from "../../lib/queries/miembros";
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
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  hint?: string;
  onPress?: () => void;
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
              <Muted className="text-navy">Ver desglose</Muted>
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
  const { profile, isAdmin } = useAuth();
  const nombre = (profile?.nombre_completo ?? "").split(" ")[0] || "hermano";

  const { data: discipulados = [] } = useDiscipulados();
  const { data: eventosVigentes = [] } = useEventosVigentes();
  // Solo actividades/anuncios, sin las reuniones de discipulado (igual que el feed).
  const eventos = eventosVigentes.filter((e) => e.tipo !== "discipulado" && !e.discipulado_id);
  const { data: miembros = [] } = useMiembros();

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
              <Chip tone="gold">Próxima actividad</Chip>
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

        {/* Accesos rápidos */}
        <View className="mb-6 gap-3">
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

        {/* Resumen mensual */}
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
          <StatCard
            icon="people-outline"
            label="Miembros"
            value={String(miembros.length)}
          />
          <StatCard
            icon="calendar-outline"
            label="Actividades vigentes"
            value={String(eventos.length)}
          />
        </View>
      </ScrollView>
    </View>
  );
}
