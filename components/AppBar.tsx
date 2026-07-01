import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "../lib/auth";
import { colors, fonts } from "../lib/theme";
import { Avatar } from "./ui";

// Barra superior de marca: emblema + nombre (serif) + avatar (→ perfil).
export function AppBar() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { profile } = useAuth();

  return (
    <View style={{ paddingTop: insets.top + 8 }} className="bg-cream px-4 pb-3">
      <View className="flex-row items-center justify-between">
        <View className="flex-row items-center gap-2">
          <View className="h-8 w-8 items-center justify-center rounded-md bg-navy">
            <MaterialCommunityIcons name="church" size={16} color={colors.tertiaryDim} />
          </View>
          <Text style={{ fontFamily: fonts.serifBold }} className="text-lg text-navy">
            PDA
          </Text>
        </View>
        <Pressable onPress={() => router.push("/(tabs)/perfil")} className="active:opacity-70">
          <Avatar name={profile?.nombre_completo} size={36} />
        </Pressable>
      </View>
    </View>
  );
}
