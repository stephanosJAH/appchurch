import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "../lib/auth";
import { contarNoLeidos, useAnuncios } from "../lib/queries/anuncios";
import { colors, fonts } from "../lib/theme";
import { Avatar } from "./ui";

export type FeedTab = "inicio" | "nosotros";

export type TabDef<K extends string = string> = { key: K; label: string };

// Las del feed. Son el default para no repetirlas en app/(tabs)/index.tsx.
const TABS_FEED: readonly TabDef<FeedTab>[] = [
  { key: "inicio", label: "Inicio" },
  { key: "nosotros", label: "Nosotros" },
];

type AppBarProps<K extends string> = {
  // Título de la vista (izquierda). Cada tab pasa el suyo:
  // "Calendario general", "Eventos y actividades", "Perfil"…
  title?: string;
  // Cuando se pasan `activeTab`/`onTabChange`, el header muestra un selector de
  // secciones en lugar del título. `tabs` define cuáles; sin él van las del
  // feed. Lo usan app/(tabs)/index.tsx y app/(tabs)/actividades.tsx, siempre
  // acompañado de <Paneles> para que el tap y el desliz muevan lo mismo.
  tabs?: readonly TabDef<K>[];
  activeTab?: K;
  onTabChange?: (tab: K) => void;
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
// Con `activeTab`/`onTabChange` se reemplaza por el selector de secciones
// + campana de anuncios + avatar.
export function AppBar<K extends string = FeedTab>(props: AppBarProps<K> = {}) {
  const { title, activeTab, onTabChange } = props;
  const tabs = (props.tabs ?? TABS_FEED) as readonly TabDef<K>[];
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
            {tabs.map((t) => (
              <FeedTabButton
                key={t.key}
                label={t.label}
                active={activeTab === t.key}
                onPress={() => onTabChange(t.key)}
              />
            ))}
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
              {title ?? "pdapp"}
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
