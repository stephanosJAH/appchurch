import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { Pressable, ScrollView, View } from "react-native";
import { Card, Muted, Title } from "../../components/ui";
import { colors } from "../../lib/theme";

function MenuItem({
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
      <Card className="flex-row items-center gap-3.5">
        <View className="h-11 w-11 items-center justify-center rounded-full bg-gold-container">
          <Ionicons name={icon} size={20} color={colors.onTertiaryContainer} />
        </View>
        <View className="flex-1">
          <Title className="text-base">{title}</Title>
          <Muted>{subtitle}</Muted>
        </View>
        <Ionicons name="chevron-forward" size={20} color={colors.outline} />
      </Card>
    </Pressable>
  );
}

export default function AdminIndex() {
  const router = useRouter();
  return (
    <ScrollView className="flex-1 bg-cream" contentContainerStyle={{ padding: 16, gap: 12 }}>
      <MenuItem
        icon="person-circle-outline"
        title="Usuarios"
        subtitle="Cuentas con login y sus roles"
        onPress={() => router.push("/admin/usuarios")}
      />
      <MenuItem
        icon="people-outline"
        title="Miembros"
        subtitle="Personas de la iglesia (sin login)"
        onPress={() => router.push("/admin/miembros")}
      />
      <MenuItem
        icon="git-network-outline"
        title="Discipulados"
        subtitle="Crear grupos y asignar discipulador"
        onPress={() => router.push("/admin/discipulados")}
      />
      <MenuItem
        icon="archive-outline"
        title="Dados de baja"
        subtitle="Discipulados inactivos · reactivar"
        onPress={() => router.push("/admin/bajas")}
      />
      <MenuItem
        icon="megaphone-outline"
        title="Actividades"
        subtitle="Eventos visibles para todos"
        onPress={() => router.push("/admin/eventos")}
      />
    </ScrollView>
  );
}
