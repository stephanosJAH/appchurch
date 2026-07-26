import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "../lib/auth";
import { colors, fonts } from "../lib/theme";
import { Avatar } from "./ui";

export type FeedTab = "inicio" | "nosotros";

type AppBarProps = {
  // Título de la vista (izquierda). Cada tab pasa el suyo:
  // "Calendario general", "Eventos y actividades", "Perfil"…
  title?: string;
  // Cuando se pasan, el header muestra el selector "Inicio"/"Nosotros" del feed
  // en lugar del título + avatar. Solo lo usa app/(tabs)/index.tsx.
  activeTab?: FeedTab;
  onTabChange?: (tab: FeedTab) => void;
};

function FeedTabButton({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} hitSlop={8} className="active:opacity-70">
      <View className="items-center">
        <Text
          style={{ fontFamily: active ? fonts.sansBold : fonts.sansMedium }}
          className={`text-[16px] leading-6 ${active ? "text-ink" : "text-ink-muted"}`}
        >
          {label}
        </Text>
        <View className={`absolute -bottom-2 h-[3px] w-full rounded-full ${active ? "bg-gold" : "bg-line"}`} />
      </View>
    </Pressable>
  );
}

// Barra superior: título de la vista + avatar (→ perfil).
// En el feed (index.tsx), se reemplaza por el selector Inicio/Nosotros
// + campana de notificaciones + avatar.
export function AppBar({ title, activeTab, onTabChange }: AppBarProps = {}) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { profile } = useAuth();

  return (
    <View style={{ paddingTop: insets.top + 8 }} className="bg-cream px-4 pb-3">
      {activeTab && onTabChange ? (
        <View className="flex-row items-center justify-between">
          <View className="flex-row items-center gap-7">
            <FeedTabButton label="Inicio" active={activeTab === "inicio"} onPress={() => onTabChange("inicio")} />
            <FeedTabButton label="Nosotros" active={activeTab === "nosotros"} onPress={() => onTabChange("nosotros")} />
          </View>
          <View className="flex-row items-center gap-4">
            <Pressable hitSlop={8} className="active:opacity-70">
              <Ionicons name="notifications-outline" size={23} color={colors.onSurface} />
            </Pressable>
            {/* <Pressable onPress={() => router.push("/(tabs)/perfil")} className="active:opacity-70">
              <Avatar name={profile?.nombre_completo} size={36} />
            </Pressable> */}
          </View>
        </View>
      ) : (
        <View className="flex-row items-center justify-between">
          <View className="flex-row items-center gap-2">
            {/* <View className="h-8 w-8 items-center justify-center rounded-md bg-navy">
              <MaterialCommunityIcons name="church" size={16} color={colors.tertiaryDim} />
            </View> */}
            {/* Misma tipografía que el selector Inicio/Nosotros del feed */}
            <Text style={{ fontFamily: fonts.sansBold }} className="text-[16px] leading-6 text-ink">
              {title ?? "PDA"}
            </Text>
          </View>
          {/* <Pressable onPress={() => router.push("/(tabs)/perfil")} className="active:opacity-70">
            <Avatar name={profile?.nombre_completo} size={36} />
          </Pressable> */}
        </View>
      )}
    </View>
  );
}
