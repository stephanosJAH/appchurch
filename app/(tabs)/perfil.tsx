import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { Alert, ScrollView, View } from "react-native";
import { AppBar } from "../../components/AppBar";
import { Avatar, Body, Button, Card, Chip, Label, Muted, Title } from "../../components/ui";
import { useAuth } from "../../lib/auth";
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

export default function Perfil() {
  const router = useRouter();
  const { profile, session, isAdmin, signOut } = useAuth();

  const confirmSignOut = () => {
    Alert.alert("Cerrar sesión", "¿Querés salir de tu cuenta?", [
      { text: "Cancelar", style: "cancel" },
      { text: "Salir", style: "destructive", onPress: () => signOut() },
    ]);
  };

  return (
    <View className="flex-1 bg-cream">
      <AppBar />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 32 }} showsVerticalScrollIndicator={false}>
        <Card className="mb-5 items-center py-7">
          <Avatar name={profile?.nombre_completo} size={72} />
          <Title className="mt-3 text-xl">{profile?.nombre_completo ?? "Sin nombre"}</Title>
          <Muted className="mt-0.5">{session?.user.email}</Muted>
          <View className="mt-3">
            <Chip tone={isAdmin ? "gold" : "navy"}>{isAdmin ? "Administrador" : "Discipulador"}</Chip>
          </View>
        </Card>

        {isAdmin && (
          <Card className="mb-5">
            <Label className="mb-1">Administración</Label>
            <Row icon="person-circle-outline" label="Usuarios" onPress={() => router.push("/admin/usuarios")} />
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
