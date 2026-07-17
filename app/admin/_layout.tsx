import { Redirect, Stack } from "expo-router";
import { useAuth } from "../../lib/auth";
import { colors, fonts } from "../../lib/theme";

export default function AdminLayout() {
  const { isAdmin, loading } = useAuth();

  // Guard de cliente (la autorización real la aplica RLS en la base).
  if (!loading && !isAdmin) {
    return <Redirect href="/(tabs)" />;
  }

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.background },
        headerShadowVisible: false,
        headerTitleStyle: { color: colors.primary, fontFamily: fonts.serifSemibold },
        headerTintColor: colors.primary,
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="index" options={{ title: "Administración" }} />
      <Stack.Screen name="usuarios" options={{ title: "Usuarios" }} />
      <Stack.Screen name="miembros" options={{ title: "Miembros" }} />
      <Stack.Screen name="discipulados" options={{ title: "Discipulados" }} />
      <Stack.Screen name="bajas" options={{ title: "Discipulados dados de baja" }} />
      <Stack.Screen name="eventos" options={{ title: "Eventos" }} />
      <Stack.Screen name="actividades" options={{ title: "Actividades semanales" }} />
    </Stack>
  );
}
