import { Ionicons } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, fonts } from "../../lib/theme";

// Desde RN 0.88 el `color` que pasa la tab es un ColorValue (admite number y
// null), pero Ionicons solo acepta string. Las tints de arriba son strings.
const icono =
  (name: keyof typeof Ionicons.glyphMap) =>
  ({ color, size }: { color: unknown; size: number }) => (
    <Ionicons name={name} color={color as string} size={size - 2} />
  );

export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  const bottomPad = Math.max(insets.bottom, 8);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.outline,
        tabBarLabelStyle: { fontFamily: fonts.sansMedium, fontSize: 11 },
        tabBarStyle: {
          backgroundColor: colors.surfaceContainerLowest,
          borderTopColor: "rgba(26,43,68,0.08)",
          height: 54 + bottomPad,
          paddingTop: 6,
          paddingBottom: bottomPad,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Inicio",
          tabBarIcon: icono("grid-outline"),
        }}
      />
      <Tabs.Screen
        name="calendario"
        options={{
          title: "Calendario",
          tabBarIcon: icono("calendar-outline"),
        }}
      />
      <Tabs.Screen
        name="discipulado"
        options={{
          title: "Mi discipulado",
          tabBarIcon: icono("people-outline"),
        }}
      />
      <Tabs.Screen
        name="actividades"
        options={{
          title: "Actividades",
          tabBarIcon: icono("megaphone-outline"),
        }}
      />
      <Tabs.Screen
        name="perfil"
        options={{
          title: "Perfil",
          tabBarIcon: icono("person-outline"),
        }}
      />
    </Tabs>
  );
}
