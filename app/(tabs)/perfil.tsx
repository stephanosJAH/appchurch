import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useMemo } from "react";
import { Alert, Pressable, ScrollView, View } from "react-native";
import { AppBar } from "../../components/AppBar";
import { Avatar, Body, Button, Card, Chip, Display, Headline, Label, Muted, Title } from "../../components/ui";
import { useAuth } from "../../lib/auth";
import { formatMoneda, toISODate } from "../../lib/date";
import { usePendientes } from "../../lib/queries/profiles";
import { useDiscipulados } from "../../lib/queries/discipulados";
import { useEventosVigentes } from "../../lib/queries/eventos";
import { useMiembros } from "../../lib/queries/miembros";
import { useParticipaciones } from "../../lib/queries/participaciones";
import { useReunionesMes } from "../../lib/queries/reuniones";
import { colors } from "../../lib/theme";

function Row({
  icon,
  label,
  onPress,
  last,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  last?: boolean;
}) {
  return (
    <View
      className={`flex-row items-center gap-3 py-3.5 active:opacity-70 ${last ? "" : "border-b border-black/5"}`}
      onTouchEnd={onPress}
    >
      <View className="h-9 w-9 items-center justify-center rounded-full bg-surface-mid">
        <Ionicons name={icon} size={18} color={colors.primaryContainer} />
      </View>
      <Body className="flex-1 text-ink">{label}</Body>
      <Ionicons name="chevron-forward" size={18} color={colors.outline} />
    </View>
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

const ROL_LABEL: Record<string, string> = {
  admin: "Administrador",
  obrero: "Obrero",
  miembro: "Miembro",
  pendiente: "Pendiente",
};

export default function Perfil() {
  const router = useRouter();
  const { profile, session, isAdmin, esObrero, signOut } = useAuth();
  const { data: pendientes = [] } = usePendientes(esObrero);
  const rolLabel = ROL_LABEL[profile?.rol ?? ""] ?? "Miembro";

  // Resumen mensual de gestión (ofrendas, miembros del grupo, actividades):
  // solo obrero/admin. Un miembro no gestiona grupos ni ve ofrendas.
  const { data: discipulados = [] } = useDiscipulados();
  const { data: eventosVigentes = [] } = useEventosVigentes();
  // Solo actividades/anuncios, sin las reuniones de discipulado.
  const eventos = eventosVigentes.filter((e) => e.tipo !== "discipulado" && !e.discipulado_id);
  // Padrón completo (no el directorio, que excluye menores y a quienes no
  // tienen fecha de nacimiento cargada).
  const { data: miembros = [] } = useMiembros();
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

  const confirmSignOut = () => {
    Alert.alert("Cerrar sesión", "¿Querés salir de tu cuenta?", [
      { text: "Cancelar", style: "cancel" },
      { text: "Salir", style: "destructive", onPress: () => signOut() },
    ]);
  };

  return (
    <View className="flex-1 bg-cream">
      <AppBar title="Perfil" />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 32 }} showsVerticalScrollIndicator={false}>
        <Card className="mb-5 items-center py-7">
          <Avatar name={profile?.nombre_completo} size={72} />
          <Title className="mt-3 text-xl">{profile?.nombre_completo ?? "Sin nombre"}</Title>
          <Muted className="mt-0.5">{profile?.username ?? session?.user.email}</Muted>
          <View className="mt-3">
            <Chip tone={isAdmin ? "gold" : "navy"}>{rolLabel}</Chip>
          </View>
        </Card>

        <Card className="mb-5">
          <Label className="mb-1">Mi cuenta</Label>
          <Row
            icon="person-outline"
            label="Mis datos personales"
            onPress={() => router.push("/mis-datos")}
            last
          />
        </Card>

        {esObrero && (
          <Card className="mb-5">
            <Label className="mb-1">Aprobaciones</Label>
            <Row
              icon="person-add-outline"
              label={
                pendientes.length > 0
                  ? `Cuentas pendientes (${pendientes.length})`
                  : "Cuentas pendientes"
              }
              onPress={() => router.push("/aprobaciones")}
              last
            />
          </Card>
        )}

        {esObrero && (
          <View className="mb-6">
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
                  value={String(miembros.length)}
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
          </View>
        )}

        {isAdmin && (
          <Card className="mb-5">
            <Label className="mb-1">Administración</Label>
            <Row icon="person-circle-outline" label="Cuentas" onPress={() => router.push("/admin/usuarios")} />
            <Row icon="people-outline" label="Miembros" onPress={() => router.push("/admin/miembros")} />
            <Row icon="git-network-outline" label="Discipulados" onPress={() => router.push("/admin/discipulados")} />
            <Row icon="archive-outline" label="Discipulados dados de baja" onPress={() => router.push("/admin/bajas")} />
            <Row icon="megaphone-outline" label="Actividades / Eventos" onPress={() => router.push("/admin/eventos")} last />
          </Card>
        )}

        <Button title="Cerrar sesión" variant="danger" onPress={confirmSignOut} />
      </ScrollView>
    </View>
  );
}
