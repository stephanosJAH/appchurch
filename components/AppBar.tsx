import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "../lib/auth";
import { contarNoLeidos, useAnuncios } from "../lib/queries/anuncios";
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

// Campana con el contador de anuncios sin leer. El "sin leer" sale de comparar
// `created_at` contra la marca de agua `profiles.anuncios_leidos_hasta` (0026);
// no hay tabla de lecturas. Se apaga sola al entrar a la pantalla de anuncios,
// que corre la marca.
function CampanaAnuncios({ onPress }: { onPress: () => void }) {
  const { profile } = useAuth();
  const { data: anuncios = [] } = useAnuncios();
  const sinLeer = contarNoLeidos(anuncios, profile?.anuncios_leidos_hasta ?? null);

  return (
    <Pressable onPress={onPress} hitSlop={8} className="active:opacity-70">
      <Ionicons name="notifications-outline" size={23} color={colors.onSurface} />
      {sinLeer > 0 ? (
        <View className="absolute -right-1.5 -top-1 min-w-[16px] items-center justify-center rounded-full bg-gold px-1">
          <Text
            style={{ fontFamily: fonts.sansBold }}
            className="text-[10px] leading-4 text-white"
          >
            {sinLeer > 9 ? "9+" : sinLeer}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}

// Barra superior: título de la vista + avatar (→ perfil).
// En el feed (index.tsx), se reemplaza por el selector Inicio/Nosotros
// + campana de anuncios + avatar.
export function AppBar({ title, activeTab, onTabChange }: AppBarProps = {}) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { profile } = useAuth();

  return (
    // La barra es transparente: el degradado del fondo (`FondoDegradado`)
    // tiene que empezar en el borde de la pantalla, no debajo de la barra.
    <View style={{ paddingTop: insets.top + 8 }} className="px-4 pb-3 mt-3">
      {activeTab && onTabChange ? (
        <View className="flex-row items-center justify-between">
          <View className="flex-row items-center gap-7">
            <FeedTabButton label="Inicio" active={activeTab === "inicio"} onPress={() => onTabChange("inicio")} />
            <FeedTabButton label="Nosotros" active={activeTab === "nosotros"} onPress={() => onTabChange("nosotros")} />
          </View>
          <View className="flex-row items-center gap-4">
            <CampanaAnuncios onPress={() => router.push("/anuncios")} />
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
              {title ?? "PDApp"}
            </Text>
            <View className={`absolute -bottom-2 h-[3px] w-full rounded-full bg-gold`} />
          </View>
          {/* <Pressable onPress={() => router.push("/(tabs)/perfil")} className="active:opacity-70">
            <Avatar name={profile?.nombre_completo} size={36} />
          </Pressable> */}
        </View>
      )}
    </View>
  );
}
